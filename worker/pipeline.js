/**
 * worker/pipeline.js — DEPRECATED — DO NOT USE FOR NEW SCAN PATHS.
 *
 * This file contains a legacy classify() implementation that pre-dates the
 * improved classifier in worker/index.js. It has no conflict penalty, no
 * determineReviewNeed() logic, always writes documentSubtype = null, and uses
 * a flat confidenceScore < threshold for review queue (rather than the
 * rule-based review decision). Records written by this path carry
 * classifier_version 'v2.0-worker' but have lower label quality.
 *
 * All active scan and reclassify paths now go through worker/index.js.
 * This file is retained for reference only and MUST NOT be invoked from index.js.
 */

const { v4: uuidv4 } = require('uuid');
const { resolveFileType, analyzePathContext, analyzeFilename } = require('./analyzer');
const { extractContent } = require('./extractor');
const { config } = require('./config');
const db = require('./db');
const logger = require('./logger');

/**
 * Process a single file through the full understanding pipeline.
 * @param {object} fileInfo — scanner output
 * @param {object} options — { jobId, existingId, incremental }
 */
async function processFile(fileInfo, options = {}) {
    const fileId = options.existingId || uuidv4();
    const understandingId = uuidv4();

    try {
        // ── Layer 1: File metadata ───────────────────────────────────
        const typeInfo = resolveFileType(fileInfo.extension);

        const fileRecord = await db.upsertFileRecord({
            id:              fileId,
            filename:        fileInfo.filename,
            extension:       fileInfo.extension,
            mimeType:        typeInfo.mime,
            sizeBytes:       fileInfo.sizeBytes,
            absolutePath:    fileInfo.absolutePath,
            relativePath:    fileInfo.relativePath,
            parentPath:      fileInfo.parentPath,
            createdAtSource: fileInfo.createdAtSource,
            updatedAtSource: fileInfo.updatedAtSource,
        });

        // ── Layer 2: Path context ────────────────────────────────────
        const pathCtx = analyzePathContext(fileInfo.relativePath);

        // ── Layer 3: Filename analysis ───────────────────────────────
        const fnCtx = analyzeFilename(fileInfo.filename);

        // ── Layer 4: Content extraction ──────────────────────────────
        let extraction = null;
        if (typeInfo.extractable && fileInfo.absolutePath) {
            try {
                extraction = await extractContent(fileInfo.absolutePath, fileInfo.extension);

                if (extraction.extractionStatus !== 'skipped') {
                    await db.upsertExtractedContent({
                        id:               uuidv4(),
                        fileRecordId:     fileId,
                        extractionType:   extraction.extractionType,
                        rawText:          extraction.rawText,
                        cleanedText:      extraction.cleanedText,
                        previewText:      extraction.previewText,
                        pageCount:        extraction.pageCount,
                        extractionStatus: extraction.extractionStatus,
                        extractionNotes:  extraction.extractionNotes,
                    });
                }
            } catch (err) {
                logger.warn(`Content extraction failed for ${fileInfo.filename}: ${err.message}`);
                extraction = null;
            }
        }

        // ── Layer 5: Classification ──────────────────────────────────
        const classification = classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo });

        await db.upsertUnderstanding({
            id:                      understandingId,
            fileRecordId:            fileId,
            understandingLevel:      classification.understandingLevel,
            detectedClient:          classification.client,
            detectedProject:         classification.project,
            detectedCampaign:        classification.campaign,
            detectedDepartment:      classification.department,
            detectedDocumentType:    classification.documentType,
            detectedDocumentSubtype: null,
            detectedYear:            classification.year,
            detectedMonth:           classification.month,
            detectedLocation:        classification.location,
            detectedMediaType:       typeInfo.category,
            detectedVersion:         classification.version,
            detectedStatus:          classification.status,
            shortSummary:            classification.summary,
            extractedTextPreview:    extraction?.previewText || null,
            confidenceScore:         classification.confidenceScore,
            confidenceReason:        classification.confidenceReason,
            classifierVersion:       'v2.0-worker',
            requiresReview:          classification.confidenceScore < config.confidenceThreshold,
        });

        // ── Review queue ─────────────────────────────────────────────
        if (classification.confidenceScore < config.confidenceThreshold) {
            await db.upsertReviewItem({
                id:              uuidv4(),
                fileRecordId:    fileId,
                reviewReason:    classification.confidenceScore < 0.3 ? 'very_low_confidence' : 'low_confidence',
                suggestedLabels: {
                    client: classification.client,
                    project: classification.project,
                    documentType: classification.documentType,
                },
                confidenceScore: classification.confidenceScore,
                status:          'pending',
            });
        }

        return { fileId, confidence: classification.confidenceScore, level: classification.understandingLevel };

    } catch (err) {
        await db.logError({
            jobId:        options.jobId || null,
            fileRecordId: fileId,
            filePath:     fileInfo.absolutePath || fileInfo.relativePath,
            errorType:    'processing_error',
            errorMessage: err.message,
            stackTrace:   err.stack,
        });
        throw err;
    }
}

/**
 * Merge signals from all layers into a final classification.
 */
function classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo }) {
    const reasons = [];

    const client = pathCtx.client || fnCtx.likelyClient || null;
    const project = pathCtx.project || null;
    const campaign = pathCtx.campaign || null;
    const department = pathCtx.department || null;
    const documentType = pathCtx.documentType || fnCtx.likelyType || null;
    const version = fnCtx.version || null;
    const status = fnCtx.status || null;
    const year = pathCtx.year || fnCtx.date?.year || null;
    const month = pathCtx.month || fnCtx.date?.month || null;
    const location = pathCtx.location || null;

    let totalConf = 0;
    totalConf += pathCtx.pathConfidence * 0.5;   // 50% weight
    totalConf += fnCtx.filenameConfidence * 0.3;  // 30% weight

    if (extraction && extraction.extractionStatus === 'completed' && extraction.cleanedText) {
        totalConf += 0.2;  // 20% weight
        reasons.push('Content extracted');
    }

    reasons.push(...(pathCtx.pathReasons || []));
    reasons.push(...(fnCtx.filenameReasons || []));

    const confidenceScore = Math.min(Math.max(Math.round(totalConf * 100) / 100, 0), 1);
    const confidenceReason = reasons.length > 0 ? reasons.join('; ') : 'No strong signals found';

    let understandingLevel = 'metadata_only';
    if (extraction && extraction.extractionStatus === 'completed' && extraction.cleanedText) {
        understandingLevel = 'content_understood';
    } else if (client || project || documentType) {
        understandingLevel = 'filename_path_inferred';
    }
    if (confidenceScore < 0.3) understandingLevel = 'needs_review';

    // Summary
    const parts = [];
    if (documentType) parts.push(documentType.replace(/_/g, ' '));
    if (client) parts.push(`for ${client}`);
    if (project) parts.push(`(${project})`);
    if (status) parts.push(`— ${status}`);
    const summary = parts.length > 0 ? parts.join(' ') : `${typeInfo.category} file: ${fileInfo.filename}`;

    return { client, project, campaign, department, documentType, version, status, year, month, location, summary, confidenceScore, confidenceReason, understandingLevel };
}

module.exports = { processFile };

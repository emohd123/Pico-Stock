/**
 * worker/index.js — CLI entrypoint for the pCloud local indexing worker.
 * OPTIMIZED: Processes files in bulk batches for speed.
 *
 * Commands:
 *   node worker/index.js check                         — verify P:\ drive access
 *   node worker/index.js scan                          — full scan + index
 *   node worker/index.js scan --incremental            — skip unchanged files
 *   node worker/index.js scan --limit 500              — limit files scanned
 *   node worker/index.js scan --folder "Projects"      — scan specific subfolder
 *   node worker/index.js reclassify                    — reclassify existing indexed DB records only
 *   node worker/index.js process-file "path\to\file"  — test extraction on single file
 *   node worker/index.js reset                         — delete all pCloud data
 */

const { config, validate } = require('./config');
const { checkDriveAccess } = require('./drive');
const { scanInBatches } = require('./scanner');
const { resolveFileType, analyzePathContext, analyzeFilename } = require('./analyzer');
const { extractContent } = require('./extractor');
const {
    isSystemFilename,
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
} = require('./normalization');
const db = require('./db');
const logger = require('./logger');
const { analyzeWithBrain } = require('./brain');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');

const FILE_NAMESPACE = '5a8d1c13-f458-4325-a229-7d7ab66d35f1';
const UNDERSTANDING_NAMESPACE = '07cc4a28-cbde-4ca4-b882-499c6d269f31';
const EXTRACTION_NAMESPACE = '6c9f6cdf-3600-4734-aed0-3f60f8f5b6ab';
const REVIEW_NAMESPACE = 'e04f6b69-0a07-44cb-a757-1d8eb6d8ccac';
let activeJobId = null;
let activeJobLabel = '';
let shuttingDown = false;

async function failActiveJob(reason) {
    if (!activeJobId || shuttingDown) return;
    shuttingDown = true;
    try {
        await db.updateJob(activeJobId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            notes: `${activeJobLabel || 'Worker job'} interrupted: ${reason}`,
        });
    } catch (error) {
        logger.error(`Failed to mark active job as failed: ${error.message}`);
    }
}

process.on('SIGINT', async () => {
    await failActiveJob('SIGINT');
    process.exit(1);
});

process.on('SIGTERM', async () => {
    await failActiveJob('SIGTERM');
    process.exit(1);
});

process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught exception: ${error.message}`);
    await failActiveJob(`uncaughtException: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', async (error) => {
    const message = error && error.message ? error.message : String(error);
    logger.error(`Unhandled rejection: ${message}`);
    await failActiveJob(`unhandledRejection: ${message}`);
    process.exit(1);
});

// ─── CLI Argument Parsing ────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] || 'help';
const flags = new Set(args.filter(a => a.startsWith('--') || a.startsWith('-')));
const isIncremental = flags.has('--incremental') || flags.has('-i');
const useBrain = flags.has('--brain');

// Parse --limit N
let maxFilesOverride = null;
const limitIdx = args.indexOf('--limit');
if (limitIdx >= 0 && args[limitIdx + 1]) {
    maxFilesOverride = parseInt(args[limitIdx + 1], 10);
}

// Parse --folder "subfolder"
let folderOverride = null;
const folderIdx = args.indexOf('--folder');
if (folderIdx >= 0 && args[folderIdx + 1]) {
    folderOverride = args[folderIdx + 1];
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
    console.log();
    console.log('═══════════════════════════════════════════');
    console.log('  ☁️  pCloud Local Indexing Worker');
    console.log('═══════════════════════════════════════════');
    console.log();

    const { valid, errors } = validate();
    if (!valid) { for (const e of errors) logger.error(e); process.exit(1); }
    logger.info(`Source root: ${config.sourceRoot}`);
    logger.info(`Supabase URL: ${config.supabaseUrl}`);

    switch (command) {
        case 'check': return await cmdCheck();
        case 'scan':  return await cmdScan();
        case 'reclassify': return await cmdReclassify();
        case 'reset': return await cmdReset();
        case 'process-file': return await cmdProcessFile();
        default:      printHelp();
    }
}

// ─── CHECK ───────────────────────────────────────────────────────────────

async function cmdCheck() {
    logger.info('Checking drive access...');
    const result = checkDriveAccess(config.sourceRoot);
    if (result.accessible) {
        logger.success(result.message);
    } else {
        logger.error(result.message);
        process.exit(1);
    }

    logger.info('Testing Supabase connection...');
    try {
        const { count, error } = await db.supabase
            .from('pcloud_file_records')
            .select('*', { count: 'exact', head: true });
        if (error) throw error;
        logger.success(`Supabase connected. ${count || 0} existing file records.`);
    } catch (err) {
        logger.error(`Supabase connection failed: ${err.message}`);
        process.exit(1);
    }
    logger.success('All checks passed!');
}

// ─── SCAN ────────────────────────────────────────────────────────────────

async function cmdScan() {
    const maxFiles = maxFilesOverride || config.maxFiles;
    const mode = isIncremental ? 'INCREMENTAL' : 'FULL';

    // Determine scan root (support --folder subfolder targeting)
    const path = require('path');
    let scanRoot = config.sourceRoot;
    if (folderOverride) {
        scanRoot = path.join(config.sourceRoot, folderOverride);
        logger.info(`Targeting subfolder: ${folderOverride}`);
    }
    logger.info(`Starting ${mode} scan of "${scanRoot}" (max ${maxFiles} files)...`);

    // 1. Verify drive
    const driveCheck = checkDriveAccess(scanRoot);
    if (!driveCheck.accessible) { logger.error(driveCheck.message); process.exit(1); }
    logger.success(driveCheck.message);

    // 2. Create job
    const job = await db.createJob(mode.toLowerCase() + '_scan', scanRoot);
    activeJobId = job.id;
    activeJobLabel = `${mode} scan`;
    logger.info(`Job: ${job.id}`);

    // 3. Scan — relative paths are always relative to the MAIN sourceRoot
    logger.info('Scanning file system...');
    const { batches, totalFound } = scanInBatches(scanRoot, {
        batchSize: config.batchSize,
        maxFiles,
        rootForRelative: config.sourceRoot,  // always relative to P:\
    });
    logger.success(`Found ${totalFound} files in ${batches.length} batches`);
    await db.updateJob(job.id, { totalFiles: totalFound });

    // 4. Process batches
    let processedCount = 0;
    let errorCount = 0;

    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const batchLabel = `Batch ${bi + 1}/${batches.length}`;

        try {
            if (isIncremental) {
                const result = await processIncrementalBatch(batch, job.id);
                processedCount += result.indexed;
                errorCount += result.failed;
            } else {
                const result = await processFullBatch(batch, job.id);
                processedCount += result.indexed;
                errorCount += result.failed;
            }
        } catch (err) {
            logger.error(`${batchLabel} failed: ${err.message}`);
            errorCount += batch.length;
        }

        // Progress
        const counts = logger.getCounts();
        logger.progress(counts.total, totalFound, batchLabel);

        // Update job every 5 batches
        if ((bi + 1) % 5 === 0 || bi === batches.length - 1) {
            await db.updateJob(job.id, { processedFiles: processedCount, errorCount });
        }
    }

    // 5. Complete
    await db.updateJob(job.id, {
        status: 'completed',
        processedFiles: processedCount,
        errorCount,
        completedAt: new Date().toISOString(),
        notes: `${mode}: ${totalFound} found, ${processedCount} indexed, ${logger.getCounts().skipped} skipped, ${errorCount} errors`,
    });
    activeJobId = null;
    activeJobLabel = '';

    logger.newline();
    logger.summary();
    logger.success('Scan complete! View results at /admin/pcloud');
}

async function cmdReclassify() {
    const batchSize = maxFilesOverride || config.batchSize;
    logger.info(`Starting DB-only reclassification in batches of ${batchSize}...`);

    const totalFiles = await db.countActiveFileRecords();
    logger.success(`Found ${totalFiles} indexed active files to reclassify.`);

    const job = await db.createJob('reclassify', 'database_only');
    activeJobId = job.id;
    activeJobLabel = 'reclassify';
    await db.updateJob(job.id, { totalFiles });

    let processedCount = 0;
    let errorCount = 0;

    for (let offset = 0; offset < totalFiles; offset += batchSize) {
        const fileRows = await db.getIndexedFilesBatch(offset, batchSize);
        const fileIds = fileRows.map((row) => row.id);

        const [existingUnderstandings, extractedContentMap, pendingReviewItems] = await Promise.all([
            db.getUnderstandingsByFileIds(fileIds),
            db.getExtractedContentByFileIds(fileIds),
            db.getPendingReviewItemsByFileIds(fileIds),
        ]);

        const understandings = [];
        const reviewItems = [];
        const autoResolvedReviewFileIds = [];

        for (const row of fileRows) {
            try {
                const fileInfo = {
                    filename: row.filename,
                    extension: row.extension,
                    absolutePath: row.absolute_path,
                    relativePath: row.relative_path,
                    parentPath: row.parent_path,
                    sizeBytes: Number(row.size_bytes) || 0,
                    createdAtSource: row.created_at_source,
                    updatedAtSource: row.updated_at_source,
                };

                const typeInfo = resolveFileType(row.extension);
                const pathCtx = analyzePathContext(row.relative_path);
                const fnCtx = analyzeFilename(row.filename);
                const extractedRow = extractedContentMap[row.id];
                const extraction = extractedRow ? {
                    extractionType: extractedRow.extraction_type,
                    rawText: extractedRow.raw_text,
                    cleanedText: extractedRow.cleaned_text,
                    previewText: extractedRow.preview_text,
                    pageCount: extractedRow.page_count,
                    extractionStatus: extractedRow.extraction_status,
                    extractionNotes: extractedRow.extraction_notes,
                } : null;

                const cls = await classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo });
                const existingUnderstanding = existingUnderstandings[row.id];

                understandings.push({
                    id: existingUnderstanding?.id || uuidv5(`${row.relative_path}::understanding`, UNDERSTANDING_NAMESPACE),
                    fileRecordId: row.id,
                    understandingLevel: cls.understandingLevel,
                    detectedClient: cls.client,
                    detectedProject: cls.project,
                    detectedCampaign: cls.campaign,
                    detectedDepartment: cls.department,
                    detectedDocumentType: cls.documentType,
                    detectedDocumentSubtype: cls.documentSubtype,
                    detectedYear: cls.year,
                    detectedMonth: cls.month,
                    detectedLocation: cls.location,
                    detectedMediaType: typeInfo.category,
                    detectedVersion: cls.version,
                    detectedStatus: cls.status,
                    shortSummary: cls.summary,
                    extractedTextPreview: extraction?.previewText || existingUnderstanding?.extracted_text_preview || null,
                    confidenceScore: cls.confidenceScore,
                    confidenceReason: cls.confidenceReason,
                    requiresReview: cls.requiresReview,
                });

                if (cls.requiresReview) {
                    reviewItems.push({
                        id: pendingReviewItems[row.id]?.id || uuidv5(`${row.relative_path}::review`, REVIEW_NAMESPACE),
                        fileRecordId: row.id,
                        reviewReason: cls.reviewReason || 'low_confidence',
                        suggestedLabels: {
                            client: cls.client,
                            project: cls.project,
                            documentType: cls.documentType,
                        },
                        confidenceScore: cls.confidenceScore,
                    });
                } else {
                    autoResolvedReviewFileIds.push(row.id);
                }

                processedCount += 1;
            } catch (err) {
                errorCount += 1;
                await db.logError({
                    jobId: job.id,
                    fileRecordId: row.id,
                    filePath: row.relative_path,
                    errorType: 'reclassification',
                    errorMessage: err.message,
                });
            }
        }

        if (understandings.length) await db.bulkUpsertUnderstandings(understandings);
        if (reviewItems.length) await db.bulkUpsertReviewItems(reviewItems);
        if (autoResolvedReviewFileIds.length) await db.resolvePendingReviewItemsForFileIds(autoResolvedReviewFileIds);

        await db.updateJob(job.id, {
            processedFiles: processedCount,
            errorCount,
        });
        logger.progress(processedCount + errorCount, totalFiles, 'Reclassifying indexed records');
    }

    await db.updateJob(job.id, {
        status: 'completed',
        processedFiles: processedCount,
        errorCount,
        completedAt: new Date().toISOString(),
        notes: `Reclassified ${processedCount} indexed files without rescanning source files`,
    });
    activeJobId = null;
    activeJobLabel = '';

    logger.newline();
    logger.success(`Reclassification complete: ${processedCount} updated, ${errorCount} errors.`);
}

/**
 * Process a full batch — analyze ALL files and bulk-write to Supabase.
 * Content extraction only for extractable types.
 */
async function processFullBatch(batch, jobId) {
    const existingRecords = await db.getExistingRecordsByPaths(batch.map((file) => file.relativePath));
    const fileRecords = [];
    const understandings = [];
    const reviewItems = [];
    const autoResolvedReviewFileIds = [];
    let indexed = 0;
    let failed = 0;

    for (const fileInfo of batch) {
        try {
            const existingRecord = existingRecords[fileInfo.relativePath];
            const fileId = existingRecord?.id || uuidv5(fileInfo.relativePath, FILE_NAMESPACE);
            const typeInfo = resolveFileType(fileInfo.extension);
            const pathCtx = analyzePathContext(fileInfo.relativePath);
            const fnCtx = analyzeFilename(fileInfo.filename);

            // Content extraction (only for extractable types)
            let extraction = null;
            if (typeInfo.extractable && fileInfo.absolutePath) {
                try {
                    extraction = await extractContent(fileInfo.absolutePath, fileInfo.extension);
                    if (extraction.extractionStatus !== 'skipped' && extraction.rawText) {
                        await db.upsertExtractedContent({
                            id: uuidv5(`${fileInfo.relativePath}::content`, EXTRACTION_NAMESPACE), fileRecordId: fileId,
                            extractionType: extraction.extractionType,
                            rawText: extraction.rawText, cleanedText: extraction.cleanedText,
                            previewText: extraction.previewText, pageCount: extraction.pageCount,
                            extractionStatus: extraction.extractionStatus,
                            extractionNotes: extraction.extractionNotes,
                        });
                    }
                } catch { extraction = null; }
            }

            // Classification
            const cls = await classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo });

            fileRecords.push({
                id: fileId, filename: fileInfo.filename, extension: fileInfo.extension,
                mimeType: typeInfo.mime, sizeBytes: fileInfo.sizeBytes,
                absolutePath: fileInfo.absolutePath, relativePath: fileInfo.relativePath,
                parentPath: fileInfo.parentPath,
                createdAtSource: fileInfo.createdAtSource, updatedAtSource: fileInfo.updatedAtSource,
            });

            understandings.push({
                id: uuidv5(`${fileInfo.relativePath}::understanding`, UNDERSTANDING_NAMESPACE), fileRecordId: fileId,
                understandingLevel: cls.understandingLevel,
                detectedClient: cls.client, detectedProject: cls.project,
                detectedCampaign: cls.campaign, detectedDepartment: cls.department,
                detectedDocumentType: cls.documentType, detectedYear: cls.year,
                detectedMonth: cls.month, detectedLocation: cls.location,
                detectedDocumentSubtype: cls.documentSubtype,
                detectedMediaType: typeInfo.category, detectedVersion: cls.version,
                detectedStatus: cls.status, shortSummary: cls.summary,
                extractedTextPreview: extraction?.previewText || null,
                confidenceScore: cls.confidenceScore, confidenceReason: cls.confidenceReason,
                requiresReview: cls.requiresReview,
            });

            if (cls.requiresReview) {
                reviewItems.push({
                    id: uuidv5(`${fileInfo.relativePath}::review`, REVIEW_NAMESPACE), fileRecordId: fileId,
                    reviewReason: cls.reviewReason || 'low_confidence',
                    suggestedLabels: { client: cls.client, project: cls.project, documentType: cls.documentType },
                    confidenceScore: cls.confidenceScore,
                });
            } else {
                autoResolvedReviewFileIds.push(fileId);
            }

            logger.countIndexed();
            indexed++;
        } catch (err) {
            logger.countFailed();
            failed++;
            await db.logError({ jobId, filePath: fileInfo.relativePath, errorType: 'processing', errorMessage: err.message });
        }
    }

    // Bulk write to Supabase (3 calls instead of N*3)
    if (fileRecords.length) await db.bulkUpsertFileRecords(fileRecords);
    if (understandings.length) await db.bulkUpsertUnderstandings(understandings);
    if (reviewItems.length) await db.bulkUpsertReviewItems(reviewItems);
    if (autoResolvedReviewFileIds.length) await db.resolvePendingReviewItemsForFileIds(autoResolvedReviewFileIds);

    return { indexed, failed };
}

/**
 * Process an incremental batch — check which files changed, skip unchanged, process rest.
 */
async function processIncrementalBatch(batch, jobId) {
    // Fetch existing records for all paths in this batch
    const paths = batch.map(f => f.relativePath);
    const existing = await db.getExistingRecordsByPaths(paths);

    const toProcess = [];
    const toSkipIds = [];

    for (const fileInfo of batch) {
        const ex = existing[fileInfo.relativePath];
        if (ex && ex.sizeBytes === fileInfo.sizeBytes && ex.updatedAtSource === fileInfo.updatedAtSource) {
            toSkipIds.push(ex.id);
            logger.countSkipped();
        } else {
            toProcess.push({ ...fileInfo, existingId: ex?.id || null });
        }
    }

    // Touch last_seen for skipped files
    if (toSkipIds.length) await db.touchLastSeenBulk(toSkipIds);

    // Process changed/new files
    if (toProcess.length) {
        return await processFullBatch(toProcess, jobId);
    }

    return { indexed: 0, failed: 0 };
}

// ─── Classification ──────────────────────────────────────────────────────

async function classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo }) {
    let brainResult = null;
    if (useBrain && extraction?.previewText && typeInfo.category !== 'ignored') {
        brainResult = await analyzeWithBrain(extraction.previewText, fileInfo.filename, fileInfo.relativePath || fileInfo.filename);
        if (brainResult) {
            logger.info(`  🧠 Brain analyzed: ${fileInfo.filename} -> ${brainResult.client || '(no client)'} / ${brainResult.project || '(no project)'}`);
        }
    }
    const reasons = [];
    let totalConfidence = 0.05;
    let conflictPenalty = 0;

    if (typeInfo.category === 'ignored' || isSystemFilename(fileInfo.filename)) {
        return {
            client: null,
            project: null,
            campaign: null,
            department: pathCtx.department || null,
            documentType: 'ignored',
            documentSubtype: typeInfo.category === 'ignored' ? typeInfo.category : 'system_file',
            version: null,
            status: null,
            year: pathCtx.year || null,
            month: pathCtx.month || null,
            location: pathCtx.location || null,
            summary: `Ignored system file: ${fileInfo.filename}`,
            confidenceScore: 0.99,
            confidenceReason: 'Ignored file type or system filename',
            understandingLevel: 'ignored',
            requiresReview: false,
            reviewReason: null,
        };
    }

    const contentSignals = analyzeExtractedSignals(extraction, typeInfo.category);

    // Merge entities (Brain preferred if available)
    const client = brainResult?.client || pathCtx.client || (fnCtx.clientConfidence >= 0.08 ? normalizeClientLabel(fnCtx.likelyClient) : null) || null;
    const project = brainResult?.project || pathCtx.project || (fnCtx.projectConfidence >= 0.1 ? normalizeProjectLabel(fnCtx.likelyProject) : null) || null;
    const campaign = pathCtx.campaign || null;
    const department = pathCtx.department || null;
    const documentType = chooseDocumentType(brainResult?.documentType || pathCtx.documentType, fnCtx.likelyType, contentSignals.documentType, typeInfo.category);
    const documentSubtype = pathCtx.documentSubtype || fnCtx.likelySubtype || contentSignals.documentSubtype || null;
    const version = fnCtx.version || null;
    const status = fnCtx.status || null;
    const year = pathCtx.year || fnCtx.date?.year || null;
    const month = pathCtx.month || fnCtx.date?.month || null;
    const location = pathCtx.location || null;

    totalConfidence += pathCtx.pathConfidence * 0.52;
    totalConfidence += fnCtx.filenameConfidence * 0.24;
    totalConfidence += contentSignals.confidenceBoost;

    if (brainResult) {
        // Brain signals are high weight (0.35) if they exist
        totalConfidence += (brainResult.confidence || 0.5) * 0.35;
        reasons.push(`Brain analysis: ${brainResult.summary}`);
    }

    if (pathCtx.trustedStructure) {
        totalConfidence += 0.08;
        reasons.push('Trusted business folder structure');
    }
    if (pathCtx.hasTrustedClient) totalConfidence += 0.06;
    if (pathCtx.hasTrustedProject) totalConfidence += 0.06;

    if (documentType && pathCtx.documentType && fnCtx.likelyType && pathCtx.documentType === fnCtx.likelyType) {
        totalConfidence += 0.06;
        reasons.push('Path and filename agree on document type');
    }
    if (documentType && contentSignals.documentType && documentType === contentSignals.documentType) {
        totalConfidence += 0.05;
        reasons.push('Extracted text supports the document type');
    }

    if (pathCtx.documentType && fnCtx.likelyType && pathCtx.documentType !== fnCtx.likelyType) {
        conflictPenalty += 0.08;
        reasons.push('Filename and path give different document type hints');
    }
    if (extraction && extraction.extractionStatus === 'failed' && !pathCtx.trustedStructure) {
        conflictPenalty += 0.07;
        reasons.push('Extraction failed without trusted path context');
    }
    if ((fnCtx.isCameraStyle || fnCtx.isScannerStyle) && !pathCtx.trustedStructure && !documentType) {
        conflictPenalty += 0.08;
        reasons.push('Camera/scanner style filename without trusted folder context');
    }

    reasons.push(...(pathCtx.pathReasons || []), ...(fnCtx.filenameReasons || []), ...(contentSignals.reasons || []));

    const confidenceScore = Math.min(Math.max(totalConfidence - conflictPenalty, 0), 0.98);
    const confidenceReason = reasons.join('; ') || 'No strong signals';

    let understandingLevel = 'metadata_only';
    if (contentSignals.materiallyHelped && confidenceScore >= 0.56) {
        understandingLevel = 'content_understood';
    } else if ((client || project || documentType) && confidenceScore >= 0.48) {
        understandingLevel = 'filename_path_inferred';
    }

    const reviewDecision = determineReviewNeed({
        confidenceScore,
        client,
        project,
        documentType,
        pathCtx,
        fnCtx,
        extraction,
        typeInfo,
    });
    if (reviewDecision.requiresReview) {
        understandingLevel = 'needs_review';
    }

    const parts = [];
    if (documentType) parts.push(documentType.replace(/_/g, ' '));
    if (client) parts.push(`for ${client}`);
    if (project) parts.push(`(${project})`);
    if (status) parts.push(`- ${status}`);
    const summary = brainResult?.summary || (parts.length > 0 ? parts.join(' ') : `${typeInfo.category} file: ${fileInfo.filename}`);

    return {
        client,
        project,
        campaign,
        department,
        documentType,
        documentSubtype,
        version,
        status,
        year,
        month,
        location,
        summary,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        confidenceReason,
        understandingLevel,
        requiresReview: reviewDecision.requiresReview,
        reviewReason: reviewDecision.reviewReason,
    };
}

function analyzeExtractedSignals(extraction, mediaCategory) {
    if (!extraction || extraction.extractionStatus !== 'completed' || !extraction.cleanedText) {
        return {
            documentType: null,
            documentSubtype: null,
            confidenceBoost: 0,
            materiallyHelped: false,
            reasons: extraction && extraction.extractionStatus === 'failed' ? ['Content extraction failed'] : [],
        };
    }

    const text = extraction.cleanedText.slice(0, 4000).toLowerCase();
    const candidateKeywords = ['quotation', 'quote', 'boq', 'estimate', 'contract', 'agreement', 'presentation', 'render', 'report', 'minutes', 'brief', 'schedule', 'scope'];

    for (const keyword of candidateKeywords) {
        if (text.includes(keyword)) {
            return {
                documentType: normalizeDocumentType(keyword, mediaCategory),
                documentSubtype: keyword,
                confidenceBoost: 0.18,
                materiallyHelped: true,
                reasons: [`Extracted text contains "${keyword}"`],
            };
        }
    }

    return {
        documentType: null,
        documentSubtype: null,
        confidenceBoost: 0.04,
        materiallyHelped: false,
        reasons: ['Content extracted but no strong business keywords were found'],
    };
}

function chooseDocumentType(pathType, filenameType, contentType, mediaCategory) {
    return pathType || (filenameType && contentType && filenameType === contentType ? filenameType : null) || filenameType || contentType || normalizeDocumentType(null, mediaCategory);
}

function determineReviewNeed({ confidenceScore, client, project, documentType, pathCtx, fnCtx, extraction, typeInfo }) {
    if (typeInfo.category === 'ignored') {
        return { requiresReview: false, reviewReason: null };
    }
    // Archive and design/source files in trusted folder structures rarely need human review:
    // they are contextually understood from path alone.
    if (['archive', 'design'].includes(typeInfo.category) && pathCtx.trustedStructure) {
        return { requiresReview: false, reviewReason: null };
    }
    // Images, video, and audio files under a trusted structure with a known project or
    // event context can be auto-passed — the path already tells us what they are.
    if (['image', 'video', 'audio'].includes(typeInfo.category)
        && pathCtx.trustedStructure
        && (pathCtx.hasTrustedProject || pathCtx.isEventAsset)) {
        return { requiresReview: false, reviewReason: null };
    }
    if (pathCtx.isEventAsset && pathCtx.project && ['photo_asset', 'video_asset', 'audio_recording'].includes(documentType)) {
        return { requiresReview: false, reviewReason: null };
    }
    if (confidenceScore >= 0.58 && (client || project || documentType)) {
        return { requiresReview: false, reviewReason: null };
    }
    if (confidenceScore >= 0.42 && (project || documentType || pathCtx.trustedStructure)) {
        return { requiresReview: false, reviewReason: null };
    }
    if (pathCtx.trustedStructure && !pathCtx.hasTrustedProject && !pathCtx.hasTrustedClient && !documentType) {
        return { requiresReview: true, reviewReason: 'ambiguous_project_token' };
    }
    if (pathCtx.documentType && fnCtx.likelyType && pathCtx.documentType !== fnCtx.likelyType) {
        return { requiresReview: true, reviewReason: 'conflicting_filename_vs_path_signals' };
    }
    if (!client && pathCtx.trustedStructure && !pathCtx.isResourceLibrary && typeInfo.category === 'document') {
        return { requiresReview: true, reviewReason: 'weak_client_inference' };
    }
    if (!documentType && typeInfo.category === 'document') {
        return { requiresReview: true, reviewReason: 'document_type_uncertain' };
    }
    if (extraction && extraction.extractionStatus === 'failed' && !pathCtx.trustedStructure) {
        return { requiresReview: true, reviewReason: 'extraction_failed_without_trusted_context' };
    }
    return {
        requiresReview: confidenceScore < 0.28 && typeInfo.category !== 'ignored',
        reviewReason: confidenceScore < 0.28 ? 'likely_important_file_borderline' : null,
    };
}

// ─── RESET ───────────────────────────────────────────────────────────────

async function cmdReset() {
    logger.warn('Deleting ALL pCloud data from Supabase in 3 seconds...');
    await new Promise(r => setTimeout(r, 3000));
    await db.resetAllData();
    logger.success('All pCloud data reset.');
}

async function cmdProcessFile() {
    const fs = require('fs');
    const path = require('path');
    const filePath = args[1];
    
    if (!filePath) {
        logger.error('Usage: node worker/index.js process-file <path>');
        process.exit(1);
    }

    let absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
        // Try relative to source root
        absolutePath = path.join(config.sourceRoot, filePath);
    }

    if (!fs.existsSync(absolutePath)) {
        logger.error(`File not found: ${absolutePath}`);
        process.exit(1);
    }

    const stats = fs.statSync(absolutePath);
    const fileName = path.basename(absolutePath);
    const extension = path.extname(absolutePath).replace(/^\./, '').toLowerCase();

    logger.info(`Analyzing file: ${fileName}`);
    logger.info(`Full path: ${absolutePath}`);
    logger.info(`Size: ${stats.size} bytes`);

    const typeInfo = resolveFileType(extension);
    const extraction = await extractContent(absolutePath, extension);
    
    logger.info(`Extraction status: ${extraction.extractionStatus}`);
    if (extraction.extractionNotes) logger.info(`Notes: ${extraction.extractionNotes}`);

    const relativePath = path.relative(config.sourceRoot, absolutePath).split(path.sep).join('/');
    const pathCtx = analyzePathContext(relativePath);
    const fnCtx = analyzeFilename(fileName);
    
    const cls = await classify({ pathCtx, fnCtx, extraction, typeInfo, fileInfo: { filename: fileName, extension } });

    logger.success('Summary: ' + cls.summary);
    logger.info('Confidence: ' + Math.round(cls.confidenceScore * 100) + '%');
    logger.info('Level: ' + cls.understandingLevel);
    if (cls.requiresReview) logger.warn('Review Reason: ' + cls.reviewReason);
    
    if (extraction.previewText) {
        console.log('\nPreview Content:');
        console.log('--------------------------------------------------');
        console.log(extraction.previewText);
        console.log('--------------------------------------------------\n');
    }
}

function printHelp() {
    console.log('Usage: node worker/index.js <command> [flags]');
    console.log('  check                              Verify drive + Supabase');
    console.log('  scan                               Full scan');
    console.log('  scan --incremental                 Skip unchanged files');
    console.log('  scan --limit N                     Limit number of files');
    console.log('  scan --folder "Folder"             Scan specific folder');
    console.log('  reclassify                         Reclassify existing indexed DB records only');
    console.log('  reclassify --brain                 Use LLM (Brain) for deeper content insight');
    console.log('  reclassify --limit N               Reclassify in batches of N');
    console.log('  process-file "path"                Test AI/OCR extraction on one file');
    console.log('  reset                              Delete all data');
}

main().catch(err => {
    logger.error(`Fatal: ${err.message}`);
    console.error(err);
    process.exit(1);
});

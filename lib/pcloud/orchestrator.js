import { v4 as uuidv4 } from 'uuid';
import { analyzePathContext } from './pathAnalyzer.js';
import { analyzeFilename } from './filenameAnalyzer.js';
import { extractContent } from './contentExtractor.js';
import { resolveFileType } from './fileTypeResolver.js';
import { analyzeWithBrain } from './brain.js';

// Brain intelligence layer loaded lazily at runtime
async function getBrainModules() {
    try {
        const [embMod, kgMod] = await Promise.all([
            import('../brain/embeddings.js'),
            import('../brain/knowledgeGraph.js'),
        ]);
        return { upsertFileEmbeddings: embMod.upsertFileEmbeddings, extractEntities: kgMod.extractEntities, upsertEntities: kgMod.upsertEntities };
    } catch { return {}; }
}
import {
    isSystemFilename,
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
} from './normalization.js';
import {
    getExtractedContentByFileId,
    getFileRecordByPath,
    getPendingReviewItemByFileId,
    getUnderstandingByFileId,
    resolvePendingReviewItemsForFile,
    upsertFileRecord,
    upsertUnderstanding,
    upsertExtractedContent,
    upsertReviewItem,
    logProcessingError,
} from './store.js';

export async function processFile(fileInfo, options = {}) {
    const existingRecord = await getFileRecordByPath(fileInfo.relativePath);
    const fileRecordId = existingRecord?.id || uuidv4();
    const existingUnderstanding = existingRecord ? await getUnderstandingByFileId(fileRecordId) : null;
    const existingContent = existingRecord ? await getExtractedContentByFileId(fileRecordId) : null;
    const understandingId = existingUnderstanding?.id || uuidv4();
    const contentId = existingContent?.id || uuidv4();

    try {
        const typeInfo = resolveFileType(fileInfo.extension);
        const fileRecord = await upsertFileRecord({
            id: fileRecordId,
            filename: fileInfo.filename,
            extension: fileInfo.extension,
            mimeType: fileInfo.mimeType || typeInfo.mime,
            sizeBytes: fileInfo.sizeBytes || 0,
            absolutePath: fileInfo.absolutePath,
            relativePath: fileInfo.relativePath,
            parentPath: fileInfo.parentPath || '',
            sourceType: 'pcloud_sync',
            sourceStatus: 'active',
            createdAtSource: fileInfo.createdAtSource,
            updatedAtSource: fileInfo.updatedAtSource,
        });

        const pathCtx = analyzePathContext(fileInfo.relativePath);
        const fnCtx = analyzeFilename(fileInfo.filename);

        const classification = await classifyFile({
            pathCtx,
            fnCtx,
            extraction,
            typeInfo,
            fileInfo,
            useBrain: options.useBrain,
        });

        const understanding = await upsertUnderstanding({
            id: understandingId,
            fileRecordId,
            understandingLevel: classification.understandingLevel,
            detectedClient: classification.client,
            detectedProject: classification.project,
            detectedCampaign: classification.campaign,
            detectedDepartment: classification.department,
            detectedDocumentType: classification.documentType,
            detectedDocumentSubtype: classification.documentSubtype,
            detectedYear: classification.year,
            detectedMonth: classification.month,
            detectedLocation: classification.location,
            detectedMediaType: typeInfo.category,
            detectedVersion: classification.version,
            detectedStatus: classification.status,
            shortSummary: classification.summary,
            extractedTextPreview: extraction?.previewText || null,
            confidenceScore: classification.confidenceScore,
            confidenceReason: classification.confidenceReason,
            classifierVersion: 'v1.1',
            requiresReview: classification.requiresReview,
        });

        // --- Brain Layer: auto-embed content + extract entities (non-blocking) ---
        if (extraction?.cleanedText || extraction?.previewText) {
            getBrainModules().then(async ({ upsertFileEmbeddings, extractEntities, upsertEntities }) => {
                const textToEmbed = extraction.cleanedText || extraction.previewText;
                if (upsertFileEmbeddings) {
                    await upsertFileEmbeddings(fileRecordId, textToEmbed).catch(() => {});
                }
                if (extractEntities && upsertEntities) {
                    const entities = await extractEntities(textToEmbed, fileInfo.filename, fileInfo.relativePath).catch(() => null);
                    if (entities) await upsertEntities(fileRecordId, entities).catch(() => {});
                }
            }).catch(() => {});
        }

        let reviewItem = null;
        if (classification.requiresReview) {
            const existingReviewItem = await getPendingReviewItemByFileId(fileRecordId);
            reviewItem = await upsertReviewItem({
                id: existingReviewItem?.id || uuidv4(),
                fileRecordId,
                reviewReason: classification.reviewReason,
                suggestedLabels: {
                    client: classification.client,
                    project: classification.project,
                    documentType: classification.documentType,
                },
                confidenceScore: classification.confidenceScore,
                status: 'pending',
            });
        } else if (existingRecord) {
            await resolvePendingReviewItemsForFile(fileRecordId);
        }

        return { fileRecord, understanding, extractedContent: extraction, reviewItem };
    } catch (err) {
        await logProcessingError({
            id: uuidv4(),
            jobId: options.jobId || null,
            fileRecordId,
            filePath: fileInfo.absolutePath || fileInfo.relativePath,
            errorType: 'processing_error',
            errorMessage: err.message,
            stackTrace: err.stack,
        });
        throw err;
    }
}

async function classifyFile({ pathCtx, fnCtx, extraction, typeInfo, fileInfo, useBrain = false }) {
    let brainResult = null;
    if (useBrain && extraction?.previewText && typeInfo.category !== 'ignored') {
        brainResult = await analyzeWithBrain(extraction.previewText, fileInfo.filename, fileInfo.relativePath || fileInfo.filename);
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
            reasons: extraction?.extractionStatus === 'failed' ? ['Content extraction failed'] : [],
        };
    }

    const text = extraction.cleanedText.slice(0, 4000).toLowerCase();
    const candidateKeywords = [
        'quotation',
        'quote',
        'boq',
        'estimate',
        'contract',
        'agreement',
        'presentation',
        'render',
        'report',
        'minutes',
        'brief',
        'schedule',
        'scope',
    ];

    for (const keyword of candidateKeywords) {
        if (text.includes(keyword)) {
            const documentType = normalizeDocumentType(keyword, mediaCategory);
            return {
                documentType,
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
    return (
        pathType ||
        (filenameType && contentType && filenameType === contentType ? filenameType : null) ||
        filenameType ||
        contentType ||
        normalizeDocumentType(null, mediaCategory)
    );
}

function determineReviewNeed({ confidenceScore, client, project, documentType, pathCtx, fnCtx, extraction, typeInfo }) {
    if (typeInfo.category === 'ignored') {
        return { requiresReview: false, reviewReason: null };
    }

    // Archive and design/source files in trusted folder structures rarely need human review
    if (['archive', 'design'].includes(typeInfo.category) && pathCtx.trustedStructure) {
        return { requiresReview: false, reviewReason: null };
    }

    // Images, video, and audio files under a trusted structure with a project context or event
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

    if (extraction?.extractionStatus === 'failed' && !pathCtx.trustedStructure) {
        return { requiresReview: true, reviewReason: 'extraction_failed_without_trusted_context' };
    }

    return {
        requiresReview: confidenceScore < 0.28 && typeInfo.category !== 'ignored',
        reviewReason: confidenceScore < 0.28 ? 'likely_important_file_borderline' : null,
    };
}

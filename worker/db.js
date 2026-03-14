/**
 * worker/db.js — Standalone Supabase client and all database write operations.
 * Optimized with BULK upserts for high-volume scanning.
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryableSupabaseError(error) {
    if (!error) return false;
    const message = String(error.message || error.details || '').toLowerCase();
    const status = Number(error.status || error.code);
    return (
        RETRYABLE_STATUS_CODES.has(status) ||
        message.includes('bad gateway') ||
        message.includes('gateway timeout') ||
        message.includes('temporarily unavailable') ||
        message.includes('fetch failed') ||
        message.includes('network') ||
        message.includes('timeout')
    );
}

async function withRetry(operation, options = {}) {
    const attempts = options.attempts || 4;
    const baseDelayMs = options.baseDelayMs || 500;
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt >= attempts || !isRetryableSupabaseError(error)) {
                throw error;
            }

            const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw lastError;
}

// ─── File Records ────────────────────────────────────────────────────────

async function getExistingRecordByPath(relativePath) {
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_file_records')
        .select('id, size_bytes, updated_at_source, last_seen_at')
        .eq('relative_path', relativePath)
        .eq('is_active', true)
        .order('indexed_at', { ascending: false })
        .limit(1));
    if (error || !data || !data.length) return null;
    const row = data[0];
    return {
        id: row.id,
        sizeBytes: Number(row.size_bytes),
        updatedAtSource: row.updated_at_source,
        lastSeenAt: row.last_seen_at,
    };
}

/**
 * Fetch existing records for a batch of relative paths (for incremental mode).
 */
async function getExistingRecordsByPaths(relativePaths) {
    if (!relativePaths.length) return {};
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_file_records')
        .select('id, relative_path, size_bytes, updated_at_source, indexed_at')
        .eq('is_active', true)
        .order('indexed_at', { ascending: false })
        .in('relative_path', relativePaths));
    if (error || !data) return {};
    const map = {};
    for (const row of data) {
        if (map[row.relative_path]) continue;
        map[row.relative_path] = {
            id: row.id,
            sizeBytes: Number(row.size_bytes),
            updatedAtSource: row.updated_at_source,
        };
    }
    return map;
}

async function touchLastSeen(id) {
    await withRetry(() => supabase
        .from('pcloud_file_records')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', id));
}

async function touchLastSeenBulk(ids) {
    if (!ids.length) return;
    // Supabase doesn't support bulk update by IN with a single value,
    // so we do it in chunks
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await withRetry(() => supabase
            .from('pcloud_file_records')
            .update({ last_seen_at: new Date().toISOString() })
            .in('id', chunk));
    }
}

/**
 * Bulk upsert file records (up to 100 at a time).
 */
async function bulkUpsertFileRecords(records) {
    if (!records.length) return;
    const now = new Date().toISOString();
    const rows = records.map(r => ({
        id:                r.id,
        filename:          r.filename,
        extension:         r.extension || '',
        mime_type:         r.mimeType || 'application/octet-stream',
        size_bytes:        r.sizeBytes || 0,
        checksum:          null,
        absolute_path:     r.absolutePath || null,
        relative_path:     r.relativePath,
        parent_path:       r.parentPath || '',
        source_type:       'pcloud_sync',
        source_status:     'active',
        indexed_at:        now,
        created_at_source: r.createdAtSource || null,
        updated_at_source: r.updatedAtSource || null,
        last_seen_at:      now,
        is_active:         true,
    }));

    const { error } = await withRetry(() => supabase
        .from('pcloud_file_records')
        .upsert(rows, { onConflict: 'id' }));
    if (error) throw error;
}

/**
 * Bulk upsert understandings.
 */
async function bulkUpsertUnderstandings(understandings) {
    if (!understandings.length) return;
    const now = new Date().toISOString();
    const rows = understandings.map(u => ({
        id:                        u.id,
        file_record_id:            u.fileRecordId,
        understanding_level:       u.understandingLevel || 'metadata_only',
        detected_client:           u.detectedClient || null,
        detected_project:          u.detectedProject || null,
        detected_campaign:         u.detectedCampaign || null,
        detected_department:       u.detectedDepartment || null,
        detected_document_type:    u.detectedDocumentType || null,
        detected_document_subtype: u.detectedDocumentSubtype || null,
        detected_year:             u.detectedYear || null,
        detected_month:            u.detectedMonth || null,
        detected_location:         u.detectedLocation || null,
        detected_media_type:       u.detectedMediaType || null,
        detected_version:          u.detectedVersion || null,
        detected_status:           u.detectedStatus || null,
        short_summary:             u.shortSummary || null,
        extracted_text_preview:    u.extractedTextPreview || null,
        confidence_score:          u.confidenceScore ?? 0,
        confidence_reason:         u.confidenceReason || null,
        classifier_version:        'v2.0-worker',
        requires_review:           u.requiresReview || false,
        updated_at:                now,
    }));

    const { error } = await withRetry(() => supabase
        .from('pcloud_file_understandings')
        .upsert(rows, { onConflict: 'id' }));
    if (error) throw error;
}

/**
 * Bulk upsert review items.
 */
async function bulkUpsertReviewItems(items) {
    if (!items.length) return;
    const rows = items.map(item => ({
        id:               item.id,
        file_record_id:   item.fileRecordId,
        review_reason:    item.reviewReason || 'low_confidence',
        suggested_labels: item.suggestedLabels || {},
        confidence_score: item.confidenceScore ?? 0,
        status:           'pending',
        reviewed_at:      null,
        reviewed_by:      null,
    }));

    const { error } = await withRetry(() => supabase
        .from('pcloud_review_queue')
        .upsert(rows, { onConflict: 'id' }));
    if (error) throw error;
}

async function resolvePendingReviewItemsForFileIds(fileRecordIds) {
    if (!fileRecordIds.length) return;
    const chunkSize = 100;
    for (let i = 0; i < fileRecordIds.length; i += chunkSize) {
        const chunk = fileRecordIds.slice(i, i + chunkSize);
        const { error } = await withRetry(() => supabase
            .from('pcloud_review_queue')
            .update({
                status: 'resolved',
                reviewed_at: new Date().toISOString(),
                reviewed_by: 'system_auto',
            })
            .eq('status', 'pending')
            .in('file_record_id', chunk));
        if (error) throw error;
    }
}

async function countActiveFileRecords() {
    const { count, error } = await withRetry(() => supabase
        .from('pcloud_file_records')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true));
    if (error) throw error;
    return count || 0;
}

async function getIndexedFilesBatch(offset = 0, limit = 500) {
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_file_records')
        .select('id, filename, extension, mime_type, size_bytes, absolute_path, relative_path, parent_path, created_at_source, updated_at_source, indexed_at')
        .eq('is_active', true)
        .order('indexed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1));
    if (error) throw error;
    return data || [];
}

async function getUnderstandingsByFileIds(fileRecordIds) {
    if (!fileRecordIds.length) return {};
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_file_understandings')
        .select('*')
        .in('file_record_id', fileRecordIds)
        .order('updated_at', { ascending: false }));
    if (error) throw error;

    const map = {};
    for (const row of data || []) {
        if (map[row.file_record_id]) continue;
        map[row.file_record_id] = row;
    }
    return map;
}

async function getExtractedContentByFileIds(fileRecordIds) {
    if (!fileRecordIds.length) return {};
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_extracted_contents')
        .select('*')
        .in('file_record_id', fileRecordIds)
        .order('created_at', { ascending: false }));
    if (error) throw error;

    const map = {};
    for (const row of data || []) {
        if (map[row.file_record_id]) continue;
        map[row.file_record_id] = row;
    }
    return map;
}

async function getPendingReviewItemsByFileIds(fileRecordIds) {
    if (!fileRecordIds.length) return {};
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_review_queue')
        .select('*')
        .eq('status', 'pending')
        .in('file_record_id', fileRecordIds)
        .order('created_at', { ascending: false }));
    if (error) throw error;

    const map = {};
    for (const row of data || []) {
        if (map[row.file_record_id]) continue;
        map[row.file_record_id] = row;
    }
    return map;
}

/**
 * Upsert a single extracted content record.
 */
async function upsertExtractedContent(ec) {
    const row = {
        id:                ec.id,
        file_record_id:    ec.fileRecordId,
        extraction_type:   ec.extractionType || 'text',
        raw_text:          ec.rawText || null,
        cleaned_text:      ec.cleanedText || null,
        preview_text:      ec.previewText || null,
        language:          ec.language || null,
        page_count:        ec.pageCount || null,
        duration_seconds:  ec.durationSeconds || null,
        extraction_status: ec.extractionStatus || 'completed',
        extraction_notes:  ec.extractionNotes || null,
    };

    const { error } = await withRetry(() => supabase
        .from('pcloud_extracted_contents')
        .upsert([row], { onConflict: 'id' }));
    if (error) throw error;
}

// ─── Processing Jobs ─────────────────────────────────────────────────────

async function createJob(jobType, rootPath) {
    const id = uuidv4();
    const { data, error } = await withRetry(() => supabase
        .from('pcloud_processing_jobs')
        .insert([{ id, job_type: jobType, status: 'running', root_path: rootPath, total_files: 0, processed_files: 0, error_count: 0 }])
        .select()
        .single());
    if (error) throw error;
    return data;
}

async function updateJob(id, updates) {
    const row = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.totalFiles !== undefined) row.total_files = updates.totalFiles;
    if (updates.processedFiles !== undefined) row.processed_files = updates.processedFiles;
    if (updates.errorCount !== undefined) row.error_count = updates.errorCount;
    if (updates.completedAt !== undefined) row.completed_at = updates.completedAt;
    if (updates.notes !== undefined) row.notes = updates.notes;
    await withRetry(() => supabase.from('pcloud_processing_jobs').update(row).eq('id', id));
}

// ─── Processing Errors ───────────────────────────────────────────────────

async function logError(err) {
    try {
        await withRetry(() => supabase.from('pcloud_processing_errors').insert([{
            id: uuidv4(), job_id: err.jobId || null, file_record_id: err.fileRecordId || null,
            file_path: err.filePath || null, error_type: err.errorType || 'unknown',
            error_message: err.errorMessage || '', stack_trace: err.stackTrace || null,
        }]), { attempts: 2, baseDelayMs: 250 });
    } catch (e) { console.error('Failed to log error:', e.message); }
}

// ─── Reset ───────────────────────────────────────────────────────────────

async function resetAllData() {
    await withRetry(() => supabase.from('pcloud_processing_errors').delete().neq('id', ''));
    await withRetry(() => supabase.from('pcloud_processing_jobs').delete().neq('id', ''));
    await withRetry(() => supabase.from('pcloud_review_queue').delete().neq('id', ''));
    await withRetry(() => supabase.from('pcloud_extracted_contents').delete().neq('id', ''));
    await withRetry(() => supabase.from('pcloud_file_understandings').delete().neq('id', ''));
    await withRetry(() => supabase.from('pcloud_file_records').delete().neq('id', ''));
}

module.exports = {
    supabase,
    getExistingRecordByPath,
    getExistingRecordsByPaths,
    touchLastSeen,
    touchLastSeenBulk,
    bulkUpsertFileRecords,
    bulkUpsertUnderstandings,
    bulkUpsertReviewItems,
    resolvePendingReviewItemsForFileIds,
    countActiveFileRecords,
    getIndexedFilesBatch,
    getUnderstandingsByFileIds,
    getExtractedContentByFileIds,
    getPendingReviewItemsByFileIds,
    upsertExtractedContent,
    createJob,
    updateJob,
    logError,
    resetAllData,
};

/**
 * pCloud Store — Supabase CRUD for all pCloud tables
 * Follows the same mapRow / toRow pattern as lib/store.js
 */

import { supabase } from '../supabase';

// ─── Row Mappers ───────────────────────────────────────────────────────

function mapFileRecord(row) {
    if (!row) return null;
    return {
        id:             row.id,
        filename:       row.filename,
        extension:      row.extension,
        mimeType:       row.mime_type,
        sizeBytes:      Number(row.size_bytes) || 0,
        checksum:       row.checksum,
        absolutePath:   row.absolute_path,
        relativePath:   row.relative_path,
        parentPath:     row.parent_path,
        sourceType:     row.source_type,
        sourceStatus:   row.source_status,
        indexedAt:      row.indexed_at,
        createdAtSource: row.created_at_source,
        updatedAtSource: row.updated_at_source,
        lastSeenAt:     row.last_seen_at,
        isActive:       row.is_active,
    };
}

function mapUnderstanding(row) {
    if (!row) return null;
    return {
        id:                     row.id,
        fileRecordId:           row.file_record_id,
        understandingLevel:     row.understanding_level,
        detectedClient:         row.detected_client,
        detectedProject:        row.detected_project,
        detectedCampaign:       row.detected_campaign,
        detectedDepartment:     row.detected_department,
        detectedDocumentType:   row.detected_document_type,
        detectedDocumentSubtype: row.detected_document_subtype,
        detectedYear:           row.detected_year,
        detectedMonth:          row.detected_month,
        detectedLocation:       row.detected_location,
        detectedMediaType:      row.detected_media_type,
        detectedVersion:        row.detected_version,
        detectedStatus:         row.detected_status,
        shortSummary:           row.short_summary,
        extractedTextPreview:   row.extracted_text_preview,
        confidenceScore:        Number(row.confidence_score) || 0,
        confidenceReason:       row.confidence_reason,
        classifierVersion:      row.classifier_version,
        requiresReview:         row.requires_review,
        createdAt:              row.created_at,
        updatedAt:              row.updated_at,
    };
}

function mapExtractedContent(row) {
    if (!row) return null;
    return {
        id:               row.id,
        fileRecordId:     row.file_record_id,
        extractionType:   row.extraction_type,
        rawText:          row.raw_text,
        cleanedText:      row.cleaned_text,
        previewText:      row.preview_text,
        language:         row.language,
        pageCount:        row.page_count,
        durationSeconds:  row.duration_seconds ? Number(row.duration_seconds) : null,
        extractionStatus: row.extraction_status,
        extractionNotes:  row.extraction_notes,
        createdAt:        row.created_at,
    };
}

function mapReviewItem(row) {
    if (!row) return null;
    return {
        id:              row.id,
        fileRecordId:    row.file_record_id,
        reviewReason:    row.review_reason,
        suggestedLabels: row.suggested_labels || {},
        confidenceScore: Number(row.confidence_score) || 0,
        status:          row.status,
        createdAt:       row.created_at,
        reviewedAt:      row.reviewed_at,
        reviewedBy:      row.reviewed_by,
    };
}

function mapJob(row) {
    if (!row) return null;
    return {
        id:             row.id,
        jobType:        row.job_type,
        status:         row.status,
        rootPath:       row.root_path,
        totalFiles:     row.total_files,
        processedFiles: row.processed_files,
        errorCount:     row.error_count,
        startedAt:      row.started_at,
        completedAt:    row.completed_at,
        notes:          row.notes,
    };
}

function mapError(row) {
    if (!row) return null;
    return {
        id:           row.id,
        jobId:        row.job_id,
        fileRecordId: row.file_record_id,
        filePath:     row.file_path,
        errorType:    row.error_type,
        errorMessage: row.error_message,
        stackTrace:   row.stack_trace,
        createdAt:    row.created_at,
    };
}

// ─── File Records ───────────────────────────────────────────────────────

export async function getFileRecords({ limit = 50, offset = 0, filters = {} } = {}) {
    let query = supabase
        .from('pcloud_file_records')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .order('indexed_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (filters.extension) query = query.eq('extension', filters.extension);
    if (filters.sourceStatus) query = query.eq('source_status', filters.sourceStatus);
    if (filters.search) query = query.or(`filename.ilike.%${filters.search}%,relative_path.ilike.%${filters.search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return { records: (data || []).map(mapFileRecord), total: count || 0 };
}

export async function getFileRecordById(id) {
    const { data, error } = await supabase
        .from('pcloud_file_records')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return mapFileRecord(data);
}

export async function getFileRecordByPath(relativePath) {
    const { data, error } = await supabase
        .from('pcloud_file_records')
        .select('*')
        .eq('relative_path', relativePath)
        .order('indexed_at', { ascending: false })
        .limit(1);
    if (error) return null;
    return mapFileRecord(data?.[0] || null);
}

export async function upsertFileRecord(record) {
    const row = {
        id:                record.id,
        filename:          record.filename,
        extension:         record.extension || '',
        mime_type:         record.mimeType || 'application/octet-stream',
        size_bytes:        record.sizeBytes || 0,
        checksum:          record.checksum || null,
        absolute_path:     record.absolutePath || null,
        relative_path:     record.relativePath,
        parent_path:       record.parentPath || '',
        source_type:       record.sourceType || 'pcloud_sync',
        source_status:     record.sourceStatus || 'active',
        indexed_at:        record.indexedAt || new Date().toISOString(),
        created_at_source: record.createdAtSource || null,
        updated_at_source: record.updatedAtSource || null,
        last_seen_at:      new Date().toISOString(),
        is_active:         record.isActive !== false,
    };

    const { data, error } = await supabase
        .from('pcloud_file_records')
        .upsert([row], { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return mapFileRecord(data);
}

export async function upsertFileRecords(records) {
    const rows = records.map(r => ({
        id:                r.id,
        filename:          r.filename,
        extension:         r.extension || '',
        mime_type:         r.mimeType || 'application/octet-stream',
        size_bytes:        r.sizeBytes || 0,
        checksum:          r.checksum || null,
        absolute_path:     r.absolutePath || null,
        relative_path:     r.relativePath,
        parent_path:       r.parentPath || '',
        source_type:       r.sourceType || 'pcloud_sync',
        source_status:     r.sourceStatus || 'active',
        indexed_at:        r.indexedAt || new Date().toISOString(),
        created_at_source: r.createdAtSource || null,
        updated_at_source: r.updatedAtSource || null,
        last_seen_at:      new Date().toISOString(),
        is_active:         r.isActive !== false,
    }));

    const { data, error } = await supabase
        .from('pcloud_file_records')
        .upsert(rows, { onConflict: 'id' })
        .select();
    if (error) throw error;
    return (data || []).map(mapFileRecord);
}

// ─── File Understandings ────────────────────────────────────────────────

export async function getUnderstandingByFileId(fileRecordId) {
    const { data, error } = await supabase
        .from('pcloud_file_understandings')
        .select('*')
        .eq('file_record_id', fileRecordId)
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) return null;
    return mapUnderstanding(data?.[0] || null);
}

export async function upsertUnderstanding(u) {
    const row = {
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
        classifier_version:        u.classifierVersion || 'v1.0',
        requires_review:           u.requiresReview || false,
        updated_at:                new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('pcloud_file_understandings')
        .upsert([row], { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return mapUnderstanding(data);
}

// ─── Extracted Content ──────────────────────────────────────────────────

export async function getExtractedContentByFileId(fileRecordId) {
    const { data, error } = await supabase
        .from('pcloud_extracted_contents')
        .select('*')
        .eq('file_record_id', fileRecordId)
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) return null;
    return mapExtractedContent(data?.[0] || null);
}

export async function upsertExtractedContent(ec) {
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

    const { data, error } = await supabase
        .from('pcloud_extracted_contents')
        .upsert([row], { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return mapExtractedContent(data);
}

// ─── Review Queue ───────────────────────────────────────────────────────

export async function getReviewQueue({ status = 'pending', limit = 50, offset = 0 } = {}) {
    let query = supabase
        .from('pcloud_review_queue')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (status && status !== 'all') query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    return { items: (data || []).map(mapReviewItem), total: count || 0 };
}

export async function upsertReviewItem(item) {
    const row = {
        id:               item.id,
        file_record_id:   item.fileRecordId,
        review_reason:    item.reviewReason || 'low_confidence',
        suggested_labels: item.suggestedLabels || {},
        confidence_score: item.confidenceScore ?? 0,
        status:           item.status || 'pending',
        reviewed_at:      item.reviewedAt || null,
        reviewed_by:      item.reviewedBy || null,
    };

    const { data, error } = await supabase
        .from('pcloud_review_queue')
        .upsert([row], { onConflict: 'id' })
        .select()
        .single();
    if (error) throw error;
    return mapReviewItem(data);
}

export async function getPendingReviewItemByFileId(fileRecordId) {
    const { data, error } = await supabase
        .from('pcloud_review_queue')
        .select('*')
        .eq('file_record_id', fileRecordId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) return null;
    return mapReviewItem(data?.[0] || null);
}

export async function resolvePendingReviewItemsForFile(fileRecordId) {
    const { error } = await supabase
        .from('pcloud_review_queue')
        .update({
            status: 'resolved',
            reviewed_at: new Date().toISOString(),
            reviewed_by: 'system_auto',
        })
        .eq('file_record_id', fileRecordId)
        .eq('status', 'pending');
    if (error) throw error;
}

export async function updateReviewItem(id, updates) {
    const rowUpdates = {};
    if (updates.status !== undefined) rowUpdates.status = updates.status;
    if (updates.reviewedAt !== undefined) rowUpdates.reviewed_at = updates.reviewedAt;
    if (updates.reviewedBy !== undefined) rowUpdates.reviewed_by = updates.reviewedBy;
    if (updates.suggestedLabels !== undefined) rowUpdates.suggested_labels = updates.suggestedLabels;

    const { data, error } = await supabase
        .from('pcloud_review_queue')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) return null;
    return mapReviewItem(data);
}

// ─── Processing Jobs ────────────────────────────────────────────────────

export async function createJob(job) {
    const row = {
        id:              job.id,
        job_type:        job.jobType || 'scan',
        status:          'running',
        root_path:       job.rootPath || null,
        total_files:     0,
        processed_files: 0,
        error_count:     0,
    };

    const { data, error } = await supabase
        .from('pcloud_processing_jobs')
        .insert([row])
        .select()
        .single();
    if (error) throw error;
    return mapJob(data);
}

export async function updateJob(id, updates) {
    const rowUpdates = {};
    if (updates.status !== undefined) rowUpdates.status = updates.status;
    if (updates.totalFiles !== undefined) rowUpdates.total_files = updates.totalFiles;
    if (updates.processedFiles !== undefined) rowUpdates.processed_files = updates.processedFiles;
    if (updates.errorCount !== undefined) rowUpdates.error_count = updates.errorCount;
    if (updates.completedAt !== undefined) rowUpdates.completed_at = updates.completedAt;
    if (updates.notes !== undefined) rowUpdates.notes = updates.notes;

    const { data, error } = await supabase
        .from('pcloud_processing_jobs')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) return null;
    return mapJob(data);
}

export async function getRecentJobs(limit = 10) {
    const { data, error } = await supabase
        .from('pcloud_processing_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data || []).map(mapJob);
}

// ─── Processing Errors ──────────────────────────────────────────────────

export async function logProcessingError(err) {
    const row = {
        id:             err.id,
        job_id:         err.jobId || null,
        file_record_id: err.fileRecordId || null,
        file_path:      err.filePath || null,
        error_type:     err.errorType || 'unknown',
        error_message:  err.errorMessage || '',
        stack_trace:    err.stackTrace || null,
    };

    const { error } = await supabase
        .from('pcloud_processing_errors')
        .insert([row]);
    if (error) console.error('Failed to log processing error:', error);
}

export async function getRecentErrors(limit = 20) {
    const { data, error } = await supabase
        .from('pcloud_processing_errors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data || []).map(mapError);
}

// ─── Stats ──────────────────────────────────────────────────────────────

export async function getStats() {
    const [
        { count: totalFiles },
        { count: metadataOnly },
        { count: contentUnderstood },
        { count: needsReview },
        { count: pendingReviews },
    ] = await Promise.all([
        supabase.from('pcloud_file_records').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('pcloud_file_understandings').select('*', { count: 'exact', head: true }).eq('understanding_level', 'metadata_only'),
        supabase.from('pcloud_file_understandings').select('*', { count: 'exact', head: true }).in('understanding_level', ['content_understood', 'filename_path_inferred']),
        supabase.from('pcloud_file_understandings').select('*', { count: 'exact', head: true }).eq('requires_review', true),
        supabase.from('pcloud_review_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    return {
        totalFiles: totalFiles || 0,
        metadataOnly: metadataOnly || 0,
        contentUnderstood: contentUnderstood || 0,
        needsReview: needsReview || 0,
        pendingReviews: pendingReviews || 0,
    };
}

/**
 * Hybrid search: combines vector (semantic) + keyword (exact/fuzzy) results
 * using Reciprocal Rank Fusion (RRF) to merge ranked lists.
 *
 * Vector search calls the `match_brain_embeddings` Supabase RPC (pgvector).
 * Keyword search queries pcloud_file_records + pcloud_file_understandings
 * + pcloud_extracted_contents using ilike, mirroring the existing searchService.
 *
 * If the brain_embeddings table / pgvector extension is not yet available,
 * vectorSearch degrades gracefully and only keyword results are returned.
 */

import { createClient } from '@supabase/supabase-js';

// Dedicated service-key client for brain operations (bypasses RLS)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ---------------------------------------------------------------------------
// Embedding helper — imported lazily so the module loads even when
// lib/brain/embeddings.js doesn't exist yet.
// ---------------------------------------------------------------------------
async function getEmbedding(text) {
    try {
        const { embedQuery } = await import('./embeddings.js');
        return await embedQuery(text);
    } catch {
        // embeddings module not ready — vector search will be skipped
        return null;
    }
}

// ---------------------------------------------------------------------------
// sanitise a string for use inside a LIKE pattern
// ---------------------------------------------------------------------------
function sanitizeLike(value) {
    return (value || '').replace(/[%_]/g, '');
}

// ---------------------------------------------------------------------------
// vectorSearch
// Calls the `match_brain_embeddings` Supabase RPC with the query embedding.
// Returns an array of { file_record_id, similarity } objects.
// Falls back to [] if the RPC / table is unavailable.
// ---------------------------------------------------------------------------
async function vectorSearch(query, filters = {}, limit = 40) {
    // Generate embedding — bail out early if embeddings are not available
    const embedding = await getEmbedding(query);
    if (!embedding) return [];

    try {
        const { data, error } = await supabase.rpc('match_brain_embeddings', {
            query_embedding: embedding,
            match_threshold: 0.3,
            match_count: limit,
        });

        if (error) {
            // Table or RPC does not exist yet — degrade silently
            if (
                error.code === '42883' || // undefined_function
                error.code === '42P01' || // undefined_table
                error.message?.includes('match_brain_embeddings') ||
                error.message?.includes('brain_embeddings')
            ) {
                return [];
            }
            console.error('[hybridSearch] vectorSearch RPC error:', error.message);
            return [];
        }

        return (data || []).map((row) => ({
            file_record_id: row.file_record_id,
            similarity: Number(row.similarity) || 0,
        }));
    } catch (err) {
        console.error('[hybridSearch] vectorSearch unexpected error:', err.message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// keywordSearch
// Queries pcloud_file_records, pcloud_file_understandings, and
// pcloud_extracted_contents with ilike patterns on every relevant field.
// Returns an array of file_record_id strings (de-duplicated).
// ---------------------------------------------------------------------------
async function keywordSearch(query, filters = {}, limit = 40) {
    const term = sanitizeLike((query || '').trim());
    if (!term) return [];

    const pattern = `%${term}%`;

    // ── 1. Metadata + understanding fields ────────────────────────────────
    const understandingQuery = supabase
        .from('pcloud_file_understandings')
        .select(`
            file_record_id,
            pcloud_file_records!inner (
                id,
                filename,
                relative_path,
                is_active
            )
        `)
        .eq('pcloud_file_records.is_active', true)
        .or(
            [
                `detected_client.ilike.${pattern}`,
                `detected_project.ilike.${pattern}`,
                `detected_document_type.ilike.${pattern}`,
                `short_summary.ilike.${pattern}`,
            ].join(',')
        )
        .limit(limit);

    // ── 2. Filename / path fields on file_records ─────────────────────────
    const fileQuery = supabase
        .from('pcloud_file_records')
        .select('id')
        .eq('is_active', true)
        .or(`filename.ilike.${pattern},relative_path.ilike.${pattern}`)
        .limit(limit);

    // ── 3. Extracted text content ─────────────────────────────────────────
    const textQuery = supabase
        .from('pcloud_extracted_contents')
        .select(`
            file_record_id,
            pcloud_file_records!inner (
                is_active
            )
        `)
        .eq('pcloud_file_records.is_active', true)
        .or(`preview_text.ilike.${pattern},cleaned_text.ilike.${pattern}`)
        .limit(limit);

    // Apply optional filters across all three queries
    const applyFilters = (q, source) => {
        if (filters.client && source !== 'file')
            q = q.ilike('detected_client', `%${sanitizeLike(filters.client)}%`);
        if (filters.project && source !== 'file')
            q = q.ilike('detected_project', `%${sanitizeLike(filters.project)}%`);
        if (filters.documentType && source !== 'file')
            q = q.ilike('detected_document_type', `%${sanitizeLike(filters.documentType)}%`);
        if (filters.folderPrefix && source === 'file')
            q = q.ilike('relative_path', `${sanitizeLike(filters.folderPrefix)}%`);
        return q;
    };

    const [understandingResult, fileResult, textResult] = await Promise.all([
        applyFilters(understandingQuery, 'understanding'),
        applyFilters(fileQuery, 'file'),
        textQuery,
    ]);

    const ids = new Set();

    (understandingResult.data || []).forEach((row) => {
        if (row.file_record_id) ids.add(row.file_record_id);
    });
    (fileResult.data || []).forEach((row) => {
        if (row.id) ids.add(row.id);
    });
    (textResult.data || []).forEach((row) => {
        if (row.file_record_id) ids.add(row.file_record_id);
    });

    return Array.from(ids);
}

// ---------------------------------------------------------------------------
// reciprocalRankFusion
// Standard RRF: score = Σ 1/(k + rank_i) across all lists.
// list1 / list2 are arrays of items that have a `file_record_id` field
// (vector results) or are plain id strings (keyword results).
// Returns an array of { file_record_id, rrfScore } sorted descending.
// ---------------------------------------------------------------------------
function reciprocalRankFusion(vectorResults, keywordIds, k = 60) {
    const scores = new Map(); // file_record_id → cumulative RRF score

    const addScore = (id, rank) => {
        const current = scores.get(id) || 0;
        scores.set(id, current + 1 / (k + rank + 1)); // rank is 0-indexed
    };

    // Vector results: ordered by similarity (already sorted by Supabase RPC)
    vectorResults.forEach((item, rank) => {
        addScore(item.file_record_id, rank);
    });

    // Keyword results: the order returned is treated as the rank list
    keywordIds.forEach((id, rank) => {
        addScore(id, rank);
    });

    // Sort by combined RRF score descending
    return Array.from(scores.entries())
        .map(([file_record_id, rrfScore]) => ({ file_record_id, rrfScore }))
        .sort((a, b) => b.rrfScore - a.rrfScore);
}

// ---------------------------------------------------------------------------
// hydrateResults
// Fetch full records for a list of file_record_ids and attach scoring data.
// Returns result objects shaped for the chat context and UI.
// ---------------------------------------------------------------------------
async function hydrateResults(rankedIds, vectorResults, keywordIds) {
    if (rankedIds.length === 0) return [];

    // Build lookup maps for scores
    const vectorScoreMap = new Map(
        vectorResults.map((item) => [item.file_record_id, item.similarity])
    );
    const keywordIdSet = new Set(keywordIds);
    const rrfScoreMap = new Map(
        rankedIds.map((item) => [item.file_record_id, item.rrfScore])
    );

    const ids = rankedIds.map((item) => item.file_record_id);

    const { data, error } = await supabase
        .from('pcloud_file_records')
        .select(`
            id,
            filename,
            extension,
            mime_type,
            size_bytes,
            relative_path,
            parent_path,
            indexed_at,
            source_status,
            pcloud_file_understandings (
                understanding_level,
                detected_client,
                detected_project,
                detected_document_type,
                detected_media_type,
                detected_status,
                short_summary,
                extracted_text_preview,
                confidence_score,
                requires_review
            ),
            pcloud_extracted_contents (
                preview_text,
                extraction_status
            )
        `)
        .in('id', ids)
        .eq('is_active', true);

    if (error) {
        console.error('[hybridSearch] hydrateResults error:', error.message);
        return [];
    }

    const rows = data || [];

    // Map to rich result objects, then re-sort to the RRF order
    const mapped = rows.map((row) => {
        const understanding = Array.isArray(row.pcloud_file_understandings)
            ? row.pcloud_file_understandings[0]
            : row.pcloud_file_understandings;
        const extracted = Array.isArray(row.pcloud_extracted_contents)
            ? row.pcloud_extracted_contents[0]
            : row.pcloud_extracted_contents;

        const vectorScore = vectorScoreMap.get(row.id) || 0;
        const keywordScore = keywordIdSet.has(row.id) ? 1 : 0;
        const rrfScore = rrfScoreMap.get(row.id) || 0;

        return {
            id: row.id,
            filename: row.filename,
            extension: row.extension,
            mimeType: row.mime_type,
            sizeBytes: Number(row.size_bytes) || 0,
            relativePath: row.relative_path,
            parentPath: row.parent_path,
            indexedAt: row.indexed_at,
            sourceStatus: row.source_status,
            // Understanding fields
            understandingLevel: understanding?.understanding_level || 'metadata_only',
            client: understanding?.detected_client || '',
            project: understanding?.detected_project || '',
            docType: understanding?.detected_document_type || '',
            mediaType: understanding?.detected_media_type || '',
            summary: understanding?.short_summary || understanding?.extracted_text_preview || '',
            previewText: extracted?.preview_text || understanding?.extracted_text_preview || '',
            confidenceScore: Number(understanding?.confidence_score) || 0,
            requiresReview: Boolean(understanding?.requires_review),
            // Search scores
            rrfScore,
            vectorScore,
            keywordScore,
        };
    });

    // Restore RRF order (SQL IN clause doesn't guarantee order)
    const idOrder = new Map(ids.map((id, idx) => [id, idx]));
    mapped.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));

    return mapped;
}

// ---------------------------------------------------------------------------
// hybridSearch — public API
// ---------------------------------------------------------------------------
/**
 * Hybrid search combining vector similarity and keyword search via RRF.
 *
 * @param {string} query          - Natural language search query
 * @param {object} filters        - Optional filters: client, project, documentType, folderPrefix
 * @param {object} options        - pageSize (default 20), page (default 1)
 * @returns {Promise<{results, total, vectorHits, keywordHits}>}
 */
export async function hybridSearch(query, filters = {}, options = {}) {
    const { pageSize = 20, page = 1 } = options;
    const fetchLimit = pageSize * 3; // over-fetch so fusion has enough candidates

    // Run vector and keyword searches in parallel
    const [vectorResults, keywordIds] = await Promise.all([
        vectorSearch(query, filters, fetchLimit),
        keywordSearch(query, filters, fetchLimit),
    ]);

    // Merge via Reciprocal Rank Fusion
    const fused = reciprocalRankFusion(vectorResults, keywordIds);

    // Hydrate the top N fused results (we slice before hydrating to limit DB load)
    const topFused = fused.slice(0, pageSize * 2); // keep 2x pageSize for hydration
    const hydrated = await hydrateResults(topFused, vectorResults, keywordIds);

    // Paginate
    const start = (page - 1) * pageSize;
    const pageResults = hydrated.slice(start, start + pageSize);

    return {
        results: pageResults,
        total: hydrated.length,
        vectorHits: vectorResults.length,
        keywordHits: keywordIds.length,
    };
}

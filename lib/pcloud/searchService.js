import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';
import { interpretQuery } from './queryInterpreter';

import { buildResultExplanation } from './searchExplanation';
import { scoreCandidate } from './searchRanking';
import { createSemanticProvider } from './semanticProvider';
import {
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
    normalizeUnderstandingLevel,
} from './normalization.js';

const STOP_WORDS = new Set([
    'find', 'show', 'list', 'under', 'related', 'files', 'file', 'please', 'the', 'a',
    'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'by', 'with', 'from', 'all',
]);

const DOCUMENT_TYPE_HINTS = {
    quotation: 'quotation',
    quote: 'quotation',
    contract: 'contract',
    contracts: 'contract',
    invoice: 'invoice',
    proposal: 'proposal',
    render: 'render',
    renders: 'render',
    brief: 'brief',
    agreement: 'agreement',
};

const MEDIA_TYPE_HINTS = {
    photo: 'image',
    photos: 'image',
    image: 'image',
    images: 'image',
    picture: 'image',
    pictures: 'image',
    video: 'video',
    videos: 'video',
    audio: 'audio',
    recording: 'audio',
};

const FILE_TYPE_HINTS = {
    pdf: 'pdf',
    word: 'docx',
    doc: 'docx',
    docx: 'docx',
    excel: 'xlsx',
    xlsx: 'xlsx',
    ppt: 'pptx',
    powerpoint: 'pptx',
    photo: 'jpg',
    photos: 'jpg',
    image: 'jpg',
    images: 'jpg',
    png: 'png',
};

function sanitizeLike(value) {
    return value.replace(/[%_]/g, '');
}

function splitTokens(query) {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9/_ -]/g, ' ')
        .split(/\s+/)
        .filter((token) => token && !STOP_WORDS.has(token) && token.length > 1);
}

function inferFolderPrefix(query) {
    const match = query.match(/\bunder\s+([a-z0-9/_ -]+?)(?=\s+(related|with|for|about|show|find|list)\b|$)/i);
    if (!match) return '';
    return match[1].trim().replace(/\s+/g, ' ');
}

function inferHint(tokens, map) {
    for (const token of tokens) {
        if (map[token]) return map[token];
    }
    return '';
}

function buildOrIlike(terms, fields) {
    const safeTerms = terms.map((term) => sanitizeLike(term)).filter(Boolean);
    if (safeTerms.length === 0) return '';

    const parts = [];
    safeTerms.forEach((term) => {
        fields.forEach((field) => {
            parts.push(`${field}.ilike.%${term}%`);
        });
    });

    return parts.join(',');
}

function buildQueryInfo(query) {
    const clean = (query || '').trim();
    const phrase = clean.toLowerCase();
    const tokens = splitTokens(clean);

    return {
        raw: clean,
        phrase,
        tokens,
        inferredFolderPrefix: inferFolderPrefix(clean),
        inferredDocumentType: inferHint(tokens, DOCUMENT_TYPE_HINTS),
        inferredMediaType: inferHint(tokens, MEDIA_TYPE_HINTS),
        inferredFileType: inferHint(tokens, FILE_TYPE_HINTS),
    };
}

function mapJoinedRecord(row) {
    const understanding = Array.isArray(row.pcloud_file_understandings) ? row.pcloud_file_understandings[0] : row.pcloud_file_understandings;
    const extracted = Array.isArray(row.pcloud_extracted_contents) ? row.pcloud_extracted_contents[0] : row.pcloud_extracted_contents;

    return {
        id: row.id,
        filename: row.filename,
        extension: row.extension,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes) || 0,
        relativePath: row.relative_path,
        parentPath: row.parent_path,
        indexedAt: row.indexed_at,
        lastSeenAt: row.last_seen_at,
        sourceStatus: row.source_status,
        understandingLevel: normalizeUnderstandingLevel(understanding?.understanding_level || 'metadata_only'),
        detectedClient: normalizeClientLabel(understanding?.detected_client) || '',
        detectedProject: normalizeProjectLabel(understanding?.detected_project) || '',
        detectedDocumentType: normalizeDocumentType(understanding?.detected_document_type, understanding?.detected_media_type) || '',
        detectedMediaType: understanding?.detected_media_type || '',
        detectedStatus: understanding?.detected_status || '',
        shortSummary: understanding?.short_summary || '',
        previewText: extracted?.preview_text || understanding?.extracted_text_preview || '',
        cleanedText: extracted?.cleaned_text || '',
        extractionStatus: extracted?.extraction_status || '',
        confidenceScore: Number(understanding?.confidence_score) || 0,
        requiresReview: Boolean(understanding?.requires_review),
    };
}

function applyBaseFilters(query, filters) {
    let next = query.eq('is_active', true);

    if (filters.extension) next = next.eq('extension', filters.extension);
    if (filters.fileType) next = next.eq('extension', filters.fileType);
    if (filters.folderPrefix) next = next.ilike('relative_path', `${sanitizeLike(filters.folderPrefix)}%`);
    if (filters.status) next = next.eq('source_status', filters.status);
    if (filters.client) next = next.ilike('pcloud_file_understandings.detected_client', `%${sanitizeLike(filters.client)}%`);
    if (filters.project) next = next.ilike('pcloud_file_understandings.detected_project', `%${sanitizeLike(filters.project)}%`);
    if (filters.documentType) next = next.ilike('pcloud_file_understandings.detected_document_type', `%${sanitizeLike(filters.documentType)}%`);
    if (filters.understandingLevel) next = next.eq('pcloud_file_understandings.understanding_level', filters.understandingLevel);

    return next;
}

async function fetchMetadataCandidateIds(queryInfo, filters, limit) {
    let query = supabase
        .from('pcloud_file_records')
        .select('id')
        .order('indexed_at', { ascending: false })
        .limit(limit)
        .eq('is_active', true);

    if (filters.extension) query = query.eq('extension', filters.extension);
    if (filters.fileType) query = query.eq('extension', filters.fileType);
    if (filters.folderPrefix) query = query.ilike('relative_path', `${sanitizeLike(filters.folderPrefix)}%`);
    if (filters.status) query = query.eq('source_status', filters.status);

    const metadataOr = buildOrIlike(
        [queryInfo.phrase, ...queryInfo.tokens.slice(0, 5)].filter(Boolean),
        ['filename', 'relative_path']
    );
    if (metadataOr) {
        query = query.or(metadataOr);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => row.id);
}

async function fetchUnderstandingCandidateIds(queryInfo, filters, limit) {
    let query = supabase
        .from('pcloud_file_understandings')
        .select(`
            file_record_id,
            pcloud_file_records!inner (
                is_active
            )
        `)
        .eq('pcloud_file_records.is_active', true)
        .limit(limit);

    if (filters.client) query = query.ilike('detected_client', `%${sanitizeLike(filters.client)}%`);
    if (filters.project) query = query.ilike('detected_project', `%${sanitizeLike(filters.project)}%`);
    if (filters.documentType) query = query.ilike('detected_document_type', `%${sanitizeLike(filters.documentType)}%`);
    if (filters.understandingLevel) query = query.eq('understanding_level', filters.understandingLevel);
    if (filters.status) query = query.ilike('detected_status', `%${sanitizeLike(filters.status)}%`);
    if (filters.folderPrefix) query = query.ilike('pcloud_file_records.relative_path', `${sanitizeLike(filters.folderPrefix)}%`);
    if (filters.fileType) query = query.eq('pcloud_file_records.extension', filters.fileType);

    const understandingOr = buildOrIlike(
        [queryInfo.phrase, ...queryInfo.tokens.slice(0, 5)].filter(Boolean),
        ['detected_client', 'detected_project', 'detected_document_type', 'short_summary']
    );
    if (understandingOr) {
        query = query.or(understandingOr);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => row.file_record_id);
}

async function fetchTextCandidateIds(queryInfo, filters, limit) {
    if (!queryInfo.phrase && queryInfo.tokens.length === 0) return [];

    let query = supabase
        .from('pcloud_extracted_contents')
        .select(`
            file_record_id,
            pcloud_file_records!inner (
                relative_path,
                is_active
            )
        `)
        .eq('pcloud_file_records.is_active', true)
        .limit(limit);

    if (filters.folderPrefix) query = query.ilike('pcloud_file_records.relative_path', `${sanitizeLike(filters.folderPrefix)}%`);
    if (filters.fileType) query = query.eq('pcloud_file_records.extension', filters.fileType);

    const textOr = buildOrIlike(
        [queryInfo.phrase, ...queryInfo.tokens.slice(0, 5)].filter(Boolean),
        ['preview_text', 'cleaned_text']
    );
    if (textOr) {
        query = query.or(textOr);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => row.file_record_id);
}

function filterCandidates(candidates, filters) {
    return candidates.filter((candidate) => {
        if (filters.client && !candidate.detectedClient.toLowerCase().includes(filters.client.toLowerCase())) return false;
        if (filters.project && !candidate.detectedProject.toLowerCase().includes(filters.project.toLowerCase())) return false;
        if (filters.folderPrefix && !candidate.relativePath.toLowerCase().startsWith(filters.folderPrefix.toLowerCase())) return false;
        if (filters.status) {
            const statuses = [candidate.sourceStatus, candidate.detectedStatus].filter(Boolean).map((value) => value.toLowerCase());
            if (!statuses.some((value) => value.includes(filters.status.toLowerCase()))) return false;
        }
        if (filters.understandingLevel && candidate.understandingLevel !== filters.understandingLevel) return false;
        if (filters.fileType && candidate.extension !== filters.fileType) return false;
        return true;
    });
}

function buildQueryExplanation(queryInfo, filters) {
    const segments = [];

    if (queryInfo.raw) {
        segments.push(`Searching for "${queryInfo.raw}" across filenames, folder paths, metadata, summaries, and extracted text.`);
    } else {
        segments.push('Showing indexed pCloud files with the selected filters.');
    }

    if (queryInfo.inferredFolderPrefix) {
        segments.push(`Detected a folder intent for "${queryInfo.inferredFolderPrefix}".`);
    }

    if (queryInfo.inferredDocumentType) {
        segments.push(`Detected a document-type hint for "${queryInfo.inferredDocumentType}".`);
    }

    if (queryInfo.inferredMediaType) {
        segments.push(`Detected a media hint for "${queryInfo.inferredMediaType}".`);
    }

    const filterBits = [];
    if (filters.fileType) filterBits.push(`type: ${filters.fileType}`);
    if (filters.client) filterBits.push(`client: ${filters.client}`);
    if (filters.project) filterBits.push(`project: ${filters.project}`);
    if (filters.folderPrefix) filterBits.push(`folder: ${filters.folderPrefix}`);
    if (filters.status) filterBits.push(`status: ${filters.status}`);
    if (filters.understandingLevel) filterBits.push(`understanding: ${filters.understandingLevel}`);

    if (filterBits.length > 0) {
        segments.push(`Active filters: ${filterBits.join(', ')}.`);
    }

    return segments.join(' ');
}

async function hydrateCandidates(fileIds, filters) {
    if (fileIds.length === 0) return [];

    let query = supabase
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
            last_seen_at,
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
                cleaned_text,
                extraction_status
            )
        `)
        .in('id', fileIds)
        .eq('is_active', true);

    query = applyBaseFilters(query, filters);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapJoinedRecord);
}

async function browsePCloud({ filters, page, pageSize, sort }) {
    let query = supabase
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
            last_seen_at,
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
                cleaned_text,
                extraction_status
            )
        `, { count: 'estimated' })
        .order('indexed_at', { ascending: sort !== 'newest' ? false : false });

    query = applyBaseFilters(query, filters);
    query = query.range((page - 1) * pageSize, (page - 1) * pageSize + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        results: (data || []).map((candidate) => {
            const explanation = buildResultExplanation({
                ...mapJoinedRecord(candidate),
                queryInfo: { phrase: '', tokens: [] },
                matchSignals: {
                    filenameExact: false,
                    pathExact: false,
                    clientExact: false,
                    projectExact: false,
                    documentTypeExact: false,
                    summaryExact: false,
                    extractedTextExact: false,
                    filenameTokens: [],
                    pathTokens: [],
                    clientTokens: [],
                    projectTokens: [],
                    documentTypeTokens: [],
                    summaryTokens: [],
                    extractedTokens: [],
                    folderFilter: filters.folderPrefix || '',
                    statusFilter: filters.status || '',
                    understandingFilter: filters.understandingLevel || '',
                },
                searchText: mapJoinedRecord(candidate).shortSummary || mapJoinedRecord(candidate).previewText || mapJoinedRecord(candidate).relativePath,
            });

            return {
                ...mapJoinedRecord(candidate),
                relevanceScore: Number(mapJoinedRecord(candidate).confidenceScore) || 0,
                explanation,
            };
        }),
        total: count || 0,
    };
}

export async function searchPCloud({
    query = '',
    filters = {},
    page = 1,
    pageSize = 20,
    sort = 'relevance',
} = {}) {
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const safePage = Math.max(Number(page) || 1, 1);
    
    // 1. AI Query Interpretation (Optional but adds "Smart" layer)
    let aiFilters = {};
    if (query.trim().length > 5) {
        const interpretation = await interpretQuery(query);
        if (interpretation) {
            aiFilters = {
                client: interpretation.client || filters.client,
                project: interpretation.project || filters.project,
                documentType: interpretation.documentType || filters.documentType,
            };
        }
    }

    const mergedFilters = { ...filters, ...aiFilters };
    const queryInfo = buildQueryInfo(query);

    if (!queryInfo.raw) {
        const browse = await browsePCloud({
            filters: mergedFilters,
            page: safePage,
            pageSize: safePageSize,
            sort,
        });

        return {
            results: browse.results,
            total: browse.total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(Math.ceil((browse.total || 0) / safePageSize), 1),
            sort,
            queryInfo,
            queryExplanation: buildQueryExplanation(queryInfo, mergedFilters),
            semantic: {
                provider: 'noop',
                enabled: false,
                hits: [],
            },
        };
    }

    const candidateLimit = Math.max(safePageSize * 6, 120);

    const [metadataCandidateIds, understandingCandidateIds, textCandidateIds, semanticResult] = await Promise.all([
        fetchMetadataCandidateIds(queryInfo, mergedFilters, candidateLimit),
        fetchUnderstandingCandidateIds(queryInfo, mergedFilters, candidateLimit),
        fetchTextCandidateIds(queryInfo, mergedFilters, candidateLimit),
        createSemanticProvider().search({ query, filters: mergedFilters, limit: candidateLimit }),
    ]);

    const uniqueIds = Array.from(new Set([
        ...metadataCandidateIds,
        ...understandingCandidateIds,
        ...textCandidateIds,
    ]));

    const hydratedCandidates = await hydrateCandidates(uniqueIds, mergedFilters);
    const filtered = filterCandidates(hydratedCandidates, mergedFilters);
    const ranked = filtered
        .map((candidate) => {
            const ranking = scoreCandidate(candidate, queryInfo, mergedFilters);
            const explanation = buildResultExplanation({
                ...candidate,
                queryInfo,
                matchSignals: ranking.matchSignals,
                searchText: candidate.shortSummary || candidate.previewText || candidate.cleanedText || candidate.relativePath,
            });

            return {
                ...candidate,
                relevanceScore: ranking.normalizedScore,
                confidenceScore: candidate.confidenceScore || ranking.normalizedScore,
                explanation,
            };
        })
        .filter((item) => queryInfo.raw ? item.relevanceScore > 0 : true)
        .sort((a, b) => {
            if (sort === 'newest') {
                return new Date(b.indexedAt || 0).getTime() - new Date(a.indexedAt || 0).getTime();
            }
            if (b.relevanceScore !== a.relevanceScore) {
                return b.relevanceScore - a.relevanceScore;
            }
            return new Date(b.indexedAt || 0).getTime() - new Date(a.indexedAt || 0).getTime();
        });

    const total = ranked.length;
    const start = (safePage - 1) * safePageSize;
    const pagedResults = ranked.slice(start, start + safePageSize);

    return {
        results: pagedResults,
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.max(Math.ceil(total / safePageSize), 1),
        sort,
        queryInfo,
        queryExplanation: buildQueryExplanation(queryInfo, filters),
        semantic: semanticResult,
    };
}

export async function askPCloud({
    query = '',
    filters = {},
    pageSize = 6,
} = {}) {
    // 1. Get structured interpretation
    const interpretation = await interpretQuery(query);
    const mergedFilters = interpretation ? { ...filters, ...interpretation } : filters;

    // 2. Perform search
    const search = await searchPCloud({
        query,
        filters: mergedFilters,
        page: 1,
        pageSize,
        sort: 'relevance',
    });

    const topResults = (search.results || []).slice(0, pageSize);
    const strongest = topResults[0];
    const averageScore = topResults.length === 0
        ? 0
        : topResults.reduce((sum, item) => sum + (item.relevanceScore || 0), 0) / topResults.length;

    if (topResults.length === 0) {
        return {
            query,
            answer: `I could not find any indexed pCloud files that confidently match "${query}". Try a broader query or fewer filters.`,
            confidence: 'low',
            confidenceScore: 0,
            supportingFiles: [],
            queryExplanation: search.queryExplanation,
        };
    }

    // 3. Generative Synthesis
    if (!process.env.OPENAI_API_KEY) {
        let fallbackAnswer = `I found ${search.total} possible matches for "${query}". The strongest match is ${strongest.filename}.`;
        return {
            query,
            answer: fallbackAnswer,
            confidence: (strongest?.relevanceScore || 0) >= 0.7 ? 'high' : 'medium',
            confidenceScore: Number(averageScore.toFixed(2)),
            supportingFiles: topResults,
            queryExplanation: search.queryExplanation,
        };
    }

    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const context = topResults.map((res, i) => 
            `MATCH ${i+1}: File: ${res.filename} | Path: ${res.relativePath} | Summary: ${res.shortSummary || 'N/A'} | Snippet: ${(res.previewText || '').slice(0, 300)}`
        ).join('\n---\n');

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an AI assistant for the Pico Digital Asset Management system. 
Based on the following search results, provide a CONCISE (2-3 sentences) answer to the user's question.
Be honest about confidence. If the data is vague, say "I found some potential matches but they don't explicitly contain X".
Only use information from the provided context. Do not invent details.`
                },
                {
                    role: 'user',
                    content: `QUESTION: ${query}\n\nCONTEXT:\n${context}`
                }
            ],
            temperature: 0.3,
        });

        const answer = response.choices[0].message.content;
        const confidence = (strongest?.relevanceScore || 0) >= 0.7 ? 'high' : (strongest?.relevanceScore || 0) >= 0.4 ? 'medium' : 'low';

        return {
            query,
            answer,
            confidence,
            confidenceScore: Number(averageScore.toFixed(2)),
            lowConfidence: confidence === 'low',
            supportingFiles: topResults,
            queryExplanation: search.queryExplanation,
            semantic: search.semantic,
        };
    } catch (err) {
        console.error('Synthesis failed:', err);
        // Fallback to original template based logic
        let fallbackAnswer = `I found ${search.total} possible matches for "${query}". The strongest match is ${strongest.filename}.`;
        return {
            query,
            answer: fallbackAnswer,
            confidence: 'medium',
            confidenceScore: Number(averageScore.toFixed(2)),
            supportingFiles: topResults,
            queryExplanation: search.queryExplanation,
        };
    }
}

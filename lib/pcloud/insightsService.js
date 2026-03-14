import { supabase } from '@/lib/supabase';
import {
    getRootAreaLabel,
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeFolderPrefixLabel,
    normalizeProjectLabel,
    normalizeUnderstandingLevel,
} from './normalization.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHUNK_SIZE = 5000;

const cache = globalThis.__pcloudInsightsCache || new Map();
if (!globalThis.__pcloudInsightsCache) {
    globalThis.__pcloudInsightsCache = cache;
}

const IGNORED_EXTENSIONS = new Set(['db', 'bup', 'ifo', 'ini', 'ds_store', 'tmp', 'temp', 'dat', 'bak', 'log']);
const IGNORED_FILENAMES = new Set(['thumbs.db', 'desktop.ini', '.pcloud', '.tmp']);

const DOCUMENT_TYPE_BUCKETS = [
    'quotation',
    'contract',
    'render',
    'presentation',
    'spreadsheet',
    'report',
    'scanned_document',
    'design',
    'archive',
    'image',
    'audio',
    'video',
    'unknown',
];

// Maps detected_document_type DB values to display buckets.
// Handles both canonical types (from classifier) and loose label aliases.
const DOCUMENT_TYPE_ALIASES = {
    // Canonical classifier outputs
    quotation:        'quotation',
    contract:         'contract',
    render:           'render',
    presentation:     'presentation',
    spreadsheet:      'spreadsheet',
    report:           'report',
    scanned_document: 'scanned_document',
    photo_asset:      'image',
    video_asset:      'video',
    audio_recording:  'audio',
    // Loose aliases for older / alternative labels
    quote:       'quotation',
    mockup:      'render',
    proposal:    'presentation',
    ppt:         'presentation',
    excel:       'spreadsheet',
    image:       'image',
    photo:       'image',
    logo:        'image',
    audio:       'audio',
    recording:   'audio',
    video:       'video',
    design:      'design',
    artwork:     'design',
    archive:     'archive',
    zip:         'archive',
    rar:         'archive',
};

async function selectViewRows(viewName, options = {}) {
    let query = supabase.from(viewName).select('*');
    if (options.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending || false });
    }
    if (options.limit) {
        query = query.limit(options.limit);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

function withCache(key, loader) {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    const value = Promise.resolve().then(loader).catch((error) => {
        cache.delete(key);
        throw error;
    });
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
}

function monthKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function yearKey(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return String(date.getUTCFullYear());
}

function formatMonthLabel(key) {
    if (!key || key === 'Unknown') return key;
    const [year, month] = key.split('-');
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function getRootArea(relativePath = '') {
    return getRootAreaLabel(relativePath);
}

function inc(map, key, amount = 1) {
    map.set(key, (map.get(key) || 0) + amount);
}

function sortEntries(map, limit = 10) {
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([label, value]) => ({ label, value }));
}

async function fetchChunked(table, columns, options = {}) {
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    let from = 0;
    let rows = [];
    let keepGoing = true;

    while (keepGoing) {
        let query = supabase
            .from(table)
            .select(columns)
            .range(from, from + chunkSize - 1);

        if (typeof options.apply === 'function') {
            query = options.apply(query);
        }

        const { data, error } = await query;
        if (error) throw error;

        rows = rows.concat(data || []);
        if (!data || data.length < chunkSize) {
            keepGoing = false;
        } else {
            from += chunkSize;
        }
    }

    return rows;
}

function normalizeDocType(value, extension = '') {
    // Direct alias lookup on the raw value first (handles canonical DB types)
    const lower = (value || '').toLowerCase().trim();
    if (lower && DOCUMENT_TYPE_ALIASES[lower]) return DOCUMENT_TYPE_ALIASES[lower];

    // Try the canonical normalizer from lib (handles label variants)
    const canonical = (normalizeDocumentType(value) || '').toLowerCase();
    if (canonical && DOCUMENT_TYPE_ALIASES[canonical]) return DOCUMENT_TYPE_ALIASES[canonical];

    // Extension fallback
    const ext = extension.toLowerCase();
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) return 'audio';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
    if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
    if (['psd', 'ai', 'indd', 'dwg'].includes(ext)) return 'design';
    return 'unknown';
}

function normalizeFilename(filename = '') {
    return filename
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/\b(v|rev|r)\d+\b/g, '')
        .replace(/\bcopy\b/g, '')
        .replace(/[_\-.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildRecentWindowCutoff(days = 30) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString();
}

function regroupRows(rows = [], normalizeLabel) {
    const totals = new Map();
    rows.forEach((row) => {
        const rawLabel = row.label || row.client || row.project || row.root_area || row.folder_prefix || row.understanding_level || 'Unassigned';
        const normalizedLabel = normalizeLabel(rawLabel);
        if (!normalizedLabel) return;
        const value = Number(row.value || row.candidate_count || 0);
        inc(totals, normalizedLabel, value);
    });
    return sortEntries(totals, rows.length || 10);
}

export async function getDashboardStats() {
    return withCache('dashboard-stats', async () => {
        const recentCutoff = buildRecentWindowCutoff(30);

        const [
            totalFilesRes,
            metadataOnlyRes,
            understoodRes,
            needsReviewRes,
            pendingReviewRes,
            ignoredRes,
            recentIndexedRes,
            recentErrorCountRes,
            recentFiles,
            recentReviewsRaw,
            recentJobsRaw,
            recentErrors,
        ] = await Promise.all([
            supabase.from('pcloud_file_records').select('id', { count: 'exact', head: true }).eq('is_active', true),
            supabase.from('pcloud_file_understandings').select('id', { count: 'exact', head: true }).eq('understanding_level', 'metadata_only'),
            supabase.from('pcloud_file_understandings').select('id', { count: 'exact', head: true }).in('understanding_level', ['content_understood', 'filename_path_inferred']),
            // Use requires_review flag — it is always updated on reclassify, unlike
            // understanding_level which can stay 'needs_review' after confidence rises.
            supabase.from('pcloud_file_understandings').select('id', { count: 'exact', head: true }).eq('requires_review', true),
            supabase.from('pcloud_review_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('pcloud_file_understandings').select('id', { count: 'exact', head: true }).eq('understanding_level', 'ignored'),
            supabase.from('pcloud_file_records').select('id', { count: 'exact', head: true }).eq('is_active', true).gte('indexed_at', recentCutoff),
            // Scope error count to the same 30-day window to avoid accumulating historical noise.
            supabase.from('pcloud_processing_errors').select('id', { count: 'exact', head: true }).gte('created_at', recentCutoff),
            supabase.from('pcloud_file_records').select('id, filename, extension, relative_path, indexed_at').eq('is_active', true).order('indexed_at', { ascending: false }).limit(8),
            supabase.from('pcloud_review_queue').select('id, file_record_id, review_reason, confidence_score, status, created_at').order('created_at', { ascending: false }).limit(8),
            supabase.from('pcloud_processing_jobs').select('*').order('started_at', { ascending: false }).limit(5),
            supabase.from('pcloud_processing_errors').select('*').order('created_at', { ascending: false }).limit(8),
        ]);

        const reviewFileIds = (recentReviewsRaw.data || []).map((item) => item.file_record_id).filter(Boolean);
        const reviewFilesMap = new Map();
        if (reviewFileIds.length > 0) {
            const { data: reviewFiles } = await supabase
                .from('pcloud_file_records')
                .select('id, filename, relative_path')
                .in('id', reviewFileIds);

            (reviewFiles || []).forEach((file) => reviewFilesMap.set(file.id, file));
        }

        const recentReviews = (recentReviewsRaw.data || []).map((item) => ({
            ...item,
            filename: reviewFilesMap.get(item.file_record_id)?.filename || 'Unknown file',
            relative_path: reviewFilesMap.get(item.file_record_id)?.relative_path || '',
        }));

        const recentJobs = (recentJobsRaw.data || []).map((job) => ({
            id: job.id,
            jobType: job.job_type,
            status: job.status,
            rootPath: job.root_path,
            totalFiles: job.total_files,
            processedFiles: job.processed_files,
            errorCount: job.error_count,
            startedAt: job.started_at,
            completedAt: job.completed_at,
            notes: job.notes,
        }));

        return {
            kpis: {
                totalFiles: totalFilesRes.count || 0,
                understoodFiles: understoodRes.count || 0,
                metadataOnly: metadataOnlyRes.count || 0,
                needsReview: needsReviewRes.count || 0,
                pendingReviews: pendingReviewRes.count || 0,
                recentIndexed: recentIndexedRes.count || 0,
                errorCount: recentErrorCountRes.count || 0,
                ignoredApprox: ignoredRes.count || 0,
            },
            recentActivity: {
                recentFiles: recentFiles.data || [],
                recentReviews,
                recentJobs,
                recentErrors: recentErrors.data || [],
            },
        };
    });
}

async function getFileSnapshot() {
    return withCache('snapshot-files', async () => fetchChunked(
        'pcloud_file_records',
        'id, filename, extension, size_bytes, relative_path, parent_path, indexed_at',
        { apply: (query) => query.eq('is_active', true) }
    ));
}

async function getUnderstandingSnapshot() {
    return withCache('snapshot-understandings', async () => fetchChunked(
        'pcloud_file_understandings',
        'file_record_id, detected_client, detected_project, detected_document_type, understanding_level, confidence_score, requires_review, created_at'
    ));
}

async function getReviewSnapshot() {
    return withCache('snapshot-reviews', async () => fetchChunked(
        'pcloud_review_queue',
        'file_record_id, review_reason, confidence_score, status, created_at'
    ));
}

async function getErrorSnapshot() {
    return withCache('snapshot-errors', async () => fetchChunked(
        'pcloud_processing_errors',
        'error_type, file_path, created_at'
    ));
}

async function getExtractionSnapshot() {
    return withCache('snapshot-extractions', async () => fetchChunked(
        'pcloud_extracted_contents',
        'extraction_status, extraction_type'
    ));
}

export async function getClientInsights() {
    return withCache('insights-clients', async () => {
        try {
            const [totalByClient, recentByClient, understoodByClient] = await Promise.all([
                selectViewRows('pcloud_insight_clients_total', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_clients_recent', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_clients_understood', { orderBy: 'value', limit: 8 }),
            ]);
            return {
                totalByClient: regroupRows(totalByClient, (label) => normalizeClientLabel(label) || 'Unassigned'),
                recentByClient: regroupRows(recentByClient, (label) => normalizeClientLabel(label) || 'Unassigned'),
                understoodByClient: regroupRows(understoodByClient, (label) => normalizeClientLabel(label) || 'Unassigned'),
            };
        } catch {}

        const rows = await getUnderstandingSnapshot();
        const recentCutoff = buildRecentWindowCutoff(30);

        const totals = new Map();
        const recent = new Map();
        const understood = new Map();

        rows.forEach((row) => {
            const client = normalizeClientLabel(row.detected_client) || 'Unassigned';
            inc(totals, client);
            if (row.created_at >= recentCutoff) inc(recent, client);
            if (['content_understood', 'filename_path_inferred'].includes(row.understanding_level)) inc(understood, client);
        });

        return {
            totalByClient: sortEntries(totals, 8),
            recentByClient: sortEntries(recent, 8),
            understoodByClient: sortEntries(understood, 8),
        };
    });
}

export async function getTrendInsights() {
    return withCache('insights-trends', async () => {
        try {
            const [monthlyTrend, yearlyDistribution, recentIndexingActivity] = await Promise.all([
                selectViewRows('pcloud_insight_trends_monthly', { orderBy: 'sort_key', ascending: true }),
                selectViewRows('pcloud_insight_trends_yearly', { orderBy: 'sort_key', ascending: true }),
                selectViewRows('pcloud_insight_trends_recent_daily', { orderBy: 'sort_key', ascending: true }),
            ]);
            return { monthlyTrend, yearlyDistribution, recentIndexingActivity };
        } catch {}

        const rows = await getFileSnapshot();

        const monthly = new Map();
        const yearly = new Map();
        const recentWeekly = new Map();
        const weeklyCutoff = buildRecentWindowCutoff(28);

        rows.forEach((row) => {
            const month = monthKey(row.indexed_at);
            const year = yearKey(row.indexed_at);
            inc(monthly, month);
            inc(yearly, year);

            if (row.indexed_at >= weeklyCutoff) {
                const day = new Date(row.indexed_at).toISOString().slice(0, 10);
                inc(recentWeekly, day);
            }
        });

        const monthlyTrend = Array.from(monthly.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([key, value]) => ({ key, label: formatMonthLabel(key), value }));

        const yearlyDistribution = Array.from(yearly.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, value]) => ({ label, value }));

        const recentIndexingActivity = Array.from(recentWeekly.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, value]) => ({ label, value }));

        return {
            monthlyTrend,
            yearlyDistribution,
            recentIndexingActivity,
        };
    });
}

export async function getDistributionInsights() {
    return withCache('insights-distribution', async () => {
        try {
            const [documentDistribution, understandingQuality] = await Promise.all([
                selectViewRows('pcloud_insight_document_distribution', { orderBy: 'value', limit: DOCUMENT_TYPE_BUCKETS.length }),
                selectViewRows('pcloud_insight_understanding_distribution', { orderBy: 'value', limit: 10 }),
            ]);
            return {
                documentDistribution: regroupRows(documentDistribution, (label) => normalizeDocType(label) || 'unknown'),
                understandingQuality: regroupRows(understandingQuality, (label) => normalizeUnderstandingLevel(label)),
            };
        } catch {}

        const [files, understandings] = await Promise.all([
            getFileSnapshot(),
            getUnderstandingSnapshot(),
        ]);
        const understandingMap = new Map(understandings.map((row) => [row.file_record_id, row]));

        const documentDistribution = new Map(DOCUMENT_TYPE_BUCKETS.map((bucket) => [bucket, 0]));
        const understandingQuality = new Map();

        files.forEach((row) => {
            const understanding = understandingMap.get(row.id);
            const bucket = normalizeDocType(understanding?.detected_document_type, row.extension);
            inc(documentDistribution, bucket);
            inc(understandingQuality, normalizeUnderstandingLevel(understanding?.understanding_level || 'metadata_only'));
        });

        return {
            documentDistribution: sortEntries(documentDistribution, DOCUMENT_TYPE_BUCKETS.length),
            understandingQuality: sortEntries(understandingQuality, 10),
        };
    });
}

export async function getFolderInsights() {
    return withCache('insights-folders', async () => {
        try {
            const [rootAreas, folderPrefixes, projectAreas] = await Promise.all([
                selectViewRows('pcloud_insight_root_areas', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_folder_prefixes', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_project_areas', { orderBy: 'value', limit: 8 }),
            ]);
            return {
                rootAreas: regroupRows(rootAreas, (label) => getRootAreaLabel(label)),
                folderPrefixes: regroupRows(folderPrefixes, (label) => normalizeFolderPrefixLabel(label)),
                projectAreas: regroupRows(projectAreas, (label) => normalizeProjectLabel(label) || getRootAreaLabel(label)),
            };
        } catch {}

        const [fileRows, understandings] = await Promise.all([
            getFileSnapshot(),
            getUnderstandingSnapshot(),
        ]);
        const understandingMap = new Map(understandings.map((row) => [row.file_record_id, row]));

        const rootAreas = new Map();
        const folderPrefixes = new Map();
        const projectAreas = new Map();

        fileRows.forEach((row) => {
            const root = getRootArea(row.relative_path);
            const prefix = row.parent_path || '(root)';
            const understanding = understandingMap.get(row.id);
            const project = normalizeProjectLabel(understanding?.detected_project) || root;

            inc(rootAreas, root);
            inc(folderPrefixes, normalizeFolderPrefixLabel(prefix));
            inc(projectAreas, project);
        });

        return {
            rootAreas: sortEntries(rootAreas, 8),
            folderPrefixes: sortEntries(folderPrefixes, 8),
            projectAreas: sortEntries(projectAreas, 8),
        };
    });
}

export async function getReviewInsights() {
    return withCache('insights-review', async () => {
        try {
            const [backlogByStatus, topReviewReasons, foldersWithMostReviewItems, lowConfidenceTrend] = await Promise.all([
                selectViewRows('pcloud_insight_review_backlog', { orderBy: 'value', limit: 6 }),
                selectViewRows('pcloud_insight_review_reasons', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_review_folders', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_low_confidence_trend', { orderBy: 'sort_key', ascending: true }),
            ]);
            return {
                backlogByStatus,
                topReviewReasons,
                foldersWithMostReviewItems: regroupRows(foldersWithMostReviewItems, (label) => getRootAreaLabel(label)),
                lowConfidenceTrend,
            };
        } catch {}

        const [reviewRows, fileRows] = await Promise.all([
            getReviewSnapshot(),
            getFileSnapshot(),
        ]);
        const fileMap = new Map(fileRows.map((row) => [row.id, row]));

        const backlogByStatus = new Map();
        const reviewReasons = new Map();
        const folderLoad = new Map();
        const lowConfidenceTrend = new Map();

        reviewRows.forEach((row) => {
            inc(backlogByStatus, row.status || 'pending');
            inc(reviewReasons, row.review_reason || 'unknown');

            const file = fileMap.get(row.file_record_id);
            const folder = file ? getRootArea(file.relative_path) : 'Unknown';
            inc(folderLoad, folder);

            if (Number(row.confidence_score) < 0.6) {
                const key = monthKey(row.created_at);
                inc(lowConfidenceTrend, key);
            }
        });

        return {
            backlogByStatus: sortEntries(backlogByStatus, 6),
            topReviewReasons: sortEntries(reviewReasons, 8),
            foldersWithMostReviewItems: sortEntries(folderLoad, 8),
            lowConfidenceTrend: Array.from(lowConfidenceTrend.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .slice(-12)
                .map(([key, value]) => ({ key, label: formatMonthLabel(key), value })),
        };
    });
}

export async function getHealthInsights() {
    return withCache('insights-health', async () => {
        try {
            const [duplicateCandidates, ignoredSystemFilesApprox, errorTypes, extractionFailuresByType] = await Promise.all([
                selectViewRows('pcloud_insight_duplicate_candidates', { orderBy: 'candidate_count', limit: 8 }),
                selectViewRows('pcloud_insight_ignored_files', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_error_types', { orderBy: 'value', limit: 8 }),
                selectViewRows('pcloud_insight_extraction_failures', { orderBy: 'value', limit: 8 }),
            ]);
            return {
                duplicateCandidates: duplicateCandidates.map((row) => ({
                    area: row.area,
                    candidateCount: row.candidate_count,
                    sampleFiles: [
                        { id: row.sample_file_id_1 || `${row.area}-1`, filename: row.sample_file_1, relativePath: row.sample_path_1, sizeBytes: 0 },
                        { id: row.sample_file_id_2 || `${row.area}-2`, filename: row.sample_file_2, relativePath: row.sample_path_2, sizeBytes: 0 },
                        { id: row.sample_file_id_3 || `${row.area}-3`, filename: row.sample_file_3, relativePath: row.sample_path_3, sizeBytes: 0 },
                    ].filter((item) => item.filename),
                })),
                ignoredSystemFilesApprox,
                errorTypes,
                extractionFailuresByType,
            };
        } catch {}

        const [fileRows, errorRows, extractedRows] = await Promise.all([
            getFileSnapshot(),
            getErrorSnapshot(),
            getExtractionSnapshot(),
        ]);

        const duplicateGroups = new Map();
        const ignoredCounts = new Map();
        const errorTypes = new Map();
        const extractionFailures = new Map();

        fileRows.forEach((row) => {
            const root = getRootArea(row.relative_path);
            const normalized = normalizeFilename(row.filename);
            const sizeBucket = row.size_bytes ? Math.round(Number(row.size_bytes) / 10240) : 0;
            const key = `${root}::${normalized}::${sizeBucket}`;

            if (!duplicateGroups.has(key)) {
                duplicateGroups.set(key, {
                    area: root,
                    files: [],
                });
            }

            duplicateGroups.get(key).files.push({
                id: row.id,
                filename: row.filename,
                relativePath: row.relative_path,
                sizeBytes: Number(row.size_bytes) || 0,
            });

            const extension = (row.extension || '').toLowerCase();
            const filename = (row.filename || '').toLowerCase();
            if (IGNORED_EXTENSIONS.has(extension) || IGNORED_FILENAMES.has(filename)) {
                inc(ignoredCounts, extension || filename || 'ignored');
            }
        });

        errorRows.forEach((row) => {
            inc(errorTypes, row.error_type || 'unknown');
        });

        extractedRows.forEach((row) => {
            if (row.extraction_status && row.extraction_status !== 'completed' && row.extraction_status !== 'skipped') {
                inc(extractionFailures, row.extraction_type || 'unknown');
            }
        });

        const duplicateCandidates = Array.from(duplicateGroups.values())
            .filter((group) => group.files.length > 1)
            .sort((a, b) => b.files.length - a.files.length)
            .slice(0, 8)
            .map((group) => ({
                area: group.area,
                candidateCount: group.files.length,
                sampleFiles: group.files.slice(0, 3),
            }));

        return {
            duplicateCandidates,
            ignoredSystemFilesApprox: sortEntries(ignoredCounts, 8),
            errorTypes: sortEntries(errorTypes, 8),
            extractionFailuresByType: sortEntries(extractionFailures, 8),
        };
    });
}

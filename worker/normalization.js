const IGNORED_PATH_TOKENS = new Set([
    'thumbs',
    'thumbs.db',
    'desktop.ini',
    'dcim',
    'misc',
    'temp',
    'tmp',
    'cache',
    'backup',
    'old',
    'finalfinal',
    'image',
    'images',
    'img',
    'photo',
    'photos',
    'video',
    'videos',
    'media',
    'docs',
    'doc',
    'files',
    'file',
    // NOTE: 'scan' and 'scanner' intentionally removed — these folder names
    // map to the scanned_document document type and should not be suppressed.
    'whatsapp',
    'screenshot',
    'screenshots',
    'copy',
    'new folder',
]);

const WEAK_CLIENT_TOKENS = new Set([
    ...IGNORED_PATH_TOKENS,
    'clients',
    'client',
    'projects',
    'project',
    'events',
    'event',
    'resources',
    'resource',
    'quotations',
    'quotation',
    'contracts',
    'contract',
    'presentations',
    'presentation',
    'templates',
    'template',
    'branding',
    'render',
    'renders',
    'documents',
    'document',
    'unassigned',
    'unknown',
    'bahrain',
]);

const WEAK_PROJECT_TOKENS = new Set([
    ...IGNORED_PATH_TOKENS,
    'clients',
    'projects',
    'events',
    'resources',
    'quotations',
    'contracts',
    'presentations',
    'templates',
    'branding',
    'logos',
    'logo',
    'guidelines',
    'assets',
    'department',
    'departments',
    'admin',
    'finance',
    'marketing',
    'operations',
    'sales',
    'hr',
    'general',
    'master',
    'archive',
    'archives',
]);

const DOCUMENT_TYPE_ALIASES = {
    quote: 'quotation',
    quotation: 'quotation',
    boq: 'quotation',
    estimate: 'quotation',
    proposal: 'quotation',
    contract: 'contract',
    agreement: 'contract',
    presentation: 'presentation',
    ppt: 'presentation',
    pptx: 'presentation',
    deck: 'presentation',
    render: 'render',
    mockup: 'render',
    // 'design' removed — too broad as a folder token (maps to render incorrectly)
    artwork: 'render',
    report: 'report',
    recap: 'report',
    brief: 'report',
    // 'scope' removed — too generic (telescope scope, etc.)
    // 'plan' removed — too generic (floor plan, site plan, etc.)
    schedule: 'report',
    spreadsheet: 'spreadsheet',
    excel: 'spreadsheet',
    xls: 'spreadsheet',
    xlsx: 'spreadsheet',
    csv: 'spreadsheet',
    photo: 'photo_asset',
    image: 'photo_asset',
    screenshot: 'photo_asset',
    video: 'video_asset',
    clip: 'video_asset',
    audio: 'audio_recording',
    voice: 'audio_recording',
    recording: 'audio_recording',
    scan: 'scanned_document',
    scanner: 'scanned_document',
};

const SYSTEM_FILENAMES = new Set(['thumbs.db', 'desktop.ini', '.ds_store', '.pcloud']);

const CAMERA_STYLE_PATTERNS = [
    /^img[_-]?\d+$/i,
    /^dsc[_-]?\d+$/i,
    /^scan[_-]?\d+$/i,
    /^photo[_-]?\d+$/i,
    /^image[_-]?\d+$/i,
    /^vid[_-]?\d+$/i,
    /^pxl[_-]?\d+$/i,
    // Real WhatsApp format after cleanLabel(): "whatsapp image 2023-01-15..."
    /^whatsapp (image|video|audio) \d{4}/i,
];

function cleanLabel(value) {
    if (!value) return '';
    return String(value)
        .replace(/\\/g, '/')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/[()[\]{}]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTitleCase(value) {
    return value
        .split(' ')
        .filter(Boolean)
        .map((part) => {
            if (part.length <= 3 && part === part.toUpperCase()) return part;
            if (/^\d+$/.test(part)) return part;
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
}

function isYearOnly(value) {
    return /^(19|20)\d{2}$/.test(value || '');
}

function normalizeClientLabel(value) {
    const cleaned = cleanLabel(value);
    const lower = cleaned.toLowerCase();
    if (!cleaned || WEAK_CLIENT_TOKENS.has(lower) || isYearOnly(lower)) return null;
    if (
        lower === 'pico bahrain' ||
        lower === 'pico bahrain projects' ||
        lower === 'pico bahrain project' ||
        lower === 'pico bahrain proposals'
    ) {
        return 'Pico Bahrain';
    }
    if (lower === 'bahrain') return null;
    const normalized = cleaned
        .replace(/\b(client|clients|project|projects|files|docs|documents)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;
    if (WEAK_CLIENT_TOKENS.has(normalized.toLowerCase()) || isYearOnly(normalized.toLowerCase())) return null;
    return toTitleCase(normalized);
}

function normalizeProjectLabel(value) {
    const cleaned = cleanLabel(value);
    const lower = cleaned.toLowerCase();
    if (!cleaned || WEAK_PROJECT_TOKENS.has(lower) || isYearOnly(lower)) return null;
    const normalized = cleaned
        .replace(/\b(events|event|project|projects|campaign|campaigns|files|docs|documents)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return null;
    if (WEAK_PROJECT_TOKENS.has(normalized.toLowerCase()) || isYearOnly(normalized.toLowerCase())) return null;
    return toTitleCase(normalized);
}

function normalizeDocumentType(value, fallbackMediaType = '') {
    const cleaned = cleanLabel(value).toLowerCase();
    if (cleaned) {
        // Token-based exact matching — prevents substring false positives such as
        // "floor plan" -> report, "reschedule" -> report, "design brief" -> render.
        const tokens = cleaned.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
            const canonical = DOCUMENT_TYPE_ALIASES[token];
            if (canonical) return canonical;
        }
    }
    const media = (fallbackMediaType || '').toLowerCase();
    if (media === 'image') return 'photo_asset';
    if (media === 'video') return 'video_asset';
    if (media === 'audio') return 'audio_recording';
    if (media === 'document') return 'scanned_document';
    return null;
}

function isIgnoredPathToken(value) {
    const lower = cleanLabel(value).toLowerCase();
    if (!lower) return true;
    return IGNORED_PATH_TOKENS.has(lower);
}

function isSystemFilename(filename) {
    return SYSTEM_FILENAMES.has(String(filename || '').toLowerCase().trim());
}

function isCameraStyleFilename(filename) {
    const base = cleanLabel(filename).toLowerCase();
    return CAMERA_STYLE_PATTERNS.some((pattern) => pattern.test(base));
}

function extractTrustedProjectFromPath(segments = []) {
    const cleanedSegments = segments.map((segment) => cleanLabel(segment)).filter(Boolean);
    const lowered = cleanedSegments.map((segment) => segment.toLowerCase());

    const eventIndex = lowered.indexOf('events');
    if (eventIndex >= 0 && cleanedSegments[eventIndex + 1]) {
        return normalizeProjectLabel(cleanedSegments[eventIndex + 1]);
    }

    if (lowered[0] === 'clients' && cleanedSegments[2]) {
        return normalizeProjectLabel(cleanedSegments[2]);
    }

    if (lowered[0] && lowered[0].startsWith('pico bahrain project')) {
        if (cleanedSegments[2] && !isIgnoredPathToken(cleanedSegments[2])) {
            return normalizeProjectLabel(cleanedSegments[2]);
        }

        const mediaFolderIndex = lowered.findIndex((segment) =>
            ['photos', 'photo', 'video', 'videos', 'media', 'quotations', 'contracts', 'presentations'].includes(segment)
        );
        if (mediaFolderIndex > 0) {
            for (let i = mediaFolderIndex - 1; i >= 1; i -= 1) {
                const candidate = normalizeProjectLabel(cleanedSegments[i]);
                if (candidate) return candidate;
            }
        }
    }

    return null;
}

module.exports = {
    normalizeClientLabel,
    normalizeProjectLabel,
    normalizeDocumentType,
    isIgnoredPathToken,
    isSystemFilename,
    isCameraStyleFilename,
    extractTrustedProjectFromPath,
};

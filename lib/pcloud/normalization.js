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
    // carry scanned_document type information and must not be suppressed.
    'whatsapp',
    'screenshot',
    'screenshots',
    'copy',
    'new folder',
    '__macosx',
    '.pcloud',
    '.tmp',
    '$recycle.bin',
    'system volume information',
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
    'quotes',
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
    'untitled',
    'unknown',
    'unassigned',
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

const SYSTEM_FILENAMES = new Set([
    'thumbs.db',
    'desktop.ini',
    '.ds_store',
    '.pcloud',
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
    // 'design' removed — too broad (design folder should not map to render type)
    artwork: 'render',
    report: 'report',
    recap: 'report',
    brief: 'report',
    // 'scope' removed — too generic
    // 'plan' removed — too generic (floor plan, site plan, etc.)
    schedule: 'report',
    spreadsheet: 'spreadsheet',
    sheet: 'spreadsheet',
    excel: 'spreadsheet',
    xls: 'spreadsheet',
    xlsx: 'spreadsheet',
    csv: 'spreadsheet',
    photo: 'photo_asset',
    photos: 'photo_asset',
    image: 'photo_asset',
    images: 'photo_asset',
    screenshot: 'photo_asset',
    screenshots: 'photo_asset',
    video: 'video_asset',
    videos: 'video_asset',
    clip: 'video_asset',
    footage: 'video_asset',
    audio: 'audio_recording',
    voice: 'audio_recording',
    recording: 'audio_recording',
    scan: 'scanned_document',
    scanned: 'scanned_document',
    scanner: 'scanned_document',
};

const ROOT_AREA_ALIASES = {
    resources: 'RESOURCES',
    'pico bahrain projects': 'Pico Bahrain Projects',
    'pico bahrain proposals': 'Pico Bahrain Proposals',
    clients: 'Clients',
    events: 'EVENTS',
};

const CAMERA_STYLE_PATTERNS = [
    /^img[_-]?\d+$/i,
    /^dsc[_-]?\d+$/i,
    /^scan[_-]?\d+$/i,
    /^photo[_-]?\d+$/i,
    /^image[_-]?\d+$/i,
    /^vid[_-]?\d+$/i,
    /^pxl[_-]?\d+$/i,
    /^whatsapp image \d+/i,
    /^whatsapp video \d+/i,
    // Real WhatsApp format after cleanLabel(): "whatsapp image 2023-01-15 at ..."
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

export function isIgnoredPathToken(value) {
    const lower = cleanLabel(value).toLowerCase();
    if (!lower) return true;
    return IGNORED_PATH_TOKENS.has(lower);
}

export function isSystemFilename(filename) {
    const lower = String(filename || '').toLowerCase().trim();
    return SYSTEM_FILENAMES.has(lower);
}

export function isCameraStyleFilename(filename) {
    const base = cleanLabel(filename).toLowerCase();
    return CAMERA_STYLE_PATTERNS.some((pattern) => pattern.test(base));
}

export function normalizeClientLabel(value) {
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

    if (lower === 'bahrain') {
        return null;
    }

    const normalized = cleaned
        .replace(/\b(client|clients|project|projects|files|docs|documents)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return null;
    const normalizedLower = normalized.toLowerCase();
    if (WEAK_CLIENT_TOKENS.has(normalizedLower) || isYearOnly(normalizedLower)) return null;
    return toTitleCase(normalized);
}

export function normalizeProjectLabel(value) {
    const cleaned = cleanLabel(value);
    const lower = cleaned.toLowerCase();
    if (!cleaned || WEAK_PROJECT_TOKENS.has(lower) || isYearOnly(lower)) return null;

    const normalized = cleaned
        .replace(/\b(events|event|project|projects|campaign|campaigns|files|docs|documents)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return null;
    const normalizedLower = normalized.toLowerCase();
    if (WEAK_PROJECT_TOKENS.has(normalizedLower) || isYearOnly(normalizedLower)) return null;
    return toTitleCase(normalized);
}

export function normalizeDocumentType(value, fallbackMediaType = '') {
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

export function isWeakClientCandidate(value) {
    return !normalizeClientLabel(value);
}

export function isWeakProjectCandidate(value) {
    return !normalizeProjectLabel(value);
}

export function getRootAreaLabel(relativePath = '') {
    const first = String(relativePath || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)[0];
    if (!first) return '(root)';

    const lower = cleanLabel(first).toLowerCase();
    if (ROOT_AREA_ALIASES[lower]) return ROOT_AREA_ALIASES[lower];
    if (lower.startsWith('pico bahrain project')) return 'Pico Bahrain Projects';
    if (lower.startsWith('pico bahrain proposal')) return 'Pico Bahrain Proposals';
    return toTitleCase(cleanLabel(first));
}

export function extractTrustedProjectFromPath(segments = []) {
    const cleanedSegments = segments.map((segment) => cleanLabel(segment)).filter(Boolean);
    const lowered = cleanedSegments.map((segment) => segment.toLowerCase());

    const eventIndex = lowered.indexOf('events');
    if (eventIndex >= 0 && cleanedSegments[eventIndex + 1]) {
        return normalizeProjectLabel(cleanedSegments[eventIndex + 1]);
    }

    if (lowered[0] === 'clients' && cleanedSegments[2]) {
        return normalizeProjectLabel(cleanedSegments[2]);
    }

    if (lowered[0]?.startsWith('pico bahrain project')) {
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

export function normalizeFolderPrefixLabel(pathValue = '') {
    const segments = String(pathValue || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);

    if (segments.length === 0) return '(root)';

    const root = getRootAreaLabel(pathValue);
    const firstLower = cleanLabel(segments[0]).toLowerCase();

    if (firstLower === 'clients') {
        const client = normalizeClientLabel(segments[1]);
        const project = normalizeProjectLabel(segments[2]);
        if (client && project) return `${root} / ${client} / ${project}`;
        if (client) return `${root} / ${client}`;
        return root;
    }

    if (firstLower === 'resources') {
        const subject = normalizeProjectLabel(segments[1]);
        return subject ? `${root} / ${subject}` : root;
    }

    if (firstLower.startsWith('pico bahrain project')) {
        const eventIndex = segments.findIndex((segment) => segment.toLowerCase() === 'events');
        if (eventIndex >= 0) {
            const project = normalizeProjectLabel(segments[eventIndex + 1]);
            if (project) return `${root} / EVENTS / ${project}`;
        }

        const project = extractTrustedProjectFromPath(segments);
        if (project) return `${root} / ${project}`;
        return root;
    }

    return root;
}

export function normalizeUnderstandingLevel(value) {
    const lower = String(value || '').toLowerCase().trim();
    if (lower === 'content_understood') return 'content_understood';
    if (lower === 'filename_path_inferred') return 'filename_path_inferred';
    if (lower === 'metadata_only') return 'metadata_only';
    if (lower === 'needs_review') return 'needs_review';
    if (lower === 'ignored') return 'ignored';
    return 'metadata_only';
}

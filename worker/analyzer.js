const {
    extractTrustedProjectFromPath,
    normalizeClientLabel,
    normalizeProjectLabel,
    normalizeDocumentType,
    isIgnoredPathToken,
    isCameraStyleFilename,
} = require('./normalization');

const EXTENSION_MAP = {
    pdf: { mime: 'application/pdf', category: 'document', extractable: true },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document', extractable: true },
    doc: { mime: 'application/msword', category: 'document', extractable: false },
    xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'document', extractable: true },
    xls: { mime: 'application/vnd.ms-excel', category: 'document', extractable: false },
    pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'document', extractable: true },
    ppt: { mime: 'application/vnd.ms-powerpoint', category: 'document', extractable: false },
    txt: { mime: 'text/plain', category: 'document', extractable: true },
    csv: { mime: 'text/csv', category: 'document', extractable: true },
    md: { mime: 'text/markdown', category: 'document', extractable: true },
    json: { mime: 'application/json', category: 'document', extractable: true },
    rtf: { mime: 'application/rtf', category: 'document', extractable: false },
    jpg: { mime: 'image/jpeg', category: 'image', extractable: false },
    jpeg: { mime: 'image/jpeg', category: 'image', extractable: false },
    png: { mime: 'image/png', category: 'image', extractable: false },
    webp: { mime: 'image/webp', category: 'image', extractable: false },
    gif: { mime: 'image/gif', category: 'image', extractable: false },
    svg: { mime: 'image/svg+xml', category: 'image', extractable: false },
    bmp: { mime: 'image/bmp', category: 'image', extractable: false },
    tiff: { mime: 'image/tiff', category: 'image', extractable: false },
    tif: { mime: 'image/tiff', category: 'image', extractable: false },
    mp3: { mime: 'audio/mpeg', category: 'audio', extractable: false },
    wav: { mime: 'audio/wav', category: 'audio', extractable: false },
    m4a: { mime: 'audio/mp4', category: 'audio', extractable: false },
    ogg: { mime: 'audio/ogg', category: 'audio', extractable: false },
    flac: { mime: 'audio/flac', category: 'audio', extractable: false },
    mp4: { mime: 'video/mp4', category: 'video', extractable: false },
    mov: { mime: 'video/quicktime', category: 'video', extractable: false },
    avi: { mime: 'video/x-msvideo', category: 'video', extractable: false },
    mkv: { mime: 'video/x-matroska', category: 'video', extractable: false },
    webm: { mime: 'video/webm', category: 'video', extractable: false },
    vob: { mime: 'video/dvd', category: 'video', extractable: false },
    zip: { mime: 'application/zip', category: 'archive', extractable: false },
    rar: { mime: 'application/x-rar-compressed', category: 'archive', extractable: false },
    psd: { mime: 'image/vnd.adobe.photoshop', category: 'design', extractable: false },
    ai: { mime: 'application/illustrator', category: 'design', extractable: false },
    indd: { mime: 'application/x-indesign', category: 'design', extractable: false },
    dwg: { mime: 'application/acad', category: 'design', extractable: false },
    db: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    bup: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    ifo: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    ini: { mime: 'text/plain', category: 'ignored', extractable: false },
    ds_store: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    tmp: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    temp: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    dat: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    bak: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    log: { mime: 'text/plain', category: 'ignored', extractable: false },
};

const TYPE_KEYWORDS = [
    'quote',
    'quotation',
    'boq',
    'estimate',
    'proposal',
    'contract',
    'agreement',
    'invoice',
    'report',
    'recap',
    'presentation',
    'ppt',
    'render',
    'mockup',
    'design',
    'artwork',
    'photo',
    'image',
    'video',
    'clip',
    'audio',
    'meeting',
    'voice',
    'minutes',
    'brief',
    'scope',
    'plan',
    'schedule',
    'scan',
];

const STATUS_KEYWORDS = new Set(['final', 'draft', 'approved', 'rejected', 'signed', 'revised', 'pending', 'wip', 'completed']);
const NON_ENTITY_TOKENS = new Set(['master', 'general', 'updated', 'guidelines', 'minutes']);
const MONTH_MAP = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
};
const LOCATION_TOKENS = new Set(['bahrain', 'manama', 'dubai', 'abu dhabi', 'riyadh', 'doha', 'kuwait', 'muscat', 'jeddah']);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function resolveFileType(ext) {
    const clean = (ext || '').replace(/^\./, '').toLowerCase().trim();
    return EXTENSION_MAP[clean] || { mime: 'application/octet-stream', category: 'unknown', extractable: false };
}

function analyzePathContext(relativePath) {
    const segments = (relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1);
    const result = {
        client: null,
        project: null,
        campaign: null,
        department: null,
        documentType: null,
        documentSubtype: null,
        year: null,
        month: null,
        location: null,
        pathConfidence: 0,
        pathReasons: [],
        hasTrustedClient: false,
        hasTrustedProject: false,
        hasStrongDocumentCue: false,
        trustedStructure: false,
        isEventAsset: false,
        isResourceLibrary: false,
    };

    if (!segments.length) return result;

    let confidencePoints = 0;
    const reasons = [];
    const lowered = segments.map((segment) => segment.toLowerCase().trim());
    const root = lowered[0] || '';

    if (root === 'clients') {
        result.trustedStructure = true;
        const client = normalizeClientLabel(segments[1]);
        if (client) {
            result.client = client;
            result.hasTrustedClient = true;
            confidencePoints += 0.42;
            reasons.push(`Trusted client path under "Clients" -> ${client}`);
        }

        let projectCandidate = normalizeProjectLabel(segments[2]);
        if (!projectCandidate && segments[2] && /^(20\d{2})$/.test(segments[2]) && segments[3]) {
            // Year-organized client folder: Clients/Client/2024/ProjectName
            projectCandidate = normalizeProjectLabel(segments[3]);
            if (projectCandidate) {
                result.project = projectCandidate;
                result.hasTrustedProject = true;
                confidencePoints += 0.20;
                reasons.push(`Year-organized client path -> project: ${projectCandidate}`);
            }
        } else if (projectCandidate && !isIgnoredPathToken(segments[2])) {
            result.project = projectCandidate;
            result.hasTrustedProject = true;
            confidencePoints += 0.24;
            reasons.push(`Trusted project path under client -> ${projectCandidate}`);
        }
    } else if (root === 'resources') {
        result.trustedStructure = true;
        result.isResourceLibrary = true;
        result.department = 'Resources';
        confidencePoints += 0.16;
        reasons.push('Shared library root under RESOURCES');
    } else if (root.startsWith('pico bahrain project')) {
        result.trustedStructure = true;
        result.department = 'Projects';
        confidencePoints += 0.16;
        reasons.push('Trusted internal project library root');
        // Extract the immediate subfolder as client (segments[1] = ClientName)
        const pbClient = normalizeClientLabel(segments[1]);
        if (pbClient) {
            result.client = pbClient;
            result.hasTrustedClient = true;
            confidencePoints += 0.28;
            reasons.push(`Pico Bahrain Projects root -> client: ${pbClient}`);
        }
    }

    const eventIndex = lowered.indexOf('events');
    if (eventIndex >= 0 && segments[eventIndex + 1]) {
        const trustedProject = normalizeProjectLabel(segments[eventIndex + 1]);
        if (trustedProject) {
            result.project = trustedProject;
            result.campaign = trustedProject;
            result.hasTrustedProject = true;
            result.trustedStructure = true;
            confidencePoints += 0.34;
            reasons.push(`EVENTS path reveals event/project -> ${trustedProject}`);
        }
    }

    const fallbackProject = extractTrustedProjectFromPath(segments);
    if (!result.project && fallbackProject) {
        result.project = fallbackProject;
        result.hasTrustedProject = true;
        confidencePoints += 0.18;
        reasons.push(`Trusted project inferred from folder hierarchy -> ${fallbackProject}`);
    }

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segLower = lowered[i];
        const documentType = normalizeDocumentType(segLower);
        if (documentType) {
            result.documentType = documentType;
            result.documentSubtype = segLower;
            result.hasStrongDocumentCue = true;
            confidencePoints += 0.2;
            reasons.push(`Folder "${seg}" maps to ${documentType}`);
            if (documentType === 'photo_asset' && eventIndex >= 0) {
                result.documentSubtype = 'event_photo';
                result.isEventAsset = true;
            }
            if (documentType === 'video_asset' && eventIndex >= 0) {
                result.documentSubtype = 'event_video';
                result.isEventAsset = true;
            }
            continue;
        }

        const yearMatch = seg.match(/^(20\d{2})$/);
        if (yearMatch) {
            result.year = parseInt(yearMatch[1], 10);
            confidencePoints += 0.08;
            reasons.push(`Folder "${seg}" -> year`);
            continue;
        }

        const monthIndex = MONTHS.indexOf(segLower);
        if (monthIndex >= 0) {
            result.month = monthIndex + 1;
            confidencePoints += 0.04;
            reasons.push(`Folder "${seg}" -> month`);
            continue;
        }

        if (LOCATION_TOKENS.has(segLower)) {
            result.location = seg;
            confidencePoints += 0.04;
            reasons.push(`Folder "${seg}" -> location`);
        }
    }

    result.pathConfidence = Math.min(confidencePoints, 1);
    result.pathReasons = reasons;
    return result;
}

function analyzeFilename(filename) {
    const result = {
        likelyType: null,
        likelySubtype: null,
        likelyClient: null,
        likelyProject: null,
        version: null,
        status: null,
        date: { year: null, month: null },
        filenameConfidence: 0,
        filenameReasons: [],
        isCameraStyle: false,
        isScannerStyle: false,
        hasStrongTypeCue: false,
        clientConfidence: 0,
        projectConfidence: 0,
    };

    if (!filename) return result;

    const nameOnly = filename.replace(/\.[^.]+$/, '');
    result.isCameraStyle = isCameraStyleFilename(nameOnly);
    result.isScannerStyle = /\bscan(?:ner)?\b/i.test(nameOnly);

    const tokens = nameOnly.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).filter(Boolean);
    const tokensLower = tokens.map((token) => token.toLowerCase());
    let confidencePoints = 0;
    const reasons = [];

    for (const token of tokensLower) {
        if (TYPE_KEYWORDS.includes(token)) {
            result.likelyType = normalizeDocumentType(token);
            result.likelySubtype = token;
            result.hasStrongTypeCue = true;
            confidencePoints += 0.22;
            reasons.push(`Token "${token}" -> type: ${result.likelyType}`);
            break;
        }
    }

    for (const token of tokensLower) {
        const versionMatch = token.match(/^(v\d+|rev\d+|r\d+|version\d+)$/);
        if (versionMatch) {
            result.version = versionMatch[1];
            confidencePoints += 0.08;
            reasons.push(`Token "${token}" -> version`);
            break;
        }
    }

    for (const token of tokensLower) {
        if (STATUS_KEYWORDS.has(token)) {
            result.status = token;
            confidencePoints += 0.08;
            reasons.push(`Token "${token}" -> status`);
            break;
        }
    }

    for (const token of tokensLower) {
        if (MONTH_MAP[token]) {
            result.date.month = MONTH_MAP[token];
            confidencePoints += 0.04;
            reasons.push(`Token "${token}" -> month`);
        }
        const yearMatch = token.match(/^(20\d{2})$/);
        if (yearMatch) {
            result.date.year = parseInt(yearMatch[1], 10);
            confidencePoints += 0.04;
            reasons.push(`Token "${token}" -> year`);
        }
        const compactDateMatch = token.match(/^(20\d{2})(\d{2})(\d{2})$/);
        if (compactDateMatch) {
            result.date.year = parseInt(compactDateMatch[1], 10);
            result.date.month = parseInt(compactDateMatch[2], 10);
            confidencePoints += 0.08;
            reasons.push(`Token "${token}" -> date`);
        }
    }

    const meaningfulTokens = tokensLower.filter((token) =>
        !TYPE_KEYWORDS.includes(token) &&
        !STATUS_KEYWORDS.has(token) &&
        !MONTH_MAP[token] &&
        !token.match(/^(v\d+|rev\d+|r\d+|\d+|img|dsc|vid|pxl|file|document|untitled|copy|new)$/) &&
        !token.match(/^(img|image|photo|scan|vid|dsc)\d+$/)
    );

    const subjectPhrase = normalizeProjectLabel(meaningfulTokens.slice(0, 4).join(' '));
    if (subjectPhrase) {
        result.likelyProject = subjectPhrase;
        result.projectConfidence = result.isCameraStyle ? 0.04 : 0.12;
        confidencePoints += result.projectConfidence;
        reasons.push(`Meaningful filename phrase -> project/subject: ${subjectPhrase}`);
    }

    const clientCandidate = meaningfulTokens[0]
        ? normalizeClientLabel(tokens[tokensLower.indexOf(meaningfulTokens[0])])
        : null;

    if (clientCandidate && !NON_ENTITY_TOKENS.has(clientCandidate.toLowerCase()) && result.hasStrongTypeCue) {
        result.likelyClient = clientCandidate;
        result.clientConfidence = 0.08;
        confidencePoints += result.clientConfidence;
        reasons.push(`Leading business token -> possible client: ${clientCandidate}`);
    }

    if ((result.isCameraStyle || result.isScannerStyle) && !result.hasStrongTypeCue && !result.likelyProject) {
        confidencePoints = Math.max(0, confidencePoints - 0.12);
        reasons.push('Camera/scanner style filename reduced as a weak business signal');
    }

    result.filenameConfidence = Math.min(confidencePoints, 1);
    result.filenameReasons = reasons;
    return result;
}

module.exports = { resolveFileType, analyzePathContext, analyzeFilename };

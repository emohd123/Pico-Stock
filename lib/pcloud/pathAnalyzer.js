import {
    extractTrustedProjectFromPath,
    getRootAreaLabel,
    isIgnoredPathToken,
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
} from './normalization.js';

const LOCATION_TOKENS = new Set([
    'bahrain',
    'manama',
    'dubai',
    'abu dhabi',
    'riyadh',
    'doha',
    'kuwait',
    'muscat',
    'jeddah',
]);

const MONTHS = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];

export function analyzePathContext(relativePath) {
    const segments = (relativePath || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .slice(0, -1);

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
        rootArea: getRootAreaLabel(relativePath),
        pathConfidence: 0,
        pathReasons: [],
        hasTrustedClient: false,
        hasTrustedProject: false,
        hasStrongDocumentCue: false,
        trustedStructure: false,
        isEventAsset: false,
        isResourceLibrary: false,
    };

    if (segments.length === 0) return result;

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

        const projectCandidate = normalizeProjectLabel(segments[2]);
        if (!projectCandidate && segments[2] && /^(20\d{2})$/.test(segments[2]) && segments[3]) {
            // Year-organized client folder: Clients/Client/2024/ProjectName
            const innerProject = normalizeProjectLabel(segments[3]);
            if (innerProject) {
                result.project = innerProject;
                result.hasTrustedProject = true;
                confidencePoints += 0.20;
                reasons.push(`Year-organized client path -> project: ${innerProject}`);
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
            reasons.push(`Pico Bahrain root client inference -> ${pbClient}`);
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

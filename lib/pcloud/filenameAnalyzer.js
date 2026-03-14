import {
    isCameraStyleFilename,
    isWeakClientCandidate,
    normalizeClientLabel,
    normalizeDocumentType,
    normalizeProjectLabel,
} from './normalization.js';

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

const STATUS_KEYWORDS = ['final', 'draft', 'approved', 'rejected', 'signed', 'revised', 'pending', 'wip', 'completed'];
const NON_ENTITY_TOKENS = new Set(['master', 'general', 'updated', 'guidelines', 'minutes']);

const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function analyzeFilename(filename) {
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

    const tokens = nameOnly
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .split(/[\s_\-.]+/)
        .filter(Boolean);

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
        if (STATUS_KEYWORDS.includes(token)) {
            result.status = token;
            confidencePoints += 0.08;
            reasons.push(`Token "${token}" -> status`);
            break;
        }
    }

    for (const token of tokensLower) {
        if (MONTHS[token]) {
            result.date.month = MONTHS[token];
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
        !STATUS_KEYWORDS.includes(token) &&
        !MONTHS[token] &&
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

    if (clientCandidate && !NON_ENTITY_TOKENS.has(clientCandidate.toLowerCase()) && !isWeakClientCandidate(clientCandidate) && result.hasStrongTypeCue) {
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

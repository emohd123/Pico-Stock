function includesPhrase(value, phrase) {
    return Boolean(value && phrase && value.includes(phrase));
}

function includesToken(value, token) {
    return Boolean(value && token && value.includes(token));
}

function clampScore(value) {
    if (value <= 0) return 0;
    if (value >= 1) return 1;
    return value;
}

export function scoreCandidate(candidate, queryInfo, filters = {}) {
    const filename = (candidate.filename || '').toLowerCase();
    const relativePath = (candidate.relativePath || '').toLowerCase();
    const detectedClient = (candidate.detectedClient || '').toLowerCase();
    const detectedProject = (candidate.detectedProject || '').toLowerCase();
    const detectedDocumentType = (candidate.detectedDocumentType || '').toLowerCase();
    const shortSummary = (candidate.shortSummary || '').toLowerCase();
    const previewText = (candidate.previewText || '').toLowerCase();
    const cleanedText = (candidate.cleanedText || '').toLowerCase();
    const extractedText = `${previewText} ${cleanedText}`.trim();
    const phrase = queryInfo.phrase;

    let score = 0;
    const matchSignals = {
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
        folderFilter: '',
        statusFilter: '',
        understandingFilter: '',
    };

    if (phrase) {
        if (includesPhrase(filename, phrase)) {
            score += 30;
            matchSignals.filenameExact = true;
        }
        if (includesPhrase(relativePath, phrase)) {
            score += 24;
            matchSignals.pathExact = true;
        }
        if (includesPhrase(detectedClient, phrase)) {
            score += 26;
            matchSignals.clientExact = true;
        }
        if (includesPhrase(detectedProject, phrase)) {
            score += 24;
            matchSignals.projectExact = true;
        }
        if (includesPhrase(detectedDocumentType, phrase)) {
            score += 22;
            matchSignals.documentTypeExact = true;
        }
        if (includesPhrase(shortSummary, phrase)) {
            score += 16;
            matchSignals.summaryExact = true;
        }
        if (includesPhrase(extractedText, phrase)) {
            score += 18;
            matchSignals.extractedTextExact = true;
        }
    }

    queryInfo.tokens.forEach((token) => {
        if (includesToken(filename, token)) {
            score += 8;
            matchSignals.filenameTokens.push(token);
        }
        if (includesToken(relativePath, token)) {
            score += 6;
            matchSignals.pathTokens.push(token);
        }
        if (includesToken(detectedClient, token)) {
            score += 7;
            matchSignals.clientTokens.push(token);
        }
        if (includesToken(detectedProject, token)) {
            score += 7;
            matchSignals.projectTokens.push(token);
        }
        if (includesToken(detectedDocumentType, token)) {
            score += 6;
            matchSignals.documentTypeTokens.push(token);
        }
        if (includesToken(shortSummary, token)) {
            score += 4;
            matchSignals.summaryTokens.push(token);
        }
        if (includesToken(extractedText, token)) {
            score += 5;
            matchSignals.extractedTokens.push(token);
        }
    });

    if (queryInfo.inferredFolderPrefix && relativePath.startsWith(queryInfo.inferredFolderPrefix.toLowerCase())) {
        score += 18;
        matchSignals.folderFilter = queryInfo.inferredFolderPrefix;
    }

    if (queryInfo.inferredFileType && candidate.extension === queryInfo.inferredFileType) {
        score += 10;
    }

    if (queryInfo.inferredDocumentType && detectedDocumentType.includes(queryInfo.inferredDocumentType)) {
        score += 14;
    }

    if (queryInfo.inferredMediaType && (candidate.detectedMediaType || '').toLowerCase().includes(queryInfo.inferredMediaType)) {
        score += 10;
    }

    if (filters.folderPrefix && relativePath.startsWith(filters.folderPrefix.toLowerCase())) {
        score += 12;
        matchSignals.folderFilter = filters.folderPrefix;
    }

    if (filters.status && [candidate.sourceStatus, candidate.detectedStatus].filter(Boolean).some((value) => value.toLowerCase().includes(filters.status.toLowerCase()))) {
        score += 8;
        matchSignals.statusFilter = filters.status;
    }

    if (filters.understandingLevel && candidate.understandingLevel === filters.understandingLevel) {
        score += 8;
        matchSignals.understandingFilter = filters.understandingLevel;
    }

    if (candidate.requiresReview) {
        score -= 6;
    }

    score += Math.round((Number(candidate.confidenceScore) || 0) * 12);

    return {
        rawScore: score,
        normalizedScore: clampScore(score / 100),
        matchSignals,
    };
}

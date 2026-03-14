function toReason(label, detail, score) {
    return {
        label,
        detail,
        score,
    };
}

export function buildResultExplanation(result) {
    const reasons = [];
    const text = result.searchText;
    const phrase = result.queryInfo.phrase;

    if (result.matchSignals.filenameExact) {
        reasons.push(toReason('Matched filename', `The filename includes "${phrase}".`, 30));
    }

    if (result.matchSignals.pathExact) {
        reasons.push(toReason('Matched folder path', `The file path includes "${phrase}".`, 24));
    }

    if (result.matchSignals.clientExact) {
        reasons.push(toReason('Matched client tag', `Detected client matched "${phrase}".`, 26));
    }

    if (result.matchSignals.projectExact) {
        reasons.push(toReason('Matched project inference', `Detected project matched "${phrase}".`, 24));
    }

    if (result.matchSignals.documentTypeExact) {
        reasons.push(toReason('Matched document type', `Detected document type matched "${phrase}".`, 22));
    }

    if (result.matchSignals.summaryExact) {
        reasons.push(toReason('Matched summary', 'The AI summary directly references the request.', 16));
    }

    if (result.matchSignals.extractedTextExact) {
        reasons.push(toReason('Matched extracted text', 'The extracted file content includes the requested phrase.', 18));
    }

    if (result.matchSignals.folderFilter) {
        reasons.push(toReason('Matched folder prefix', `The file sits under "${result.matchSignals.folderFilter}".`, 14));
    }

    if (result.matchSignals.statusFilter) {
        reasons.push(toReason('Matched status filter', `Status matched "${result.matchSignals.statusFilter}".`, 8));
    }

    if (result.matchSignals.understandingFilter) {
        reasons.push(toReason('Matched understanding level', `Understanding level matched "${result.matchSignals.understandingFilter}".`, 8));
    }

    result.queryInfo.tokens.forEach((token) => {
        if (result.matchSignals.filenameTokens.includes(token)) {
            reasons.push(toReason('Matched filename', `Filename contains "${token}".`, 8));
        }
        if (result.matchSignals.pathTokens.includes(token)) {
            reasons.push(toReason('Matched path', `Path contains "${token}".`, 6));
        }
        if (result.matchSignals.clientTokens.includes(token)) {
            reasons.push(toReason('Matched client tag', `Client inference contains "${token}".`, 7));
        }
        if (result.matchSignals.projectTokens.includes(token)) {
            reasons.push(toReason('Matched project inference', `Project inference contains "${token}".`, 7));
        }
        if (result.matchSignals.documentTypeTokens.includes(token)) {
            reasons.push(toReason('Matched document type', `Document type contains "${token}".`, 6));
        }
        if (result.matchSignals.summaryTokens.includes(token)) {
            reasons.push(toReason('Matched summary', `Summary contains "${token}".`, 4));
        }
        if (result.matchSignals.extractedTokens.includes(token)) {
            reasons.push(toReason('Matched extracted text', `Extracted text contains "${token}".`, 5));
        }
    });

    const deduped = [];
    const seen = new Set();
    reasons
        .sort((a, b) => b.score - a.score)
        .forEach((reason) => {
            const key = `${reason.label}:${reason.detail}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(reason);
            }
        });

    const primaryReason = deduped[0]?.label || 'Matched by combined metadata';
    const reasonText = deduped.slice(0, 4).map((reason) => reason.label).join(', ');

    return {
        primaryReason,
        reasonText: reasonText || 'Matched by filename, metadata, or extracted content',
        reasons: deduped.slice(0, 8),
        summary: buildSummary(text),
    };
}

function buildSummary(text) {
    if (!text) return 'No summary available.';
    return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

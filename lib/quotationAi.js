import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { defaultCommercialLists, normalizeCurrencyCode } from '@/lib/quotationCommercial';
import {
    buildLearningPatternsFromMatches,
    findRelevantQuotationLibraryRecords,
    getQuotationAiLibraryStats,
} from '@/lib/quotationAiLibrary';
import { getPriceReferences } from '@/lib/priceReferenceStore';

const DEFAULT_AI_MODEL = process.env.OPENAI_QUOTATION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const DEFAULT_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const MAX_SOURCE_TEXT = 18000;
const MAX_REFERENCE_CONTEXT = 20;
const MAX_FILES = 6;

function normalizeText(value, fallback = '') {
    return String(value ?? fallback).trim();
}

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJsonParse(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function truncateText(value, max = MAX_SOURCE_TEXT) {
    const text = normalizeText(value);
    return text.length > max ? `${text.slice(0, max)}...` : text;
}

function decodeDataUrl(dataUrl = '') {
    const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64'),
    };
}

function extractTextFromXml(xml = '') {
    return String(xml)
        .replace(/<a:br\/>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function keywordTokens(value = '') {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2);
}

function scoreReferenceMatch(description, reference) {
    const descriptionTokens = new Set(keywordTokens(description));
    if (!descriptionTokens.size) return 0;
    const referenceTokens = [
        ...keywordTokens(reference.title),
        ...keywordTokens(reference.category),
        ...keywordTokens(reference.notes),
        ...keywordTokens(reference.unit),
    ];
    return referenceTokens.reduce((score, token) => score + (descriptionTokens.has(token) ? 1 : 0), 0);
}

function getPrimaryTitle(brief = '', extractedTexts = [], quotation = {}) {
    const sources = [
        quotation.project_title,
        quotation.subject,
        ...String(brief || '').split('\n'),
        ...extractedTexts.flatMap((entry) => String(entry.text || '').split('\n')),
    ]
        .map((line) => normalizeText(line))
        .filter(Boolean);

    return sources.find((line) => line.length > 4) || quotation.project_title || quotation.subject || 'New Quotation Draft';
}

function buildItemCandidates(brief = '', extractedTexts = []) {
    const combined = [brief, ...extractedTexts.map((entry) => entry.text || '')].join('\n');
    const lines = combined
        .split(/\r?\n/)
        .map((line) => normalizeText(line.replace(/^[-*•\d.)\s]+/, '')))
        .filter((line) => line.length > 8)
        .filter((line) => !/^(dear|hello|regards|thanks|subject|quotation|quote)$/i.test(line));

    const unique = [];
    const seen = new Set();
    for (const line of lines) {
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(line);
        if (unique.length >= 8) break;
    }

    return unique;
}

function buildFallbackDraft({ quotation = {}, brief = '', extractedTexts = [], matchedRecords = [] }) {
    const defaults = defaultCommercialLists();
    const title = getPrimaryTitle(brief, extractedTexts, quotation);
    const matchedSections = matchedRecords[0]?.sections || [];
    const learnedPatterns = buildLearningPatternsFromMatches(matchedRecords);
    const itemCandidates = buildItemCandidates(brief, extractedTexts);
    const items = (itemCandidates.length ? itemCandidates : matchedSections.flatMap((section) => (section.items || []).map((item) => item.description)).slice(0, 6)).map((line) => ({
        description: line,
        qty: '',
        unit: learnedPatterns.preferred_units[0]?.label || 'nos',
        costs_bhd: '',
        rate: '',
        price_reference_id: '',
    }));

    const assumptions = [
        'Review quantities, units, and commercial values before sending.',
        'Generated from the typed brief and any readable source files.',
    ];
    if (matchedRecords.length) {
        assumptions.push(`Used ${matchedRecords.length} similar quotation example${matchedRecords.length === 1 ? '' : 's'} from the internal knowledge library.`);
    }

    const missingDetails = [];
    if (!quotation.client_org) missingDetails.push('Customer name is still missing.');
    if (items.length === 0) missingDetails.push('No clear scope lines were found in the brief or files.');

    return {
        provider: 'fallback',
        summary: 'Built a first draft from the available brief and source text.',
        assumptions,
        missing_details: missingDetails,
        draft_patch: {
            project_title: title,
            subject: title,
            exclusions: quotation.exclusions?.length
                ? quotation.exclusions
                : (matchedRecords[0]?.exclusions?.length
                    ? matchedRecords[0].exclusions
                    : (learnedPatterns.recommended_exclusions.map((entry) => entry.label).length
                        ? learnedPatterns.recommended_exclusions.map((entry) => entry.label)
                        : defaults.exclusions)),
            terms: quotation.terms?.length
                ? quotation.terms
                : (matchedRecords[0]?.terms?.length
                    ? matchedRecords[0].terms
                    : (learnedPatterns.recommended_terms.map((entry) => entry.label).length
                        ? learnedPatterns.recommended_terms.map((entry) => entry.label)
                        : defaults.terms)),
            payment_terms: quotation.payment_terms?.length
                ? quotation.payment_terms
                : (matchedRecords[0]?.payment_terms?.length
                    ? matchedRecords[0].payment_terms
                    : (learnedPatterns.recommended_payment_terms.map((entry) => entry.label).length
                        ? learnedPatterns.recommended_payment_terms.map((entry) => entry.label)
                        : defaults.payment_terms)),
            notes: normalizeText(quotation.notes),
            sections: items.length
                ? (matchedSections.length
                    ? matchedSections.slice(0, 3).map((section, index) => ({
                        name: section.name || learnedPatterns.preferred_section_names[index]?.label || (index === 0 ? 'Scope of Works' : `Section ${index + 1}`),
                        selling_rule: quotation.sections?.[0]?.selling_rule || section.selling_rule || learnedPatterns.recommended_selling_rules[0]?.label || '0.70',
                        section_selling: 0,
                        items: index === 0 ? items : [],
                    }))
                    : [
                        {
                            name: learnedPatterns.preferred_section_names[0]?.label || 'Scope of Works',
                            selling_rule: quotation.sections?.[0]?.selling_rule || learnedPatterns.recommended_selling_rules[0]?.label || '0.70',
                            section_selling: 0,
                            items,
                        },
                    ])
                : quotation.sections || [],
        },
    };
}

function buildPricingFallback({ quotation = {}, references = [], matchedRecords = [] }) {
    const suggestions = [];
    const matchedItems = flattenMatchedItems(matchedRecords);
    (quotation.sections || []).forEach((section, sectionIndex) => {
        (section.items || []).forEach((item, itemIndex) => {
            const scored = references
                .map((reference) => ({ reference, score: scoreReferenceMatch(item.description, reference) }))
                .filter((entry) => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .slice(0, 1);
            const scoredHistorical = matchedItems
                .map((candidate) => ({ candidate, score: scoreCandidateAgainstDescription(item.description, candidate, item) }))
                .filter((entry) => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .slice(0, 1);

            if (!scored.length && !scoredHistorical.length) return;

            if (scored.length) {
                const { reference, score } = scored[0];
                suggestions.push({
                    sectionIndex,
                    itemIndex,
                    reference_id: reference.id,
                    reference_title: reference.title,
                    matched_quotation_label: scoredHistorical[0]?.candidate?.source_label || '',
                    costs_bhd: Number(item.costs_bhd || reference.reference_rate || scoredHistorical[0]?.candidate?.costs_bhd || 0),
                    rate: Number(item.rate || reference.reference_rate || scoredHistorical[0]?.candidate?.rate || 0),
                    selling_rule: reference.default_selling_rule || scoredHistorical[0]?.candidate?.selling_rule || section.selling_rule || '0.70',
                    confidence: Math.min(0.62 + (score * 0.08) + ((scoredHistorical[0]?.score || 0) * 0.02), 0.96),
                    reasoning: `Matched to price reference "${reference.title}"${scoredHistorical[0]?.candidate ? ` and checked against ${scoredHistorical[0].candidate.source_label}` : ''}.`,
                });
                return;
            }

            const { candidate, score } = scoredHistorical[0];
            if (score < 2) return;
            suggestions.push({
                sectionIndex,
                itemIndex,
                reference_id: '',
                reference_title: '',
                matched_quotation_label: candidate.source_label,
                costs_bhd: Number(item.costs_bhd || candidate.costs_bhd || 0),
                rate: Number(item.rate || candidate.rate || candidate.costs_bhd || 0),
                selling_rule: candidate.selling_rule || section.selling_rule || '0.70',
                confidence: Math.min(0.5 + (score * 0.07), 0.86),
                reasoning: `Matched to a similar prior quotation line from ${candidate.source_label}.`,
            });
        });
    });

    return {
        provider: 'fallback',
        summary: suggestions.length
            ? `Prepared ${suggestions.length} pricing suggestion${suggestions.length > 1 ? 's' : ''} from your saved references and historical quotation library.`
            : 'No strong price or historical quotation matches were found for the current item descriptions.',
        suggestions,
    };
}

function buildReviewFallback({ quotation = {}, matchedRecords = [] }) {
    const warnings = [];
    const pushWarning = (severity, title, message) => warnings.push({ severity, title, message });

    if (!quotation.client_org) pushWarning('high', 'Missing customer', 'Select a customer before exporting or sending the quotation.');
    if (!quotation.project_title) pushWarning('high', 'Missing project title', 'Add a project title so the quotation is identifiable.');
    if (!quotation.created_by) pushWarning('high', 'Missing salesperson', 'Assign a salesperson before saving or sending.');
    if (!quotation.client_location) pushWarning('medium', 'Missing billing address', 'Customer address is blank in the quotation header.');
    if (!quotation.client_trn) pushWarning('medium', 'Missing TRN', 'Customer TRN / VAT number is missing.');
    if (!(quotation.exclusions || []).length) pushWarning('medium', 'Missing exclusions', 'Add exclusions so the client scope is clear.');
    if (!(quotation.terms || []).length) pushWarning('medium', 'Missing terms', 'Add terms and conditions before sending.');
    if (!(quotation.payment_terms || []).length) pushWarning('medium', 'Missing payment terms', 'Payment terms are empty.');

    (quotation.sections || []).forEach((section, sectionIndex) => {
        if (!normalizeText(section.name)) {
            pushWarning('medium', `Unnamed section ${sectionIndex + 1}`, 'Each section should have a clear title.');
        }
        (section.items || []).forEach((item, itemIndex) => {
            const label = `Section ${sectionIndex + 1}, item ${itemIndex + 1}`;
            if (!normalizeText(item.description)) pushWarning('high', `${label} missing description`, 'Add a clear scope description.');
            if (!Number(item.costs_bhd || 0)) pushWarning('medium', `${label} missing customer cost`, 'COSTS (BHD) is empty.');
            if (!Number(item.qty || 0)) pushWarning('low', `${label} missing quantity`, 'Quantity is blank or zero.');
            if (!normalizeText(item.unit)) pushWarning('low', `${label} missing unit`, 'Unit is blank.');
        });
    });
    if (!matchedRecords.length) {
        pushWarning('low', 'No comparison examples', 'The AI library did not find strong similar quotations for this review.');
    }

    return {
        provider: 'fallback',
        ready: warnings.filter((warning) => warning.severity === 'high').length === 0,
        summary: warnings.length
            ? `Found ${warnings.length} issue${warnings.length > 1 ? 's' : ''} to review before sending.`
            : 'No obvious quotation issues were found.',
        warnings,
    };
}

function buildReportSummaryFallback({ report = {} }) {
    const summary = report.summary || {};
    const topOwner = report.owner_breakdown?.[0];
    const topCustomer = report.customer_breakdown?.[0];
    const highlights = [
        `${summary.confirmed_count || 0} confirmed out of ${summary.total_count || 0} quotations in the selected window.`,
        topOwner ? `Top owner: ${topOwner.label}.` : 'No owner standout detected.',
        topCustomer ? `Top customer: ${topCustomer.label}.` : 'No customer standout detected.',
    ];
    const risks = [];
    const actions = [];

    if ((summary.draft_count || 0) > (summary.confirmed_count || 0)) {
        risks.push('Draft backlog is larger than confirmed quotations.');
        actions.push('Review outstanding draft quotations and push the highest-value ones toward confirmation.');
    }
    if ((summary.cancelled_count || 0) > 0) {
        risks.push(`${summary.cancelled_count} quotation${summary.cancelled_count > 1 ? 's were' : ' was'} cancelled in the selected range.`);
    }
    if (!actions.length) {
        actions.push('Keep monitoring owner follow-up and customer conversion trends for the next reporting cycle.');
    }

    return {
        provider: 'fallback',
        summary_markdown: [
            `Confirmed quotations: **${summary.confirmed_count || 0}** of **${summary.total_count || 0}** total.`,
            topOwner ? `Top owner by confirmed value: **${topOwner.label}**.` : null,
            topCustomer ? `Top customer by confirmed value: **${topCustomer.label}**.` : null,
        ].filter(Boolean).join('\n\n'),
        highlights,
        risks,
        actions,
    };
}

function getOpenAiClient() {
    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
}

async function callJsonChat({ system, prompt, userText, imageInputs = [] }) {
    const client = getOpenAiClient();
    if (!client) return null;

    const userContent = [{ type: 'text', text: `${prompt}\n\n${userText}` }];
    imageInputs.forEach((image) => {
        userContent.push({
            type: 'image_url',
            image_url: { url: image.data },
        });
    });

    const response = await client.chat.completions.create({
        model: DEFAULT_AI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
        ],
    });

    return safeJsonParse(response.choices?.[0]?.message?.content || '', null);
}

async function readAttachmentFromPath(filePath = '') {
    const normalized = normalizeText(filePath);
    if (!normalized) return null;

    const candidate = normalized.startsWith('/')
        ? path.join(process.cwd(), 'public', normalized.replace(/^\//, ''))
        : path.resolve(process.cwd(), normalized);

    try {
        const buffer = await fs.readFile(candidate);
        return {
            name: path.basename(candidate),
            type: '',
            size: buffer.length,
            buffer,
        };
    } catch {
        return null;
    }
}

async function extractFileContext(file = {}) {
    const name = normalizeText(file.name || file.original_name || 'file');
    const type = normalizeText(file.type);
    const decoded = file.data ? decodeDataUrl(file.data) : null;
    const fallbackPath = !decoded && file.path ? await readAttachmentFromPath(file.path) : null;
    const mimeType = decoded?.mimeType || type || fallbackPath?.type || '';
    const buffer = decoded?.buffer || fallbackPath?.buffer || null;

    if (!buffer) return null;

    try {
        if (mimeType.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(name)) {
            return { name, type: mimeType, text: truncateText(buffer.toString('utf8')) };
        }

        if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) {
            const parsed = await pdfParse(buffer);
            return { name, type: 'application/pdf', text: truncateText(parsed.text) };
        }

        if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || /\.pptx$/i.test(name)) {
            const zip = await JSZip.loadAsync(buffer);
            const slideTexts = [];
            const slideNames = Object.keys(zip.files).filter((fileName) => /^ppt\/slides\/slide\d+\.xml$/i.test(fileName)).sort();
            for (const slideName of slideNames) {
                const xml = await zip.files[slideName].async('string');
                slideTexts.push(extractTextFromXml(xml));
            }
            return { name, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', text: truncateText(slideTexts.join('\n')) };
        }

        if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || /\.xlsx?$/i.test(name)) {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetTexts = workbook.SheetNames.slice(0, 3).map((sheetName) => XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]));
            return { name, type: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: truncateText(sheetTexts.join('\n')) };
        }

        if (mimeType.startsWith('image/')) {
            return {
                name,
                type: mimeType,
                text: '',
                image: file.data ? { name, data: file.data } : null,
            };
        }
    } catch (error) {
        return { name, type: mimeType, text: `Could not fully parse ${name}: ${error.message}` };
    }

    return null;
}

async function collectSourceContext({ quotation = {}, files = [] }) {
    const mergedFiles = [...(Array.isArray(files) ? files : []), ...(Array.isArray(quotation.attachments) ? quotation.attachments.slice(0, MAX_FILES) : [])]
        .slice(0, MAX_FILES);

    const extracted = (await Promise.all(mergedFiles.map((file) => extractFileContext(file)))).filter(Boolean);

    return {
        extractedTexts: extracted.filter((entry) => entry.text),
        imageInputs: extracted.filter((entry) => entry.image).map((entry) => entry.image),
    };
}

function buildQuotationContext(quotation = {}) {
    return {
        qt_number: quotation.qt_number || null,
        source_type: quotation.source_type || 'manual',
        source_order_reference: quotation.source_order_reference || '',
        project_title: quotation.project_title || '',
        subject: quotation.subject || '',
        customer: {
            name: quotation.client_org || '',
            attention: quotation.client_to || '',
            address: quotation.client_location || '',
            trn: quotation.client_trn || '',
        },
        created_by: quotation.created_by || '',
        currency_code: normalizeCurrencyCode(quotation.currency_code),
        sections: (quotation.sections || []).map((section) => ({
            name: section.name || '',
            selling_rule: section.selling_rule || '0.70',
            items: (section.items || []).map((item) => ({
                description: item.description || '',
                qty: item.qty || '',
                unit: item.unit || '',
                costs_bhd: item.costs_bhd || '',
                rate: item.rate || '',
                price_reference_id: item.price_reference_id || '',
            })),
        })),
        exclusions: quotation.exclusions || [],
        terms: quotation.terms || [],
        payment_terms: quotation.payment_terms || [],
        notes: quotation.notes || '',
    };
}

function summarizeReferences(references = []) {
    return references.slice(0, MAX_REFERENCE_CONTEXT).map((reference) => ({
        id: reference.id,
        title: reference.title,
        category: reference.category,
        unit: reference.unit,
        reference_rate: reference.reference_rate,
        default_selling_rule: reference.default_selling_rule,
        notes: reference.notes,
    }));
}

function summarizeMatchedQuotations(matches = []) {
    return matches.slice(0, 5).map((match) => ({
        source_key: match.source_key,
        source_label: match.source_label,
        source_type: match.source_type,
        title: match.title,
        customer_name: match.customer_name,
        ref: match.ref,
        score: Number(match.final_score || match.lexical_score || 0),
        reasons: Array.isArray(match.match_reasons) ? match.match_reasons : [],
    }));
}

function flattenMatchedItems(matches = []) {
    return matches.flatMap((record) =>
        (record.sections || []).flatMap((section) =>
            (section.items || []).map((item) => ({
                source_label: record.source_label,
                source_type: record.source_type,
                section_name: section.name,
                description: item.description,
                qty: item.qty,
                unit: item.unit,
                costs_bhd: item.costs_bhd,
                rate: item.rate,
                selling_rule: section.selling_rule || '0.70',
                title: record.title,
                customer_name: record.customer_name,
                lexical_score: record.lexical_score || 0,
                final_score: record.final_score || record.lexical_score || 0,
            }))
        )
    ).filter((item) => item.description);
}

function summarizeLearnedPatterns(matches = []) {
    const patterns = buildLearningPatternsFromMatches(matches);
    return {
        preferred_section_names: patterns.preferred_section_names.map((entry) => entry.label),
        preferred_units: patterns.preferred_units.map((entry) => entry.label),
        recommended_exclusions: patterns.recommended_exclusions.map((entry) => entry.label),
        recommended_terms: patterns.recommended_terms.map((entry) => entry.label),
        recommended_payment_terms: patterns.recommended_payment_terms.map((entry) => entry.label),
        recommended_selling_rules: patterns.recommended_selling_rules.map((entry) => entry.label),
    };
}

function cosineSimilarity(left = [], right = []) {
    if (!left.length || !right.length || left.length !== right.length) return 0;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        leftMagnitude += left[index] * left[index];
        rightMagnitude += right[index] * right[index];
    }
    if (!leftMagnitude || !rightMagnitude) return 0;
    return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function rerankMatchesWithEmbeddings(queryText = '', matches = []) {
    const client = getOpenAiClient();
    if (!client || !queryText || !matches.length) return matches;
    try {
        const inputs = [
            truncateText(queryText, 2000),
            ...matches.map((match) => truncateText(match.search_text || '', 2000)),
        ];
        const response = await client.embeddings.create({
            model: DEFAULT_EMBEDDING_MODEL,
            input: inputs,
        });
        const vectors = response.data || [];
        const queryVector = vectors[0]?.embedding || [];
        if (!queryVector.length) return matches;
        return matches
            .map((match, index) => {
                const embeddingScore = cosineSimilarity(queryVector, vectors[index + 1]?.embedding || []);
                return {
                    ...match,
                    embedding_score: embeddingScore,
                    final_score: Number(match.lexical_score || 0) + (embeddingScore * 50),
                };
            })
            .sort((left, right) => Number(right.final_score || 0) - Number(left.final_score || 0));
    } catch {
        return matches;
    }
}

async function collectQuotationLibraryContext({ quotation = {}, brief = '', kind = 'draft', limit = 5 } = {}) {
    const [retrieval, libraryStats] = await Promise.all([
        findRelevantQuotationLibraryRecords({ quotation, brief, kind, limit }),
        getQuotationAiLibraryStats(),
    ]);
    const reranked = await rerankMatchesWithEmbeddings(retrieval.query_text, retrieval.matches || []);
    return {
        query_text: retrieval.query_text,
        matches: reranked.slice(0, limit),
        library_stats: libraryStats,
        learned_patterns: summarizeLearnedPatterns(reranked.slice(0, limit)),
    };
}

function scoreCandidateAgainstDescription(description, candidate = {}, currentItem = {}) {
    const descriptionTokens = new Set(keywordTokens(description));
    if (!descriptionTokens.size) return 0;
    const candidateTokens = [
        ...keywordTokens(candidate.description),
        ...keywordTokens(candidate.section_name),
        ...keywordTokens(candidate.title),
        ...keywordTokens(candidate.customer_name),
    ];
    let score = candidateTokens.reduce((sum, token) => sum + (descriptionTokens.has(token) ? 1 : 0), 0);
    if (normalizeText(currentItem.unit) && normalizeText(currentItem.unit).toLowerCase() === normalizeText(candidate.unit).toLowerCase()) {
        score += 2;
    }
    if (Number(candidate.final_score || candidate.lexical_score || 0) > 20) {
        score += Math.min(4, Math.round(Number(candidate.final_score || candidate.lexical_score || 0) / 20));
    }
    return score;
}

export async function generateDraftWithAi({ quotation = {}, brief = '', files = [] }) {
    const { extractedTexts, imageInputs } = await collectSourceContext({ quotation, files });
    const libraryContext = await collectQuotationLibraryContext({ quotation, brief, kind: 'draft', limit: 4 });
    const fallback = buildFallbackDraft({ quotation, brief, extractedTexts, matchedRecords: libraryContext.matches });
    const aiResponse = await callJsonChat({
        system: 'You help internal sales teams build first-draft quotations. Return only valid JSON. Keep output concise and practical. Never invent confirmed pricing. Use empty strings when unsure.',
        prompt: 'Generate a quotation draft patch JSON with keys: summary, assumptions (array), missing_details (array), draft_patch { project_title, subject, notes, exclusions (array), terms (array), payment_terms (array), sections (array of { name, selling_rule, section_selling, items(array of { description, qty, unit, costs_bhd, rate, price_reference_id })}) }.',
        userText: JSON.stringify({
            brief,
            quotation: buildQuotationContext(quotation),
            extracted_sources: extractedTexts.map((entry) => ({ name: entry.name, text: truncateText(entry.text, 4500) })),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            learned_patterns: libraryContext.learned_patterns,
        }),
        imageInputs,
    });

    if (!aiResponse?.draft_patch) {
        return {
            ...fallback,
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            evidence: summarizeMatchedQuotations(libraryContext.matches),
            confidence: libraryContext.matches.length ? 0.68 : 0.38,
            library_stats: libraryContext.library_stats,
            learned_patterns: libraryContext.learned_patterns,
        };
    }

    return {
        provider: 'openai',
        summary: normalizeText(aiResponse.summary, fallback.summary),
        assumptions: Array.isArray(aiResponse.assumptions) ? aiResponse.assumptions.map((value) => normalizeText(value)).filter(Boolean) : fallback.assumptions,
        missing_details: Array.isArray(aiResponse.missing_details) ? aiResponse.missing_details.map((value) => normalizeText(value)).filter(Boolean) : fallback.missing_details,
        draft_patch: {
            ...fallback.draft_patch,
            ...aiResponse.draft_patch,
        },
        matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
        evidence: summarizeMatchedQuotations(libraryContext.matches),
        confidence: libraryContext.matches.length ? 0.82 : 0.56,
        library_stats: libraryContext.library_stats,
        learned_patterns: libraryContext.learned_patterns,
    };
}

export async function suggestPricingWithAi({ quotation = {} }) {
    const references = await getPriceReferences();
    const libraryContext = await collectQuotationLibraryContext({ quotation, kind: 'pricing', limit: 5 });
    const fallback = buildPricingFallback({ quotation, references, matchedRecords: libraryContext.matches });
    const aiResponse = await callJsonChat({
        system: 'You suggest quotation pricing for an internal sales team. Return only valid JSON. Use saved price references as the primary source of truth. Use similar previous quotations as supporting evidence. If confidence is weak, leave values empty instead of inventing them.',
        prompt: 'Return JSON with keys: summary, suggestions (array of { sectionIndex, itemIndex, reference_id, reference_title, matched_quotation_label, costs_bhd, rate, selling_rule, confidence, reasoning }).',
        userText: JSON.stringify({
            quotation: buildQuotationContext(quotation),
            price_references: summarizeReferences(references),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            matched_line_examples: flattenMatchedItems(libraryContext.matches).slice(0, 14),
            learned_patterns: libraryContext.learned_patterns,
        }),
    });

    if (!aiResponse?.suggestions) {
        return {
            ...fallback,
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            evidence: summarizeMatchedQuotations(libraryContext.matches),
            confidence: fallback.suggestions.length ? 0.72 : 0.35,
            library_stats: libraryContext.library_stats,
            learned_patterns: libraryContext.learned_patterns,
        };
    }

    const suggestions = Array.isArray(aiResponse.suggestions)
        ? aiResponse.suggestions.map((suggestion) => ({
            sectionIndex: normalizeNumber(suggestion.sectionIndex, 0),
            itemIndex: normalizeNumber(suggestion.itemIndex, 0),
            reference_id: normalizeText(suggestion.reference_id),
            reference_title: normalizeText(suggestion.reference_title),
            matched_quotation_label: normalizeText(suggestion.matched_quotation_label),
            costs_bhd: suggestion.costs_bhd === '' ? '' : normalizeNumber(suggestion.costs_bhd, 0),
            rate: suggestion.rate === '' ? '' : normalizeNumber(suggestion.rate, 0),
            selling_rule: normalizeText(suggestion.selling_rule || '0.70') || '0.70',
            confidence: Math.max(0, Math.min(1, normalizeNumber(suggestion.confidence, 0.65))),
            reasoning: normalizeText(suggestion.reasoning),
        })).filter((suggestion) => Number.isFinite(suggestion.sectionIndex) && Number.isFinite(suggestion.itemIndex))
        : fallback.suggestions;

    return {
        provider: 'openai',
        summary: normalizeText(aiResponse.summary, fallback.summary),
        suggestions: suggestions.length ? suggestions : fallback.suggestions,
        matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
        evidence: summarizeMatchedQuotations(libraryContext.matches),
        confidence: suggestions.length ? 0.84 : 0.38,
        library_stats: libraryContext.library_stats,
        learned_patterns: libraryContext.learned_patterns,
    };
}

export async function reviewQuotationWithAi({ quotation = {}, brief = '', files = [] }) {
    const { extractedTexts } = await collectSourceContext({ quotation, files });
    const libraryContext = await collectQuotationLibraryContext({ quotation, brief, kind: 'review', limit: 4 });
    const fallback = buildReviewFallback({ quotation, matchedRecords: libraryContext.matches });
    const aiResponse = await callJsonChat({
        system: 'You review quotations for internal sales teams. Return only valid JSON. Focus on practical issues before sending a client quotation.',
        prompt: 'Return JSON with keys: summary, ready (boolean), warnings (array of { severity, title, message }).',
        userText: JSON.stringify({
            brief,
            quotation: buildQuotationContext(quotation),
            extracted_sources: extractedTexts.map((entry) => ({ name: entry.name, text: truncateText(entry.text, 3500) })),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            learned_patterns: libraryContext.learned_patterns,
        }),
    });

    if (!aiResponse?.warnings) {
        return {
            ...fallback,
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            evidence: summarizeMatchedQuotations(libraryContext.matches),
            confidence: libraryContext.matches.length ? 0.7 : 0.45,
            library_stats: libraryContext.library_stats,
            learned_patterns: libraryContext.learned_patterns,
        };
    }

    return {
        provider: 'openai',
        summary: normalizeText(aiResponse.summary, fallback.summary),
        ready: Boolean(aiResponse.ready),
        warnings: Array.isArray(aiResponse.warnings)
            ? aiResponse.warnings.map((warning) => ({
                severity: normalizeText(warning.severity, 'medium').toLowerCase(),
                title: normalizeText(warning.title),
                message: normalizeText(warning.message),
            })).filter((warning) => warning.title || warning.message)
            : fallback.warnings,
        matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
        evidence: summarizeMatchedQuotations(libraryContext.matches),
        confidence: libraryContext.matches.length ? 0.8 : 0.54,
        library_stats: libraryContext.library_stats,
        learned_patterns: libraryContext.learned_patterns,
    };
}

export async function summarizeReportWithAi({ report = null }) {
    const fallback = buildReportSummaryFallback({ report: report || {} });
    const aiResponse = await callJsonChat({
        system: 'You write concise management summaries for quotation performance reports. Return only valid JSON. Keep the tone professional and decision-focused.',
        prompt: 'Return JSON with keys: summary_markdown, highlights (array), risks (array), actions (array).',
        userText: JSON.stringify({
            report,
        }),
    });

    if (!aiResponse?.summary_markdown) {
        return fallback;
    }

    return {
        provider: 'openai',
        summary_markdown: normalizeText(aiResponse.summary_markdown, fallback.summary_markdown),
        highlights: Array.isArray(aiResponse.highlights) ? aiResponse.highlights.map((value) => normalizeText(value)).filter(Boolean) : fallback.highlights,
        risks: Array.isArray(aiResponse.risks) ? aiResponse.risks.map((value) => normalizeText(value)).filter(Boolean) : fallback.risks,
        actions: Array.isArray(aiResponse.actions) ? aiResponse.actions.map((value) => normalizeText(value)).filter(Boolean) : fallback.actions,
    };
}

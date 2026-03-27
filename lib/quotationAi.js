import { promises as fs } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import { defaultCommercialLists, normalizeCurrencyCode } from '@/lib/quotationCommercial';
import {
    buildLearningPatternsFromMatches,
    findRelevantQuotationLibraryRecords,
    getQuotationAiLibraryStats,
} from '@/lib/quotationAiLibrary';
import { getPriceReferences } from '@/lib/priceReferenceStore';

const DEFAULT_AI_MODEL = process.env.OPENAI_QUOTATION_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1';
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

function splitCleanLines(text = '') {
    return String(text)
        .split(/\r?\n/)
        .map((line) => normalizeText(line))
        .filter(Boolean);
}

function getStructuredSourcePages(extractedTexts = []) {
    return extractedTexts
        .flatMap((entry) => {
            if (Array.isArray(entry.pages) && entry.pages.length) {
                return entry.pages.map((page) => splitCleanLines(page.text || ''));
            }
            return entry.text ? [splitCleanLines(entry.text)] : [];
        })
        .filter((lines) => lines.length);
}

function isQuantityLikeLine(line = '') {
    return /^(\d+(\.\d+)?\s*(sqm|sqm\.|nos|no|set|sets|rm|m|pcs|pc|unit|units)?\s*)+$/i.test(line);
}

function normalizeUnit(value = '') {
    const unit = normalizeText(value).toLowerCase().replace(/\.+$/, '');
    if (!unit) return '';
    if (unit === 'no') return 'nos';
    if (unit === 'set') return 'sets';
    if (unit === 'unit') return 'units';
    if (unit === 'ls' || unit === 'l.s') return 'l.s.';
    return unit;
}

function parseQuantityEntry(line = '', currentTitle = '') {
    const normalized = normalizeText(line);
    if (!normalized) return null;

    let match = normalized.match(/^[a-z]\s+(\d+(?:\.\d+)?)\s*(sqm|nos?|sets?|lot|pax|l\.?s\.?|rm|m|pcs?|units?)$/i);
    if (match) {
        return {
            title: normalizeText(currentTitle),
            qty: match[1],
            unit: normalizeUnit(match[2]),
        };
    }

    match = normalized.match(/^(\d+(?:\.\d+)?)\s*(sqm|nos?|sets?|lot|pax|l\.?s\.?|rm|m|pcs?|units?)$/i);
    if (match) {
        return {
            title: normalizeText(currentTitle),
            qty: match[1],
            unit: normalizeUnit(match[2]),
        };
    }

    match = normalized.match(/^\d+\s+(\d+(?:\.\d+)?)\s*(sqm|nos?|sets?|lot|pax|l\.?s\.?|rm|m|pcs?|units?)$/i);
    if (match) {
        return {
            title: normalizeText(currentTitle),
            qty: match[1],
            unit: normalizeUnit(match[2]),
        };
    }

    match = normalized.match(/^\d+\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(sqm|nos?|sets?|lot|pax|l\.?s\.?|rm|m|pcs?|units?)$/i);
    if (match) {
        const parsedTitle = normalizeText(match[1]);
        return {
            title: /^\d+(?:\.\d+)?$/.test(parsedTitle) ? '' : toTitleCase(parsedTitle),
            qty: match[2],
            unit: normalizeUnit(match[3]),
        };
    }

    return null;
}

function isSectionHeadingLine(line = '') {
    return /^[A-Z]\s+[A-Z][\p{L}\p{N}\s&()/.,-]{2,}$/u.test(line);
}

function isItemHeadingLine(line = '') {
    return /^\d+\s+[A-Z][\p{L}\p{N}\s&()/.,-]{2,}$/u.test(line);
}

function isMetadataLine(line = '') {
    return /^(pico international|applied science university|proposed venue|date\s*\/\s*duration|number of students|quotation|event\s*:|dear|kingdom of bahrain|info@|p\.o\. box|vat\b)/i.test(line);
}

function detectSubjectFromQuotationLines(lines = []) {
    const eventLine = lines.find((line) => /^event\s*:/i.test(line));
    if (eventLine) return normalizeText(eventLine.replace(/^event\s*:/i, ''));
    return lines.find((line) => /(ceremony|summit|conference|exhibition|graduation|forum|festival|event)/i.test(line) && line.length > 12) || '';
}

function detectCustomerNameFromQuotationLines(lines = []) {
    const eventIndex = lines.findIndex((line) => /^event\s*:/i.test(line));
    const candidates = (eventIndex >= 0 ? lines.slice(0, eventIndex) : lines)
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .filter((line) => !/^a global event marketing company$/i.test(line))
        .filter((line) => !/^pico international/i.test(line))
        .filter((line) => !/^applied science university$/i.test(line) ? true : true)
        .filter((line) => !/^408-411,/i.test(line))
        .filter((line) => !/^hmg tower/i.test(line))
        .filter((line) => !/^p\.o\. box/i.test(line))
        .filter((line) => !/^kingdom of bahrain$/i.test(line))
        .filter((line) => !/^info@/i.test(line))
        .filter((line) => !/^\d/.test(line));

    const strong = candidates.find((line) => /(university|w\.l\.l|company|bank|group|committee|hotel|school|institute)/i.test(line));
    if (strong) return strong;
    return candidates[0] || '';
}

function extractMetadataValue(lines = [], pattern) {
    const match = lines.find((line) => pattern.test(line));
    if (!match) return '';
    return normalizeText(match.replace(pattern, ''));
}

function toTitleCase(value = '') {
    return normalizeText(value)
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
        .join(' ');
}

function createParsedSectionMap(sectionNames = []) {
    const unique = [];
    const seen = new Set();
    sectionNames.forEach((name) => {
        const normalized = normalizeText(name);
        const key = normalized.toLowerCase();
        if (normalized && !seen.has(key)) {
            seen.add(key);
            unique.push(normalized);
        }
    });
    return new Map(unique.map((name) => [name, {
        name,
        selling_rule: '0.70',
        section_selling: 0,
        items: [],
    }])); 
}

function normalizeSectionHeading(rawHeading = '', nextLine = '') {
    const heading = normalizeText(rawHeading);
    const trailing = normalizeText(nextLine);
    if (!heading) return '';

    if (/^f$/i.test(heading) && ((/^\d+\s+/).test(trailing) || /^design\s*&\s*project management$/i.test(trailing))) {
        return 'Design & Project Management';
    }

    const combined = heading.length === 1 && trailing
        ? `${heading} ${trailing}`
        : heading;

    const cleaned = combined
        .replace(/^[A-Z]\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return cleaned ? toTitleCase(cleaned) : '';
}

function extractSectionOutline(lines = []) {
    const sections = [];
    let currentSection = null;

    function ensureSection(name) {
        const normalized = normalizeText(name);
        if (!normalized) return null;
        const existing = sections.find((section) => section.name.toLowerCase() === normalized.toLowerCase());
        if (existing) {
            currentSection = existing;
            return existing;
        }
        const next = {
            name: normalized,
            item_titles: [],
        };
        sections.push(next);
        currentSection = next;
        return next;
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = normalizeText(lines[index]);
        const nextLine = normalizeText(lines[index + 1]);
        if (!line || isScopeNoiseLine(line)) continue;

        if (isSectionHeadingLine(line) || (/^[A-Z]$/.test(line) && /^[A-Z]/.test(nextLine))) {
            const sectionName = normalizeSectionHeading(line, nextLine);
            if (sectionName) {
                ensureSection(sectionName);
                if (/^[A-Z]$/.test(line) && nextLine) index += 1;
                continue;
            }
        }

        if (!currentSection || !isItemHeadingLine(line)) continue;

        const itemTitle = normalizeText(line.replace(/^\d+\s+/, ''))
            .replace(/\s+/g, ' ')
            .trim();

        if (
            !itemTitle
            || /^set$/i.test(itemTitle)
            || /^sets$/i.test(itemTitle)
            || /^nos?$/i.test(itemTitle)
            || /^sqm$/i.test(itemTitle)
            || /^pax$/i.test(itemTitle)
            || /^\d/.test(itemTitle)
        ) {
            continue;
        }

        if (!currentSection.item_titles.some((entry) => entry.toLowerCase() === itemTitle.toLowerCase())) {
            currentSection.item_titles.push(toTitleCase(itemTitle));
        }
    }

    return sections.filter((section) => section.item_titles.length || section.name);
}

function extractSectionTitlesFromLines(lines = []) {
    const titles = [];
    lines.forEach((line, index) => {
        if (/^[A-Z]\s+[A-Z][\p{L}\p{N}\s&()/.,-]{2,}$/iu.test(line)) {
            titles.push(toTitleCase(line.replace(/^[A-Z]\s+/, '')));
            return;
        }
        if (/^design\s*&\s*project management$/i.test(line) && lines[index - 1] === 'F') {
            titles.push('Design & Project Management');
        }
    });
    return titles;
}

function isScopeNoiseLine(line = '') {
    return (
        !line
        || /^confidential page/i.test(line)
        || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)
        || /^tel:?$/i.test(line)
        || /^fax:?$/i.test(line)
        || /^\(\d+\)$/.test(line)
        || /^\d{3,4}$/.test(line)
        || /^09 june 2024$/i.test(line)
        || /^a global event marketing company$/i.test(line)
        || /^pico international/i.test(line)
        || /^408-411,/i.test(line)
        || /^hmg tower/i.test(line)
        || /^p\.o\. box/i.test(line)
        || /^kingdom of bahrain$/i.test(line)
        || /^info@/i.test(line)
        || /^no\s+qty\s+unit$/i.test(line)
    );
}

function extractScopeDescriptions(lines = []) {
    const descriptions = [];
    let inScope = false;
    let current = '';

    function flush() {
        const next = normalizeText(current);
        if (next) descriptions.push(next);
        current = '';
    }

    for (const rawLine of lines) {
        const line = normalizeText(rawLine);
        if (!line) continue;

        if (/^exclusions$/i.test(line) || /^terms\s*&\s*conditions/i.test(line) || /^payment terms/i.test(line) || /^preliminary schedule$/i.test(line)) {
            flush();
            break;
        }

        if (/^scope of works description$/i.test(line)) {
            flush();
            inScope = true;
            continue;
        }

        if (!inScope) continue;
        if (isScopeNoiseLine(line)) {
            flush();
            continue;
        }

        if (/^size:/i.test(line) || /^x\s+\d+/i.test(line) || /^\(.+\)\s*x\s+\d+/i.test(line)) {
            current = current ? `${current} ${line}` : line;
            continue;
        }

        if (/[:;]$/.test(line)) {
            flush();
            current = line;
            continue;
        }

        if (current && (current.endsWith(':') || current.length < 28)) {
            current = `${current} ${line}`.trim();
            continue;
        }

        flush();
        current = line;
    }

    flush();
    return descriptions.filter((line) => line.length > 10);
}

function extractPageScopeDescriptions(lines = []) {
    const scopedLines = [];
    let inScope = false;

    for (const rawLine of lines) {
        const line = normalizeText(rawLine);
        if (!line) continue;

        if (/^scope of works description$/i.test(line)) {
            inScope = true;
            continue;
        }

        if (!inScope) continue;

        if (
            /^exclusions$/i.test(line)
            || /^terms\s*&\s*conditions/i.test(line)
            || /^payment terms/i.test(line)
            || /^preliminary schedule$/i.test(line)
        ) {
            break;
        }

        scopedLines.push(line);
    }

    return extractScopeDescriptions(scopedLines);
}

function extractPageOutline(lines = []) {
    const sections = [];
    let currentSection = null;
    let currentItemTitle = '';
    let afterTableHeader = false;

    function ensureSection(name) {
        const normalized = normalizeText(name);
        if (!normalized) return null;
        let section = sections.find((entry) => entry.name.toLowerCase() === normalized.toLowerCase());
        if (!section) {
            section = { name: normalized, entries: [] };
            sections.push(section);
        }
        currentSection = section;
        currentItemTitle = '';
        return section;
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = normalizeText(lines[index]);
        const nextLine = normalizeText(lines[index + 1]);
        if (!line) continue;

        if (/^no\s+qty\s+unit$/i.test(line)) {
            afterTableHeader = true;
            continue;
        }

        if (!afterTableHeader) continue;

        if (
            /^scope of works description$/i.test(line)
            || /^exclusions$/i.test(line)
            || /^terms\s*&\s*conditions/i.test(line)
            || /^payment terms/i.test(line)
            || /^preliminary schedule$/i.test(line)
            || /^total cost based on above scope of works/i.test(line)
        ) {
            break;
        }

        if (isScopeNoiseLine(line) || isMetadataLine(line)) continue;

        if (isSectionHeadingLine(line) || (/^[A-Z]$/.test(line) && /^[A-Z]/.test(nextLine))) {
            const sectionName = normalizeSectionHeading(line, nextLine);
            if (sectionName) {
                ensureSection(sectionName);
                if (/^[A-Z]$/.test(line) && nextLine) index += 1;
                continue;
            }
        }

        if (!currentSection) continue;

        if (isItemHeadingLine(line)) {
            currentItemTitle = toTitleCase(line.replace(/^\d+\s+/, ''));
            continue;
        }

        const entry = parseQuantityEntry(line, currentItemTitle);
        if (entry) {
            currentSection.entries.push({
                title: entry.title || currentItemTitle || '',
                qty: entry.qty,
                unit: entry.unit || 'nos',
            });
            continue;
        }
    }

    return sections.filter((section) => section.entries.length);
}

function extractDocumentOutline(pages = []) {
    const sections = [];
    let currentSection = null;
    let currentItemTitle = '';

    function ensureSection(name) {
        const normalized = normalizeText(name);
        if (!normalized) return null;
        let section = sections.find((entry) => entry.name.toLowerCase() === normalized.toLowerCase());
        if (!section) {
            section = { name: normalized, entries: [] };
            sections.push(section);
        }
        currentSection = section;
        return section;
    }

    for (const lines of pages) {
        let afterTableHeader = false;

        for (let index = 0; index < lines.length; index += 1) {
            const line = normalizeText(lines[index]);
            const nextLine = normalizeText(lines[index + 1]);
            if (!line) continue;

            if (/^no\s+qty\s+unit$/i.test(line)) {
                afterTableHeader = true;
                continue;
            }

            if (!afterTableHeader) continue;

            if (
                /^scope of works description$/i.test(line)
                || /^exclusions$/i.test(line)
                || /^terms\s*&\s*conditions/i.test(line)
                || /^payment terms/i.test(line)
                || /^preliminary schedule$/i.test(line)
                || /^total cost based on above scope of works/i.test(line)
            ) {
                break;
            }

            if (isScopeNoiseLine(line) || isMetadataLine(line)) continue;

            if (isSectionHeadingLine(line) || (/^[A-Z]$/.test(line) && /^[A-Z]/.test(nextLine))) {
                const sectionName = normalizeSectionHeading(line, nextLine);
                if (sectionName) {
                    ensureSection(sectionName);
                    currentItemTitle = '';
                    if (/^[A-Z]$/.test(line) && nextLine) index += 1;
                    continue;
                }
            }

            if (!currentSection) continue;

            if (isItemHeadingLine(line)) {
                currentItemTitle = toTitleCase(line.replace(/^\d+\s+/, ''));
                continue;
            }

            if (/^\d+$/.test(line)) {
                continue;
            }

            const entry = parseQuantityEntry(line, currentItemTitle);
            if (entry) {
                currentSection.entries.push({
                    title: entry.title || currentItemTitle || '',
                    qty: entry.qty,
                    unit: entry.unit || 'nos',
                });
            }
        }
    }

    return sections.filter((section) => section.entries.length);
}

function extractPageNarrativeDescriptions(lines = []) {
    const descriptions = [];
    let afterTableHeader = false;
    let inScope = false;
    let suppressUntilScope = false;
    let current = '';
    let listMode = false;

    function flush() {
        const next = normalizeText(current);
        if (next) descriptions.push(next);
        current = '';
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = normalizeText(lines[index]);
        const nextLine = normalizeText(lines[index + 1]);
        if (!line) continue;

        if (/^no\s+qty\s+unit$/i.test(line)) {
            afterTableHeader = true;
            continue;
        }

        if (!afterTableHeader) continue;

        if (
            /^terms\s*&\s*conditions/i.test(line)
            || /^payment terms/i.test(line)
            || /^preliminary schedule$/i.test(line)
        ) {
            flush();
            break;
        }

        if (/^exclusions$/i.test(line)) {
            flush();
            suppressUntilScope = true;
            inScope = false;
            continue;
        }

        if (/^total cost based on above scope of works/i.test(line)) {
            flush();
            continue;
        }

        if (/^scope of works description$/i.test(line)) {
            inScope = true;
            suppressUntilScope = false;
            flush();
            continue;
        }

        if (suppressUntilScope) {
            continue;
        }

        if (!inScope && !current) {
            listMode = false;
        }

        if (/including:?$/i.test(line) || /^audio system$/i.test(line) || /^rental supply & installation of;$/i.test(line)) {
            flush();
            listMode = true;
            continue;
        }

        if (
            isScopeNoiseLine(line)
            || isMetadataLine(line)
            || isSectionHeadingLine(line)
            || (/^[A-Z]$/.test(line) && /^[A-Z]/.test(nextLine))
            || isItemHeadingLine(line)
            || parseQuantityEntry(line)
            || /^\d+$/.test(line)
            || /^scope of works description$/i.test(line)
        ) {
            flush();
            continue;
        }

        if (listMode) {
            if (line.length <= 60 && !/[.:]$/.test(line)) {
                descriptions.push(line);
                continue;
            }
            listMode = false;
        }

        if (/^size:/i.test(line) || /^x\s+\d+/i.test(line) || /^\(.+\)\s*x\s+\d+/i.test(line)) {
            current = current ? `${current} ${line}` : line;
            continue;
        }

        if (/^[a-z]\s+\d+/i.test(line)) {
            flush();
            continue;
        }

        if (/[:;]$/.test(line)) {
            flush();
            current = line;
            continue;
        }

        if (current && (current.endsWith(':') || current.length < 42)) {
            current = `${current} ${line}`.trim();
            continue;
        }

        flush();
        current = line;
    }

    flush();
    return descriptions.filter((entry) => entry.length > 8);
}

function extractDocumentNarrativeDescriptions(pages = []) {
    return pages.flatMap((lines) => extractPageNarrativeDescriptions(lines));
}

function classifyScopeDescription(description = '') {
    const text = description.toLowerCase();
    const groups = [
        {
            name: 'Design & Project Management',
            keywords: ['project manager', 'project management', 'concept and design', 'visualisation', 'rendering', 'coordination', 'site supervisor', 'safety officer', 'site coordinator', 'show caller', 'insurance', 'photography', 'videography', 'live feed', 'ushers', 'collaterals', 'passes'],
        },
        {
            name: 'Furniture',
            keywords: ['sofas', 'coffee table', 'coffee tables', 'student chairs', 'chairs', 'floral arrangement', 'tables for vip'],
        },
        {
            name: 'Photo Ops',
            keywords: ['photo backdrop', 'timeline wall', 'photo ops'],
        },
        {
            name: 'Complimentary',
            keywords: ['led globe', 'display posters', 'directional signages', 'holding area', 'cut-out signage', 'signage with flex insert', 'complimentary'],
        },
        {
            name: 'AV Equipment (Supplied on rental basis)',
            keywords: ['led screens', 'lighting equipment', 'source 4', 'robe', 'washers', 'parcans', 'lighting console', 'audio system', 'line array', 'subwoofer', 'monitors', 'mics', 'mixer', 'sound', 'truss', 'chain motors', 'stage effects', 'sparklers', 'lights'],
        },
        {
            name: 'Bespoke Structures',
            keywords: ['platform', 'wooden', 'mdf', 'scaffold', 'carpet flooring', 'podium', 'stage deck', 'side wings', 'backsupport', 'tiered platform', 'frame for led screens', 'backdrop'],
        },
    ];

    let best = { name: 'Scope of Works', score: 0 };
    groups.forEach((group) => {
        const score = group.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
        if (score > best.score) best = { name: group.name, score };
    });

    return best.name;
}

function parseStructuredQuotationText(extractedTexts = []) {
    const pages = getStructuredSourcePages(extractedTexts);
    const lines = pages.flat();
    if (!lines.length) return null;

    const subject = detectSubjectFromQuotationLines(lines);
    const customerName = detectCustomerNameFromQuotationLines(lines);
    const venue = extractMetadataValue(lines, /^proposed venue\s*:\s*/i);
    const eventDate = extractMetadataValue(lines, /^date\s*\/\s*duration\s*:\s*/i);
    const attendance = extractMetadataValue(lines, /^number of students\s*:\s*/i);
    const sectionTitles = extractSectionTitlesFromLines(lines);
    const sectionOutline = extractDocumentOutline(pages);
    const sectionMap = createParsedSectionMap([
        ...sectionTitles,
        ...sectionOutline.map((section) => section.name),
        'Bespoke Structures',
        'AV Equipment (Supplied on rental basis)',
        'Photo Ops',
        'Furniture',
        'Complimentary',
        'Design & Project Management',
    ]);

    const addItemToSection = (sectionName, description, overrides = {}) => {
        if (!sectionMap.has(sectionName)) {
            sectionMap.set(sectionName, {
                name: sectionName,
                selling_rule: '0.70',
                section_selling: 0,
                items: [],
            });
        }
        const section = sectionMap.get(sectionName);
        const normalizedDescription = normalizeText(description);
        if (!normalizedDescription) return;
        if (section.items.some((item) => item.description.toLowerCase() === normalizedDescription.toLowerCase())) return;
        section.items.push({
            description: normalizedDescription,
            qty: normalizeText(overrides.qty || ''),
            unit: normalizeText(overrides.unit || 'nos'),
            costs_bhd: normalizeText(overrides.costs_bhd || ''),
            rate: normalizeText(overrides.rate || ''),
            price_reference_id: normalizeText(overrides.price_reference_id || ''),
        });
    };

    const documentDescriptions = extractDocumentNarrativeDescriptions(pages);
    let pageBasedMapped = false;
    if (sectionOutline.length && documentDescriptions.length) {
        pageBasedMapped = true;
        let descriptionIndex = 0;
        sectionOutline.forEach((outlinedSection) => {
            if (!sectionMap.has(outlinedSection.name)) {
                sectionMap.set(outlinedSection.name, {
                    name: outlinedSection.name,
                    selling_rule: '0.70',
                    section_selling: 0,
                    items: [],
                });
            }
            outlinedSection.entries.forEach((entry) => {
                const description = normalizeText(documentDescriptions[descriptionIndex] || '');
                if (!description) return;
                descriptionIndex += 1;
                addItemToSection(
                    outlinedSection.name,
                    entry.title && !description.toLowerCase().includes(entry.title.toLowerCase())
                        ? `${entry.title}: ${description}`
                        : description,
                    {
                        qty: entry.qty,
                        unit: entry.unit,
                    },
                );
            });
        });
    }

    if (!pageBasedMapped) {
        const scopeDescriptions = extractScopeDescriptions(lines);
        scopeDescriptions.forEach((description) => {
            const sectionName = classifyScopeDescription(description);
            addItemToSection(sectionName, description);
        });
    }

    const cleanedSections = [...sectionMap.values()]
        .map((section) => ({
            ...section,
            items: section.items.slice(0, 24),
        }))
        .filter((section) => section.items.length);

    if (!cleanedSections.length) return null;

    return {
        subject,
        customerName,
        notes: [venue ? `Venue: ${venue}` : '', eventDate ? `Date / Duration: ${eventDate}` : '', attendance ? `Attendance: ${attendance}` : '']
            .filter(Boolean)
            .join('\n'),
        sections: cleanedSections,
    };
}

function buildFallbackDraft({ quotation = {}, brief = '', extractedTexts = [], matchedRecords = [], mode = 'draft' }) {
    const defaults = defaultCommercialLists();
    const title = getPrimaryTitle(brief, extractedTexts, quotation);
    const matchedSections = matchedRecords[0]?.sections || [];
    const learnedPatterns = buildLearningPatternsFromMatches(matchedRecords);
    const parsedQuotation = mode === 'duplicate' ? parseStructuredQuotationText(extractedTexts) : null;
    const itemCandidates = buildItemCandidates(brief, extractedTexts);
    const items = ((parsedQuotation?.sections?.[0]?.items?.length
        ? parsedQuotation.sections[0].items.map((item) => item.description)
        : itemCandidates.length
            ? itemCandidates
            : matchedSections.flatMap((section) => (section.items || []).map((item) => item.description)).slice(0, 6))).map((line) => ({
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
        summary: mode === 'duplicate'
            ? 'Built a duplicate-ready draft from the uploaded quotation text and learned quotation patterns.'
            : 'Built a first draft from the available brief and source text.',
        assumptions,
        missing_details: missingDetails,
        draft_patch: {
            project_title: parsedQuotation?.subject || title,
            subject: parsedQuotation?.subject || title,
            client_org: parsedQuotation?.customerName || quotation.client_org || '',
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
            notes: [normalizeText(parsedQuotation?.notes), normalizeText(quotation.notes)].filter(Boolean).join('\n\n'),
            sections: parsedQuotation?.sections?.length
                ? parsedQuotation.sections
                : items.length
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

async function callJsonChat({ system, prompt, userText, imageInputs = [], temperature = 0.2 }) {
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
        temperature,
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
            const parser = new PDFParse({ data: buffer });
            try {
                const parsed = await parser.getText();
                return {
                    name,
                    type: 'application/pdf',
                    text: truncateText(parsed.text),
                    pages: Array.isArray(parsed.pages)
                        ? parsed.pages.map((page) => ({
                            num: page.num,
                            text: truncateText(page.text || ''),
                        }))
                        : [],
                };
            } finally {
                await parser.destroy();
            }
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

export async function generateDraftWithAi({ quotation = {}, brief = '', files = [], mode = 'draft' }) {
    const { extractedTexts, imageInputs } = await collectSourceContext({ quotation, files });
    const libraryContext = await collectQuotationLibraryContext({ quotation, brief, kind: mode === 'duplicate' ? 'duplicate' : 'draft', limit: 4 });
    const fallback = buildFallbackDraft({ quotation, brief, extractedTexts, matchedRecords: libraryContext.matches, mode });
    if (mode === 'duplicate' && !files.length) {
        return {
            ...fallback,
            summary: 'Upload an existing quotation file first, then run duplicate generation.',
            missing_details: ['Add a quotation PDF, Excel file, PowerPoint, or image file to duplicate from.'],
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            evidence: summarizeMatchedQuotations(libraryContext.matches),
            confidence: 0.2,
            library_stats: libraryContext.library_stats,
            learned_patterns: libraryContext.learned_patterns,
        };
    }
    const aiResponse = await callJsonChat({
        system: `You are an expert quotation writer for a professional engineering and supply company operating in Bahrain (currency: BHD).
Your role is to help the internal sales team build accurate, professional first-draft quotations from client briefs and reference documents.

RULES:
- Never invent or guess pricing values. Leave costs_bhd and rate as empty strings if you cannot find strong evidence from matched examples.
- Extract scope items directly from the brief or uploaded files — do not fabricate items.
- Use section names, exclusions, terms, and payment terms that match the company's proven patterns from the matched_quotations history.
- When matched_line_examples contain similar items with real pricing, note those items in your assumptions — but still leave pricing blank unless explicitly instructed.
- Write the project_title and subject to be clear and professional (e.g. "Supply and Installation of CCTV System – Al Seef District").
- Keep the selling_rule consistent with the matched examples (typically a decimal like "0.70").
- Output ONLY valid JSON. No markdown, no explanation outside the JSON.`,
        prompt: 'Return a JSON object with keys: summary (string — one sentence describing what you drafted and what evidence you used), assumptions (array of strings — key decisions you made), missing_details (array of strings — what info is needed to complete the quotation), draft_patch { project_title, subject, notes, exclusions (array of strings), terms (array of strings), payment_terms (array of strings), sections (array of { name, selling_rule, section_selling: 0, items (array of { description, qty, unit, costs_bhd, rate, price_reference_id }) }) }.',
        userText: JSON.stringify({
            mode,
            brief,
            quotation: buildQuotationContext(quotation),
            extracted_sources: extractedTexts.map((entry) => ({ name: entry.name, text: truncateText(entry.text, 4500) })),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            matched_line_examples: flattenMatchedItems(libraryContext.matches).slice(0, 18),
            learned_patterns: libraryContext.learned_patterns,
        }),
        imageInputs,
        temperature: 0.3,
    });

    if (!aiResponse?.draft_patch) {
        return {
            ...fallback,
            summary: mode === 'duplicate'
                ? 'Built a duplicate-ready draft from the uploaded quotation and matched quotation evidence.'
                : fallback.summary,
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
        system: `You are a pricing analyst for a professional engineering and supply company in Bahrain (currency: BHD).
Your job is to suggest accurate costs and rates for quotation line items using two authoritative sources:
1. price_references — the company's internal price catalogue (PRIMARY SOURCE — always prefer this)
2. matched_line_examples — similar items from past confirmed and draft quotations (SECONDARY EVIDENCE)

RULES:
- For each item, search price_references first by matching description keywords to the reference title, category, and notes.
- If a price reference matches, use its reference_rate as the basis for costs_bhd. Calculate rate = costs_bhd / selling_rule.
- If no price reference matches but a matched_line_example is very similar (same scope, same unit), use its costs_bhd as evidence — but set confidence below 0.75.
- If neither source provides a reliable match, leave costs_bhd and rate as empty strings — do NOT invent values.
- Detect and flag pricing anomalies: if the current item already has a costs_bhd that is more than 2x or less than 0.4x similar historical items, note this in the reasoning.
- Suggest a selling_rule (e.g. "0.70", "0.65") consistent with the section and matched historical patterns.
- Set confidence between 0.0 and 1.0: 0.9+ for direct price reference match, 0.6–0.85 for historical match only, below 0.6 for weak matches.
- Output ONLY valid JSON.`,
        prompt: 'Return JSON with keys: summary (string), suggestions (array of { sectionIndex, itemIndex, reference_id, reference_title, matched_quotation_label, costs_bhd (number or empty string), rate (number or empty string), selling_rule (string), confidence (number 0–1), reasoning (string — explain which source you used and why) }).',
        userText: JSON.stringify({
            quotation: buildQuotationContext(quotation),
            price_references: summarizeReferences(references),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            matched_line_examples: flattenMatchedItems(libraryContext.matches).slice(0, 18),
            learned_patterns: libraryContext.learned_patterns,
        }),
        temperature: 0.1,
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
        system: `You are a senior quotation quality reviewer for a professional engineering and supply company in Bahrain (currency: BHD).
Your job is to identify every issue that could cause problems when this quotation is sent to a client.

CHECK THESE CATEGORIES (in order of importance):

COMPLETENESS:
- Missing customer name, project title, salesperson, billing address, TRN/VAT number
- Any section with no items, or items with blank description, quantity, unit, or costs

COMMERCIAL ALIGNMENT:
- Items where the current costs_bhd appears unusually high or low compared to matched_line_examples
- Selling rules that deviate significantly from the company's historical patterns
- Missing or non-standard exclusions, payment terms, or terms & conditions

SCOPE CONSISTENCY:
- Items in the quotation that contradict the brief or source documents
- Missing items that are clearly mentioned in the brief but absent from sections
- Vague item descriptions that a client could misinterpret

FORMATTING:
- Section names that are blank or too generic
- Notes field left blank when the brief mentions special instructions

SEVERITY LEVELS:
- "high" — must fix before sending (missing critical field, blank required value)
- "medium" — should fix (commercial risk, ambiguity, or missing standard clause)
- "low" — nice to have (minor quality improvement)

Set ready: true only if there are zero high-severity warnings.
Output ONLY valid JSON.`,
        prompt: 'Return JSON with keys: summary (string), ready (boolean), warnings (array of { severity ("high"|"medium"|"low"), title (short), message (actionable detail) }).',
        userText: JSON.stringify({
            brief,
            quotation: buildQuotationContext(quotation),
            extracted_sources: extractedTexts.map((entry) => ({ name: entry.name, text: truncateText(entry.text, 3500) })),
            matched_quotations: summarizeMatchedQuotations(libraryContext.matches),
            matched_line_examples: flattenMatchedItems(libraryContext.matches).slice(0, 12),
            learned_patterns: libraryContext.learned_patterns,
        }),
        temperature: 0.15,
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
        system: `You write concise management summaries for quotation performance reports for a professional engineering and supply company in Bahrain.

Your audience is the sales manager or business owner who needs to make decisions quickly.

STRUCTURE YOUR ANALYSIS:
1. Lead with the win rate (confirmed / total) and total confirmed value — these are the most important KPIs.
2. Identify which owner or salesperson drove the most confirmed value — and who has the most stalled drafts.
3. Identify which customer generated the most value or the most quotations.
4. Flag any unusual patterns: e.g. a sudden drop in confirmation rate, high cancellation volume, or a single owner dominating pipeline.
5. Provide 2–3 concrete, specific actions management should take — not generic advice.

TONE: Professional, direct, decision-focused. Use numbers. Avoid filler phrases.
OUTPUT: Only valid JSON. Use markdown in summary_markdown (bold for key numbers).`,
        prompt: 'Return JSON with keys: summary_markdown (string with markdown — 3–5 sentences max), highlights (array of strings — top 3–4 factual highlights with numbers), risks (array of strings — concrete business risks observed), actions (array of strings — specific recommended actions for management).',
        userText: JSON.stringify({ report }),
        temperature: 0.2,
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

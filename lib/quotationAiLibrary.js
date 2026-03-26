import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';

const DATA_DIR = path.join(process.cwd(), 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'quotation-ai-library.json');
const DEFAULT_IMPORT_DIR = process.env.QUOTATION_AI_IMPORT_DIR || 'C:\\Users\\PICO\\Desktop\\New folder (2)';
const POSTGRES_ENABLED = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let pgReadyPromise = null;

function normalizeText(value, fallback = '') {
    return String(value ?? fallback).replace(/\r\n/g, '\n').replace(/\uFEFF/g, '').trim();
}

function normalizeNumber(value, fallback = 0) {
    const text = String(value ?? '').replace(/,/g, '').trim();
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeComparableText(value = '') {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function keywordTokens(value = '') {
    return normalizeComparableText(value)
        .split(/\s+/)
        .filter((token) => token.length > 2);
}

function phraseTokens(value = '', size = 2) {
    const tokens = keywordTokens(value);
    if (tokens.length < size) return [];
    const phrases = [];
    for (let index = 0; index <= tokens.length - size; index += 1) {
        phrases.push(tokens.slice(index, index + size).join(' '));
    }
    return phrases;
}

function scorePhraseOverlap(queryText = '', recordText = '') {
    const queryPhrases = new Set(phraseTokens(queryText, 2));
    if (!queryPhrases.size) return 0;
    const recordPhrases = new Set(phraseTokens(recordText, 2));
    let score = 0;
    queryPhrases.forEach((phrase) => {
        if (recordPhrases.has(phrase)) score += 5;
    });
    return score;
}

function computeRecordQualityScore(record = {}) {
    const itemCount = (record.sections || []).reduce((sum, section) => sum + (section.items || []).length, 0);
    const legalCount = (record.exclusions || []).length + (record.terms || []).length + (record.payment_terms || []).length;
    const hasCustomer = record.customer_name ? 1 : 0;
    const hasTitle = record.title ? 1 : 0;
    const hasDate = record.quote_date ? 1 : 0;
    const hasValue = Number(record.total_value || 0) > 0 ? 1 : 0;
    const sourceBoost = record.source_type === 'system'
        ? (record.status === 'Confirmed' ? 24 : 14)
        : 8;

    return (
        Math.min(itemCount, 10) * 2
        + Math.min(legalCount, 9)
        + (hasCustomer * 6)
        + (hasTitle * 6)
        + (hasDate * 3)
        + (hasValue * 4)
        + sourceBoost
    );
}

function normalizeCurrencyCode(value, fallback = 'BHD') {
    const normalized = normalizeText(value || fallback).toUpperCase();
    return normalized || fallback;
}

function buildBlankState() {
    return {
        meta: {
            updated_at: null,
            historical_imported_at: null,
            historical_source_dir: DEFAULT_IMPORT_DIR,
        },
        records: [],
    };
}

function getPgPool() {
    if (!POSTGRES_ENABLED) return null;
    if (!pgPool) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pgPool;
}

async function ensurePostgresStore() {
    if (!POSTGRES_ENABLED) return;
    if (!pgReadyPromise) {
        pgReadyPromise = (async () => {
            const pool = getPgPool();
            const client = await pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS quotation_ai_library (
                        source_key TEXT PRIMARY KEY,
                        source_type TEXT NOT NULL,
                        source_id TEXT NOT NULL DEFAULT '',
                        group_key TEXT NOT NULL DEFAULT '',
                        source_path TEXT NOT NULL DEFAULT '',
                        source_label TEXT NOT NULL DEFAULT '',
                        quote_number TEXT NOT NULL DEFAULT '',
                        ref TEXT NOT NULL DEFAULT '',
                        quote_date TEXT NOT NULL DEFAULT '',
                        modified_at TIMESTAMPTZ NULL,
                        updated_at TIMESTAMPTZ NOT NULL,
                        title TEXT NOT NULL DEFAULT '',
                        customer_name TEXT NOT NULL DEFAULT '',
                        contact_name TEXT NOT NULL DEFAULT '',
                        currency_code TEXT NOT NULL DEFAULT 'BHD',
                        status TEXT NOT NULL DEFAULT '',
                        total_value DOUBLE PRECISION NOT NULL DEFAULT 0,
                        search_text TEXT NOT NULL DEFAULT '',
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        provenance JSONB NOT NULL DEFAULT '{}'::jsonb
                    )
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS quotation_ai_library_meta (
                        key TEXT PRIMARY KEY,
                        value JSONB NOT NULL
                    )
                `);
                await client.query(
                    `INSERT INTO quotation_ai_library_meta(key, value)
                     VALUES ('state', $1::jsonb)
                     ON CONFLICT (key) DO NOTHING`,
                    [JSON.stringify(buildBlankState().meta)],
                );
            } finally {
                client.release();
            }
        })();
    }
    await pgReadyPromise;
}

async function ensureJsonStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(LIBRARY_FILE);
    } catch {
        await fs.writeFile(LIBRARY_FILE, JSON.stringify(buildBlankState(), null, 2), 'utf8');
    }
}

async function readJsonStore() {
    await ensureJsonStore();
    try {
        const raw = await fs.readFile(LIBRARY_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            meta: parsed.meta || buildBlankState().meta,
            records: Array.isArray(parsed.records) ? parsed.records.map(normalizeLibraryRecord) : [],
        };
    } catch {
        return buildBlankState();
    }
}

async function writeJsonStore(state) {
    await ensureJsonStore();
    const tempPath = `${LIBRARY_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempPath, LIBRARY_FILE);
}

function stripCopyMarkers(value = '') {
    return normalizeText(value)
        .replace(/\.(xlsx?|xls)$/i, '')
        .replace(/\bcopy of\b/gi, ' ')
        .replace(/\bcopy\b/gi, ' ')
        .replace(/\(\d+\)/g, ' ')
        .replace(/\bvo\d*\b/gi, ' ')
        .replace(/\boption\s*\d+\b/gi, ' ')
        .replace(/\b[a-z]\b$/i, ' ')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectQuoteNumber({ ref = '', fileName = '' } = {}) {
    const refMatch = normalizeText(ref).match(/(\d{4,6})[A-Za-z]*$/);
    if (refMatch) return refMatch[1];
    const fileMatch = normalizeText(fileName).match(/(?:^|[\s_-])Q[\s_-]*?(\d{4,6})/i) || normalizeText(fileName).match(/(\d{4,6})/);
    return fileMatch ? fileMatch[1] : '';
}

function detectGroupKey({ ref = '', fileName = '' } = {}) {
    const quoteNumber = detectQuoteNumber({ ref, fileName });
    if (quoteNumber) return `qt-${quoteNumber}`;
    return stripCopyMarkers(fileName).toLowerCase();
}

function cellText(cell) {
    if (cell === null || cell === undefined) return '';
    return normalizeText(cell);
}

function rowText(row = []) {
    return row.map(cellText).filter(Boolean);
}

function rowJoined(row = []) {
    return rowText(row).join(' | ');
}

function parseDateCell(cell) {
    if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
        const day = String(cell.getDate()).padStart(2, '0');
        const month = String(cell.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${cell.getFullYear()}`;
    }
    const text = cellText(cell);
    if (!text) return '';
    const direct = text.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
    return direct ? direct[1].replace(/\//g, '.').replace(/-/g, '.') : '';
}

function parseMaybeNumber(cell) {
    const text = cellText(cell);
    if (!text) return '';
    const value = normalizeNumber(text, NaN);
    return Number.isFinite(value) ? value : '';
}

function buildSearchText(record = {}) {
    const sectionText = (record.sections || [])
        .flatMap((section) => [section.name, ...(section.items || []).map((item) => item.description)])
        .filter(Boolean)
        .join('\n');
    return [
        record.title,
        record.customer_name,
        record.contact_name,
        record.ref,
        record.quote_date,
        sectionText,
        ...(record.exclusions || []),
        ...(record.terms || []),
        ...(record.payment_terms || []),
    ].filter(Boolean).join('\n');
}

function normalizeSection(section = {}) {
    return {
        name: normalizeText(section.name),
        selling_rule: normalizeText(section.selling_rule || '0.70') || '0.70',
        section_total: normalizeNumber(section.section_total, 0),
        items: Array.isArray(section.items)
            ? section.items.map((item) => ({
                description: normalizeText(item.description),
                qty: item.qty === '' ? '' : normalizeNumber(item.qty, 0),
                unit: normalizeText(item.unit),
                costs_bhd: item.costs_bhd === '' ? '' : normalizeNumber(item.costs_bhd, 0),
                rate: item.rate === '' ? '' : normalizeNumber(item.rate, 0),
            })).filter((item) => item.description)
            : [],
    };
}

function normalizeLibraryRecord(record = {}) {
    const normalized = {
        source_key: normalizeText(record.source_key),
        source_type: normalizeText(record.source_type || 'historical'),
        source_id: normalizeText(record.source_id),
        group_key: normalizeText(record.group_key),
        source_path: normalizeText(record.source_path),
        source_label: normalizeText(record.source_label),
        quote_number: normalizeText(record.quote_number),
        ref: normalizeText(record.ref),
        quote_date: normalizeText(record.quote_date),
        modified_at: record.modified_at || null,
        updated_at: record.updated_at || new Date().toISOString(),
        title: normalizeText(record.title),
        customer_name: normalizeText(record.customer_name),
        contact_name: normalizeText(record.contact_name),
        currency_code: normalizeCurrencyCode(record.currency_code),
        status: normalizeText(record.status || ''),
        total_value: normalizeNumber(record.total_value, 0),
        sections: Array.isArray(record.sections) ? record.sections.map(normalizeSection) : [],
        exclusions: Array.isArray(record.exclusions) ? record.exclusions.map((item) => normalizeText(item)).filter(Boolean) : [],
        terms: Array.isArray(record.terms) ? record.terms.map((item) => normalizeText(item)).filter(Boolean) : [],
        payment_terms: Array.isArray(record.payment_terms) ? record.payment_terms.map((item) => normalizeText(item)).filter(Boolean) : [],
        provenance: record.provenance && typeof record.provenance === 'object' ? record.provenance : {},
    };
    normalized.search_text = normalizeText(record.search_text || buildSearchText(normalized));
    return normalized;
}

function pickPrimaryVariant(records = []) {
    return [...records].sort((left, right) => {
        const leftCompleteness = (left.sections || []).reduce((sum, section) => sum + (section.items || []).length, 0)
            + (left.exclusions || []).length + (left.terms || []).length + (left.payment_terms || []).length;
        const rightCompleteness = (right.sections || []).reduce((sum, section) => sum + (section.items || []).length, 0)
            + (right.exclusions || []).length + (right.terms || []).length + (right.payment_terms || []).length;
        if (rightCompleteness !== leftCompleteness) return rightCompleteness - leftCompleteness;
        return new Date(right.modified_at || 0).getTime() - new Date(left.modified_at || 0).getTime();
    })[0] || null;
}

function isScopeHeaderRow(row = []) {
    const joined = rowJoined(row);
    return /scope of works/i.test(joined) && /(qty|quantity)/i.test(joined);
}

function isSectionRow(row = []) {
    const first = cellText(row[0]);
    const second = cellText(row[1]);
    if (!/^[A-Z]$/.test(first)) return false;
    if (!second) return false;
    return !/scope of works/i.test(second);
}

function isTerminationMarker(row = []) {
    return /^(exclusions|terms\s*&\s*conditions|terms\s*&\s*conditions of contract|payment terms)/i.test(cellText(row[0]))
        || /^(exclusions|terms\s*&\s*conditions|terms\s*&\s*conditions of contract|payment terms)/i.test(cellText(row[1]));
}

function extractListBlock(rows, startIndex, markerPatterns = []) {
    if (startIndex < 0) return [];
    const items = [];
    for (let index = startIndex + 1; index < rows.length; index += 1) {
        const joined = rowJoined(rows[index]);
        if (!joined) continue;
        if (markerPatterns.some((pattern) => pattern.test(joined))) break;
        if (/^applicable to:?$/i.test(joined)) continue;
        const clean = joined
            .replace(/^\d+\s*[.)-]?\s*/, '')
            .replace(/\|\s*Applicable to:.*$/i, '')
            .trim();
        if (clean) items.push(clean);
    }
    return items;
}

function flattenLegacyItemDescription(cells = []) {
    return [cellText(cells[1]), cellText(cells[2])].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function isLikelyLegacyItemRow(row = []) {
    const description = flattenLegacyItemDescription(row);
    if (!description) return false;
    const qty = parseMaybeNumber(row[3]);
    const unit = cellText(row[4]);
    const cost = parseMaybeNumber(row[5]);
    const rate = parseMaybeNumber(row[6]);
    const first = cellText(row[0]);
    if (/^No$/i.test(first)) return false;
    if (/^(fabricate|supply|install|design of|supply and install|fabricate, supply)/i.test(description) && !qty && !unit && !cost && !rate) {
        return false;
    }
    return Boolean(qty || unit || cost || rate || /^\d+$/.test(first));
}

function parseLegacySections(rows = []) {
    const sections = [];
    const scopeStart = rows.findIndex((row) => isScopeHeaderRow(row));
    if (scopeStart === -1) return sections;

    let currentSection = null;

    for (let index = scopeStart + 1; index < rows.length; index += 1) {
        const row = rows[index];
        const joined = rowJoined(row);
        if (!joined) continue;
        if (isTerminationMarker(row)) break;
        if (/^total cost/i.test(joined) || /^vat$/i.test(joined) || /total cost including vat/i.test(joined)) break;
        if (isScopeHeaderRow(row)) continue;

        if (isSectionRow(row)) {
            currentSection = {
                name: cellText(row[1]),
                selling_rule: '0.70',
                section_total: normalizeNumber(row[5] || row[8] || row[9], 0),
                items: [],
            };
            sections.push(currentSection);
            continue;
        }

        if (!currentSection) {
            currentSection = { name: 'Scope of Works', selling_rule: '0.70', section_total: 0, items: [] };
            sections.push(currentSection);
        }

        if (!isLikelyLegacyItemRow(row)) continue;

        currentSection.items.push({
            description: flattenLegacyItemDescription(row),
            qty: parseMaybeNumber(row[3]),
            unit: cellText(row[4]),
            costs_bhd: parseMaybeNumber(row[5]),
            rate: parseMaybeNumber(row[6]),
        });
    }

    return sections.filter((section) => section.name || (section.items || []).length);
}

function parseLegacyQuotationRows(rows = [], filePath = '', modifiedAt = null) {
    const refRow = rows.find((row) => rowText(row).some((cell) => /^Ref:/i.test(cell)));
    const refCell = refRow ? rowText(refRow).find((cell) => /^Ref:/i.test(cell)) : '';
    const ref = normalizeText(String(refCell || '').replace(/^Ref:\s*/i, ''));
    const scopeIndex = rows.findIndex((row) => isScopeHeaderRow(row));
    const metadataRows = rows.slice(refRow ? rows.indexOf(refRow) + 1 : 0, scopeIndex === -1 ? Math.min(rows.length, 12) : scopeIndex);
    const metadataLines = metadataRows
        .map((row) => rowText(row))
        .filter((cells) => cells.length > 0)
        .map((cells) => cells.join(' '))
        .filter((line) => !/^(event|venue|date|duration|dear sir|quotation)$/i.test(line))
        .filter((line) => !/^Ref:/i.test(line));

    const title = metadataLines[0] || stripCopyMarkers(path.basename(filePath));
    const contactName = metadataLines[1] || '';
    const customerName = metadataLines.find((line, index) => index >= 2 && /(\bW\.L\.L\b|\bCommittee\b|\bInstitute\b|\bUniversity\b|\bMotors\b|\bBank\b|\bGroup\b|\bEvents?\b|\bConsultants?\b|\bNetwork\b|\bHolding\b|\bHotel\b|\bBIBF\b)/i.test(line))
        || metadataLines[3]
        || metadataLines[2]
        || '';

    const exclusionsIndex = rows.findIndex((row) => /^EXCLUSIONS/i.test(rowJoined(row)));
    const termsIndex = rows.findIndex((row) => /^TERMS/i.test(rowJoined(row)));
    const paymentTermsIndex = rows.findIndex((row) => /^PAYMENT TERMS/i.test(rowJoined(row)));
    const sections = parseLegacySections(rows);
    const totalRow = rows.find((row) => /total cost including vat/i.test(rowJoined(row))) || rows.find((row) => /^total cost/i.test(rowJoined(row)));

    const record = normalizeLibraryRecord({
        source_key: '',
        source_type: 'historical',
        source_id: '',
        group_key: detectGroupKey({ ref, fileName: path.basename(filePath) }),
        source_path: filePath,
        source_label: path.basename(filePath),
        quote_number: detectQuoteNumber({ ref, fileName: path.basename(filePath) }),
        ref,
        quote_date: parseDateCell(refRow?.[0]) || '',
        modified_at: modifiedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        title,
        customer_name: customerName,
        contact_name: contactName,
        currency_code: 'BHD',
        status: 'Historical',
        total_value: normalizeNumber(totalRow?.[5] || totalRow?.[8] || totalRow?.[9] || 0, 0),
        sections,
        exclusions: extractListBlock(rows, exclusionsIndex, [/^TERMS/i, /^PAYMENT TERMS/i]),
        terms: extractListBlock(rows, termsIndex, [/^PAYMENT TERMS/i]),
        payment_terms: extractListBlock(rows, paymentTermsIndex, []),
        provenance: {
            primary_file: filePath,
            imported_from: DEFAULT_IMPORT_DIR,
        },
    });
    return record;
}

async function parseHistoricalQuotationFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const firstSheet = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
            header: 1,
            blankrows: false,
            raw: true,
            defval: '',
        });
        const stat = await fs.stat(filePath);
        return parseLegacyQuotationRows(rows, filePath, stat.mtime.toISOString());
    } catch (error) {
        return {
            error: error.message,
            filePath,
        };
    }
}

function buildSystemRecord(quotation = {}) {
    const sections = Array.isArray(quotation.sections)
        ? quotation.sections.map((section) => ({
            name: normalizeText(section.name),
            selling_rule: normalizeText(section.selling_rule || '0.70') || '0.70',
            section_total: normalizeNumber(section.section_selling || 0, 0),
            items: Array.isArray(section.items)
                ? section.items.map((item) => ({
                    description: normalizeText(item.description),
                    qty: item.qty === '' ? '' : normalizeNumber(item.qty, 0),
                    unit: normalizeText(item.unit),
                    costs_bhd: item.costs_bhd === '' ? '' : normalizeNumber(item.costs_bhd, 0),
                    rate: item.rate === '' ? '' : normalizeNumber(item.rate, 0),
                })).filter((item) => item.description)
                : [],
        }))
        : [];

    const record = normalizeLibraryRecord({
        source_key: `system:${quotation.id}`,
        source_type: 'system',
        source_id: String(quotation.id || ''),
        group_key: quotation.qt_number ? `qt-${quotation.qt_number}` : `system-${quotation.id}`,
        source_path: '',
        source_label: quotation.qt_number ? `QT-${quotation.qt_number}` : `Quotation ${quotation.id}`,
        quote_number: String(quotation.qt_number || ''),
        ref: normalizeText(quotation.ref),
        quote_date: normalizeText(quotation.date),
        modified_at: quotation.updated_at || quotation.confirmed_at || quotation.email_sent_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        title: normalizeText(quotation.project_title || quotation.subject || quotation.event_name || `QT-${quotation.qt_number || ''}`),
        customer_name: normalizeText(quotation.client_org),
        contact_name: normalizeText(quotation.client_to),
        currency_code: normalizeCurrencyCode(quotation.currency_code),
        status: normalizeText(quotation.status || 'Draft'),
        total_value: normalizeNumber(quotation.total_with_vat || quotation.total_selling || 0, 0),
        sections,
        exclusions: Array.isArray(quotation.exclusions) ? quotation.exclusions : [],
        terms: Array.isArray(quotation.terms) ? quotation.terms : [],
        payment_terms: Array.isArray(quotation.payment_terms) ? quotation.payment_terms : [],
        provenance: {
            quotation_id: quotation.id,
            source_type: quotation.source_type || 'manual',
            source_order_reference: quotation.source_order_reference || '',
        },
    });
    record.search_text = buildSearchText(record);
    return record;
}

async function getAllRecords() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM quotation_ai_library ORDER BY updated_at DESC');
        return result.rows.map((row) => normalizeLibraryRecord({
            source_key: row.source_key,
            source_type: row.source_type,
            source_id: row.source_id,
            group_key: row.group_key,
            source_path: row.source_path,
            source_label: row.source_label,
            quote_number: row.quote_number,
            ref: row.ref,
            quote_date: row.quote_date,
            modified_at: row.modified_at instanceof Date ? row.modified_at.toISOString() : row.modified_at,
            updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
            title: row.title,
            customer_name: row.customer_name,
            contact_name: row.contact_name,
            currency_code: row.currency_code,
            status: row.status,
            total_value: row.total_value,
            search_text: row.search_text,
            ...(row.payload || {}),
            provenance: row.provenance || {},
        }));
    }
    const state = await readJsonStore();
    return state.records.map(normalizeLibraryRecord);
}

async function getMeta() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query(`SELECT value FROM quotation_ai_library_meta WHERE key = 'state' LIMIT 1`);
        return result.rows[0]?.value || buildBlankState().meta;
    }
    const state = await readJsonStore();
    return state.meta || buildBlankState().meta;
}

async function setMeta(meta = {}) {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        await pool.query(
            `INSERT INTO quotation_ai_library_meta(key, value)
             VALUES ('state', $1::jsonb)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [JSON.stringify(meta)],
        );
        return;
    }
    const state = await readJsonStore();
    await writeJsonStore({ ...state, meta });
}

async function upsertRecords(records = []) {
    const normalized = records.map((record) => {
        const next = normalizeLibraryRecord(record);
        next.search_text = buildSearchText(next);
        return next;
    });

    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const record of normalized) {
                await client.query(
                    `INSERT INTO quotation_ai_library (
                        source_key, source_type, source_id, group_key, source_path, source_label, quote_number, ref, quote_date,
                        modified_at, updated_at, title, customer_name, contact_name, currency_code, status, total_value, search_text,
                        payload, provenance
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9,
                        $10, $11, $12, $13, $14, $15, $16, $17, $18,
                        $19::jsonb, $20::jsonb
                    )
                    ON CONFLICT (source_key) DO UPDATE SET
                        source_type = EXCLUDED.source_type,
                        source_id = EXCLUDED.source_id,
                        group_key = EXCLUDED.group_key,
                        source_path = EXCLUDED.source_path,
                        source_label = EXCLUDED.source_label,
                        quote_number = EXCLUDED.quote_number,
                        ref = EXCLUDED.ref,
                        quote_date = EXCLUDED.quote_date,
                        modified_at = EXCLUDED.modified_at,
                        updated_at = EXCLUDED.updated_at,
                        title = EXCLUDED.title,
                        customer_name = EXCLUDED.customer_name,
                        contact_name = EXCLUDED.contact_name,
                        currency_code = EXCLUDED.currency_code,
                        status = EXCLUDED.status,
                        total_value = EXCLUDED.total_value,
                        search_text = EXCLUDED.search_text,
                        payload = EXCLUDED.payload,
                        provenance = EXCLUDED.provenance`,
                    [
                        record.source_key,
                        record.source_type,
                        record.source_id,
                        record.group_key,
                        record.source_path,
                        record.source_label,
                        record.quote_number,
                        record.ref,
                        record.quote_date,
                        record.modified_at || null,
                        record.updated_at,
                        record.title,
                        record.customer_name,
                        record.contact_name,
                        record.currency_code,
                        record.status,
                        record.total_value,
                        record.search_text,
                        JSON.stringify({
                            sections: record.sections,
                            exclusions: record.exclusions,
                            terms: record.terms,
                            payment_terms: record.payment_terms,
                        }),
                        JSON.stringify(record.provenance || {}),
                    ],
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        return;
    }

    const state = await readJsonStore();
    const map = new Map(state.records.map((record) => [record.source_key, normalizeLibraryRecord(record)]));
    normalized.forEach((record) => {
        map.set(record.source_key, record);
    });
    await writeJsonStore({
        ...state,
        records: [...map.values()].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()),
    });
}

async function removeRecord(sourceKey) {
    if (!sourceKey) return;
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        await pool.query('DELETE FROM quotation_ai_library WHERE source_key = $1', [sourceKey]);
        return;
    }
    const state = await readJsonStore();
    await writeJsonStore({
        ...state,
        records: state.records.filter((record) => record.source_key !== sourceKey),
    });
}

async function replaceHistoricalRecords(records = []) {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        await pool.query(`DELETE FROM quotation_ai_library WHERE source_type = 'historical'`);
    } else {
        const state = await readJsonStore();
        await writeJsonStore({
            ...state,
            records: state.records.filter((record) => record.source_type !== 'historical'),
        });
    }
    await upsertRecords(records);
}

function summarizeStats(records = [], meta = {}) {
    const historicalRecords = records.filter((record) => record.source_type === 'historical');
    const systemRecords = records.filter((record) => record.source_type === 'system');
    return {
        total_records: records.length,
        historical_records: historicalRecords.length,
        system_records: systemRecords.length,
        confirmed_system_records: systemRecords.filter((record) => record.status === 'Confirmed').length,
        draft_system_records: systemRecords.filter((record) => record.status === 'Draft').length,
        last_updated_at: records[0]?.updated_at || meta.updated_at || null,
        historical_imported_at: meta.historical_imported_at || null,
        historical_source_dir: meta.historical_source_dir || DEFAULT_IMPORT_DIR,
    };
}

function buildQueryText({ quotation = {}, brief = '', kind = '' } = {}) {
    const sectionText = (quotation.sections || [])
        .flatMap((section) => [section.name, ...(section.items || []).map((item) => item.description)])
        .filter(Boolean)
        .join('\n');
    return [
        kind,
        brief,
        quotation.project_title,
        quotation.subject,
        quotation.client_org,
        quotation.client_to,
        sectionText,
    ].filter(Boolean).join('\n');
}

function scoreLibraryRecord(queryTokens = [], queryText = '', record = {}) {
    let score = 0;
    const comparableHaystack = normalizeComparableText(record.search_text || '');
    const haystack = ` ${comparableHaystack} `;
    queryTokens.forEach((token) => {
        if (haystack.includes(` ${token} `)) score += 4;
        else if (haystack.includes(token)) score += 2;
    });

    const query = normalizeComparableText(queryText);
    const reasons = [];
    if (record.customer_name && query.includes(normalizeComparableText(record.customer_name))) {
        score += 14;
        reasons.push('customer');
    }
    if (record.title && query.includes(normalizeComparableText(record.title))) {
        score += 16;
        reasons.push('title');
    }
    if (record.ref && query.includes(normalizeComparableText(record.ref))) {
        score += 12;
        reasons.push('reference');
    }

    const phraseScore = scorePhraseOverlap(queryText, record.search_text || '');
    if (phraseScore > 0) {
        score += phraseScore;
        reasons.push('scope phrasing');
    }

    if (record.source_type === 'system' && record.status === 'Confirmed') score += 20;
    else if (record.source_type === 'system') score += 12;
    else score += 7;

    const itemCount = (record.sections || []).reduce((sum, section) => sum + (section.items || []).length, 0);
    score += Math.min(itemCount, 8);

    const recency = new Date(record.modified_at || record.updated_at || 0).getTime();
    if (Number.isFinite(recency) && recency > 0) {
        const ageDays = Math.max(0, (Date.now() - recency) / 86400000);
        score += Math.max(0, 10 - Math.floor(ageDays / 45));
    }

    score += computeRecordQualityScore(record);

    return {
        score,
        reasons,
    };
}

export function buildLearningPatternsFromMatches(matches = []) {
    const sectionCounts = new Map();
    const unitCounts = new Map();
    const exclusionCounts = new Map();
    const termCounts = new Map();
    const paymentCounts = new Map();
    const sellingRuleCounts = new Map();

    const collect = (map, value, amount = 1) => {
        const key = normalizeText(value);
        if (!key) return;
        map.set(key, (map.get(key) || 0) + amount);
    };

    matches.forEach((match, index) => {
        const weight = Math.max(1, 6 - index);
        (match.sections || []).forEach((section) => {
            collect(sectionCounts, section.name, weight);
            collect(sellingRuleCounts, section.selling_rule || '0.70', weight);
            (section.items || []).forEach((item) => collect(unitCounts, item.unit, weight));
        });
        (match.exclusions || []).slice(0, 8).forEach((item) => collect(exclusionCounts, item, weight));
        (match.terms || []).slice(0, 8).forEach((item) => collect(termCounts, item, weight));
        (match.payment_terms || []).slice(0, 8).forEach((item) => collect(paymentCounts, item, weight));
    });

    const topEntries = (map, limit = 5) =>
        [...map.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, limit)
            .map(([label, score]) => ({ label, score }));

    return {
        preferred_section_names: topEntries(sectionCounts),
        preferred_units: topEntries(unitCounts),
        recommended_exclusions: topEntries(exclusionCounts, 6),
        recommended_terms: topEntries(termCounts, 6),
        recommended_payment_terms: topEntries(paymentCounts, 4),
        recommended_selling_rules: topEntries(sellingRuleCounts, 3),
    };
}

export async function getQuotationAiLibraryStats() {
    const [records, meta] = await Promise.all([getAllRecords(), getMeta()]);
    return summarizeStats(records, meta);
}

export function getHistoricalQuotationImportDirectory() {
    return DEFAULT_IMPORT_DIR;
}

export async function importHistoricalQuotationLibrary({ directory = DEFAULT_IMPORT_DIR } = {}) {
    const fileEntries = await fs.readdir(directory, { withFileTypes: true });
    const candidateFiles = fileEntries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /^q/i.test(name) && /\.xls(x)?$/i.test(name))
        .filter((name) => !/client[_\s-]*data/i.test(name))
        .map((name) => path.join(directory, name));

    const parsed = await Promise.all(candidateFiles.map((filePath) => parseHistoricalQuotationFile(filePath)));
    const successes = parsed.filter((record) => record && !record.error);
    const grouped = successes.reduce((map, record) => {
        const groupKey = record.group_key || detectGroupKey({ ref: record.ref, fileName: path.basename(record.source_path || record.source_label) });
        const current = map.get(groupKey) || [];
        current.push(record);
        map.set(groupKey, current);
        return map;
    }, new Map());

    const records = [...grouped.entries()].map(([groupKey, variants]) => {
        const primary = pickPrimaryVariant(variants);
        const primaryFile = primary?.source_path || '';
        return normalizeLibraryRecord({
            ...primary,
            source_key: `historical:${groupKey}`,
            source_id: groupKey,
            group_key: groupKey,
            source_label: primaryFile ? path.basename(primaryFile) : primary?.source_label || groupKey,
            provenance: {
                ...(primary?.provenance || {}),
                primary_file: primaryFile,
                variant_files: variants.map((variant) => variant.source_path).filter(Boolean),
                variant_count: variants.length,
                imported_from: directory,
            },
        });
    });

    await replaceHistoricalRecords(records);
    const meta = {
        ...(await getMeta()),
        updated_at: new Date().toISOString(),
        historical_imported_at: new Date().toISOString(),
        historical_source_dir: directory,
    };
    await setMeta(meta);

    return {
        imported_records: records.length,
        parsed_files: successes.length,
        scanned_files: candidateFiles.length,
        skipped_files: parsed.length - successes.length,
        source_dir: directory,
    };
}

export async function syncSystemQuotationToAiLibrary(quotation) {
    if (!quotation?.id) return null;
    const record = buildSystemRecord(quotation);
    await upsertRecords([record]);
    const meta = {
        ...(await getMeta()),
        updated_at: new Date().toISOString(),
    };
    await setMeta(meta);
    return record;
}

export async function removeSystemQuotationFromAiLibrary(quotationId) {
    if (!quotationId) return;
    await removeRecord(`system:${quotationId}`);
    const meta = {
        ...(await getMeta()),
        updated_at: new Date().toISOString(),
    };
    await setMeta(meta);
}

export async function findRelevantQuotationLibraryRecords({ quotation = {}, brief = '', kind = 'draft', limit = 5 } = {}) {
    const queryText = buildQueryText({ quotation, brief, kind });
    const queryTokens = keywordTokens(queryText);
    const records = await getAllRecords();
    const scored = records
        .map((record) => {
            const scoredRecord = scoreLibraryRecord(queryTokens, queryText, record);
            return {
                ...record,
                lexical_score: scoredRecord.score,
                match_reasons: scoredRecord.reasons,
                quality_score: computeRecordQualityScore(record),
            };
        })
        .filter((record) => queryTokens.length === 0 ? true : record.lexical_score > 0)
        .sort((left, right) => right.lexical_score - left.lexical_score)
        .slice(0, Math.max(limit, 8));

    return {
        query_text: queryText,
        matches: scored,
    };
}

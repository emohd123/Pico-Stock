import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
    DEFAULT_CURRENCY_CODE,
    computeSellingFromInternal,
    defaultCommercialLists,
    normalizeCurrencyCode,
    normalizeSellingRule,
    QUOTATION_COMPANY_PROFILE,
} from '@/lib/quotationCommercial';

const DATA_DIR = path.join(process.cwd(), 'data');
const QUOTATIONS_FILE = path.join(DATA_DIR, 'quotations.json');
const META_FILE = path.join(DATA_DIR, 'quotation-meta.json');
const DEFAULT_NEXT_NUMBER = 11825;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_QUOTATION = 12;
const MAX_HISTORY_ENTRIES = 25;
const VALID_STATUSES = new Set(['Draft', 'Confirmed', 'Cancelled']);
const POSTGRES_ENABLED = Boolean(process.env.DATABASE_URL);
let pgPool = null;
let pgReadyPromise = null;

export class QuotationStoreError extends Error {
    constructor(message, status = 400, details = null) {
        super(message);
        this.name = 'QuotationStoreError';
        this.status = status;
        this.details = details;
    }
}

async function ensureStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    await Promise.all([
        ensureJsonFile(QUOTATIONS_FILE, []),
        ensureJsonFile(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER }),
    ]);
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
                await client.query('BEGIN');
                await client.query(`
                    CREATE TABLE IF NOT EXISTS quotation_meta (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                `);
                await client.query(`
                    CREATE TABLE IF NOT EXISTS quotations (
                        id TEXT PRIMARY KEY,
                        qt_number INTEGER NOT NULL UNIQUE,
                        customer_id TEXT NOT NULL DEFAULT '',
                        currency_code TEXT NOT NULL DEFAULT 'BHD',
                        date TEXT NOT NULL,
                        ref TEXT NOT NULL DEFAULT '',
                        project_title TEXT NOT NULL DEFAULT '',
                        client_to TEXT NOT NULL DEFAULT '',
                        client_org TEXT NOT NULL DEFAULT '',
                        client_location TEXT NOT NULL DEFAULT '',
                        client_trn TEXT NOT NULL DEFAULT '',
                        event_name TEXT NOT NULL DEFAULT '',
                        venue TEXT NOT NULL DEFAULT '',
                        event_date TEXT NOT NULL DEFAULT '',
                        created_by TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'Draft',
                        notes TEXT NOT NULL DEFAULT '',
                        sections JSONB NOT NULL DEFAULT '[]'::jsonb,
                        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
                        exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
                        terms JSONB NOT NULL DEFAULT '[]'::jsonb,
                        payment_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
                        company_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
                        vat_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
                        total_selling DOUBLE PRECISION NOT NULL DEFAULT 0,
                        total_with_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
                        history JSONB NOT NULL DEFAULT '[]'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                `);
                await client.query(
                    `ALTER TABLE quotations
                     ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'BHD'`,
                );
                await client.query(
                    `ALTER TABLE quotations
                     ADD COLUMN IF NOT EXISTS company_profile JSONB NOT NULL DEFAULT '{}'::jsonb`,
                );
                await client.query(
                    `INSERT INTO quotation_meta(key, value)
                     VALUES ('next_qt_number', $1)
                     ON CONFLICT (key) DO NOTHING`,
                    [String(DEFAULT_NEXT_NUMBER)],
                );

                const countResult = await client.query('SELECT COUNT(*)::int AS count FROM quotations');
                const quoteCount = Number(countResult.rows[0]?.count || 0);
                if (quoteCount === 0) {
                    const jsonQuotations = await readJson(QUOTATIONS_FILE, []);
                    const meta = await readJson(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER });
                    for (const rawQuotation of jsonQuotations) {
                        const quotation = normalizeQuotation(rawQuotation, rawQuotation);
                        await upsertQuotationRow(client, quotation);
                    }
                    await client.query(
                        `UPDATE quotation_meta
                         SET value = $1
                         WHERE key = 'next_qt_number'`,
                        [String(normalizeNumber(meta.next_qt_number, DEFAULT_NEXT_NUMBER))],
                    );
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        })();
    }
    await pgReadyPromise;
}

async function ensureJsonFile(filePath, initialValue) {
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, JSON.stringify(initialValue, null, 2), 'utf8');
    }
}

async function readJson(filePath, fallbackValue) {
    await ensureStore();
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function writeJson(filePath, value) {
    await ensureStore();
    const tempFilePath = `${filePath}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tempFilePath, filePath);
}

function formatDate(now = new Date()) {
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
}

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function fixMojibake(value) {
    const text = String(value || '');
    if (!text || !/[ÃØ]/.test(text)) return text;
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch {
        return text;
    }
}

function normalizeText(value) {
    return fixMojibake(String(value || '')).replace(/\r\n/g, '\n').trim();
}

function assert(condition, message, status = 400, details = null) {
    if (!condition) {
        throw new QuotationStoreError(message, status, details);
    }
}

function isValidDataUrl(value) {
    return /^data:[^;]+;base64,/i.test(String(value || ''));
}

function sanitizeList(value, fallbackValue) {
    if (Array.isArray(value) && value.length > 0) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    return [...fallbackValue];
}

function normalizeAttachment(attachment = {}) {
    const size = normalizeNumber(attachment.size, 0);
    return {
        id: attachment.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeText(attachment.name || 'Attachment'),
        type: String(attachment.type || 'application/octet-stream'),
        size,
        category: attachment.category === 'download' ? 'download' : 'internal',
        data: String(attachment.data || ''),
        uploaded_at: attachment.uploaded_at || new Date().toISOString(),
    };
}

function normalizeCompanyProfile(profile = {}, fallbackProfile = QUOTATION_COMPANY_PROFILE) {
    return {
        logoPath: normalizeText(profile.logoPath ?? fallbackProfile.logoPath ?? QUOTATION_COMPANY_PROFILE.logoPath),
        legalName: normalizeText(profile.legalName ?? fallbackProfile.legalName ?? QUOTATION_COMPANY_PROFILE.legalName),
        addressLines: Array.isArray(profile.addressLines)
            ? profile.addressLines.map(normalizeText).filter(Boolean)
            : [...(fallbackProfile.addressLines || QUOTATION_COMPANY_PROFILE.addressLines)],
        contactLines: Array.isArray(profile.contactLines)
            ? profile.contactLines.map(normalizeText).filter(Boolean)
            : [...(fallbackProfile.contactLines || QUOTATION_COMPANY_PROFILE.contactLines)],
        vatNumber: normalizeText(profile.vatNumber ?? fallbackProfile.vatNumber ?? QUOTATION_COMPANY_PROFILE.vatNumber),
    };
}

function normalizeSectionItem(item = {}) {
    return {
        description: normalizeText(item.description),
        image: item.image || null,
        qty: item.qty ?? '',
        unit: normalizeText(item.unit || 'nos') || 'nos',
        costs_bhd: item.costs_bhd ?? '',
        rate: item.rate ?? '',
        cost: normalizeNumber(item.cost, 0),
        price_reference_id: normalizeText(item.price_reference_id),
    };
}

export function getSectionSummary(section = {}) {
    const items = Array.isArray(section.items) ? section.items.map(normalizeSectionItem) : [normalizeSectionItem()];
    const internalSubtotal = items.reduce((sum, item) => sum + (normalizeNumber(item.qty, 0) * normalizeNumber(item.rate, 0)), 0);
    const lineClientTotal = items.reduce((sum, item) => sum + normalizeNumber(item.costs_bhd, 0), 0);
    const sellingRule = normalizeSellingRule(section.selling_rule);
    const derivedSelling = internalSubtotal > 0 ? computeSellingFromInternal(internalSubtotal, sellingRule) : lineClientTotal;
    const sectionCustomerTotal = normalizeNumber(section.section_selling, 0);
    const customerTotal = sectionCustomerTotal > 0 ? sectionCustomerTotal : lineClientTotal;

    return {
        internalSubtotal,
        lineClientTotal,
        sellingRule,
        derivedSelling,
        customerTotal,
    };
}

function normalizeSection(section = {}) {
    const items = Array.isArray(section.items) && section.items.length > 0
        ? section.items.map(normalizeSectionItem)
        : [normalizeSectionItem()];
    const sellingRule = normalizeSellingRule(section.selling_rule);
    const summary = getSectionSummary({ ...section, items, selling_rule: sellingRule });

    return {
        name: normalizeText(section.name),
        selling_rule: sellingRule,
        section_selling: normalizeNumber(section.section_selling, 0),
        items,
    };
}

function sanitizeHistoryEntry(entry = {}) {
    return {
        version: normalizeNumber(entry.version, 1),
        changed_at: entry.changed_at || new Date().toISOString(),
        changed_by: normalizeText(entry.changed_by),
        status: normalizeText(entry.status || 'Draft') || 'Draft',
        snapshot: entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {},
    };
}

function rowToQuotation(row) {
    if (!row) return null;
    return normalizeQuotation({
        ...row,
        sections: row.sections || [],
        attachments: row.attachments || [],
        exclusions: row.exclusions || [],
        terms: row.terms || [],
        payment_terms: row.payment_terms || [],
        company_profile: row.company_profile || {},
        history: row.history || [],
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }, {
        ...row,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    });
}

async function upsertQuotationRow(client, quotation) {
    await client.query(
        `INSERT INTO quotations (
            id, qt_number, customer_id, date, ref, project_title, client_to, client_org,
            client_location, client_trn, currency_code, event_name, venue, event_date, created_by, status, notes,
            sections, attachments, exclusions, terms, payment_terms, company_profile,
            vat_percent, total_selling, total_with_vat, history, created_at, updated_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,$14,$15,$16,$17,
            $18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb,
            $24,$25,$26,$27::jsonb,$28::timestamptz,$29::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
            qt_number = EXCLUDED.qt_number,
            customer_id = EXCLUDED.customer_id,
            date = EXCLUDED.date,
            ref = EXCLUDED.ref,
            project_title = EXCLUDED.project_title,
            client_to = EXCLUDED.client_to,
            client_org = EXCLUDED.client_org,
            client_location = EXCLUDED.client_location,
            client_trn = EXCLUDED.client_trn,
            currency_code = EXCLUDED.currency_code,
            event_name = EXCLUDED.event_name,
            venue = EXCLUDED.venue,
            event_date = EXCLUDED.event_date,
            created_by = EXCLUDED.created_by,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes,
            sections = EXCLUDED.sections,
            attachments = EXCLUDED.attachments,
            exclusions = EXCLUDED.exclusions,
            terms = EXCLUDED.terms,
            payment_terms = EXCLUDED.payment_terms,
            company_profile = EXCLUDED.company_profile,
            vat_percent = EXCLUDED.vat_percent,
            total_selling = EXCLUDED.total_selling,
            total_with_vat = EXCLUDED.total_with_vat,
            history = EXCLUDED.history,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at`,
        [
            quotation.id,
            quotation.qt_number,
            quotation.customer_id,
            quotation.date,
            quotation.ref,
            quotation.project_title,
            quotation.client_to,
            quotation.client_org,
            quotation.client_location,
            quotation.client_trn,
            quotation.currency_code,
            quotation.event_name,
            quotation.venue,
            quotation.event_date,
            quotation.created_by,
            quotation.status,
            quotation.notes,
            JSON.stringify(quotation.sections || []),
            JSON.stringify(quotation.attachments || []),
            JSON.stringify(quotation.exclusions || []),
            JSON.stringify(quotation.terms || []),
            JSON.stringify(quotation.payment_terms || []),
            JSON.stringify(quotation.company_profile || {}),
            quotation.vat_percent,
            quotation.total_selling,
            quotation.total_with_vat,
            JSON.stringify(quotation.history || []),
            quotation.created_at,
            quotation.updated_at,
        ],
    );
}

function validateQuotationPayload(payload = {}, { isUpdate = false } = {}) {
    const errors = [];
    const projectTitle = normalizeText(payload.project_title);
    const createdBy = normalizeText(payload.created_by);
    const status = normalizeText(payload.status || 'Draft') || 'Draft';
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

    if (!isUpdate || projectTitle || createdBy || sections.length > 0) {
        if (!projectTitle) errors.push('Project title is required.');
        if (!createdBy) errors.push('Created by is required.');
    }

    if (status && !VALID_STATUSES.has(status)) {
        errors.push('Status must be Draft, Confirmed, or Cancelled.');
    }

    if (attachments.length > MAX_ATTACHMENTS_PER_QUOTATION) {
        errors.push(`Maximum ${MAX_ATTACHMENTS_PER_QUOTATION} attachments are allowed per quotation.`);
    }

    attachments.forEach((attachment, index) => {
        const name = normalizeText(attachment?.name);
        const size = normalizeNumber(attachment?.size, 0);
        const data = String(attachment?.data || '');
        if (!name) errors.push(`Attachment ${index + 1} must have a file name.`);
        if (!data || !isValidDataUrl(data)) errors.push(`Attachment ${index + 1} has invalid file data.`);
        if (size <= 0 || size > MAX_ATTACHMENT_SIZE) {
            errors.push(`Attachment ${index + 1} must be smaller than ${Math.floor(MAX_ATTACHMENT_SIZE / (1024 * 1024))}MB.`);
        }
    });

    sections.forEach((section, sectionIndex) => {
        const items = Array.isArray(section?.items) ? section.items : [];
        if (items.length === 0) {
            errors.push(`Section ${sectionIndex + 1} must contain at least one item.`);
            return;
        }

        items.forEach((item, itemIndex) => {
            if (item?.image && !isValidDataUrl(item.image)) {
                errors.push(`Section ${sectionIndex + 1} item ${itemIndex + 1} has invalid image data.`);
            }
        });
    });

    if (errors.length > 0) {
        throw new QuotationStoreError('Quotation validation failed', 422, errors);
    }
}

function normalizeQuotation(payload = {}, existingQuotation = null, qtNumber = null) {
    const now = new Date();
    const defaults = defaultCommercialLists();
    const date = payload.date || existingQuotation?.date || formatDate(now);
    const resolvedQtNumber = qtNumber ?? existingQuotation?.qt_number ?? payload.qt_number ?? DEFAULT_NEXT_NUMBER;
    const sections = Array.isArray(payload.sections)
        ? payload.sections.map(normalizeSection)
        : (Array.isArray(existingQuotation?.sections) ? existingQuotation.sections.map(normalizeSection) : [normalizeSection()]);

    const sectionSummaries = sections.map(getSectionSummary);
    const totalSelling = payload.total_selling !== undefined
        ? normalizeNumber(payload.total_selling, 0)
        : sectionSummaries.reduce((sum, summary) => sum + summary.customerTotal, 0);
    const vatPercent = payload.vat_percent !== undefined
        ? normalizeNumber(payload.vat_percent, 10)
        : normalizeNumber(existingQuotation?.vat_percent, 10);
    const totalWithVat = payload.total_with_vat !== undefined
        ? normalizeNumber(payload.total_with_vat, 0)
        : totalSelling + (totalSelling * vatPercent / 100);
    const companyProfile = normalizeCompanyProfile(
        payload.company_profile || existingQuotation?.company_profile || {},
        existingQuotation?.company_profile || QUOTATION_COMPANY_PROFILE,
    );

    return {
        id: existingQuotation?.id ?? `qt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        qt_number: resolvedQtNumber,
        customer_id: normalizeText(payload.customer_id ?? existingQuotation?.customer_id ?? ''),
        currency_code: normalizeCurrencyCode(payload.currency_code ?? existingQuotation?.currency_code ?? DEFAULT_CURRENCY_CODE),
        date,
        ref: normalizeText(payload.ref ?? existingQuotation?.ref ?? ''),
        project_title: normalizeText(payload.project_title),
        client_to: normalizeText(payload.client_to ?? existingQuotation?.client_to ?? ''),
        client_org: normalizeText(payload.client_org ?? existingQuotation?.client_org ?? ''),
        client_location: normalizeText(payload.client_location ?? existingQuotation?.client_location ?? ''),
        client_trn: normalizeText(payload.client_trn ?? existingQuotation?.client_trn ?? ''),
        event_name: normalizeText(payload.event_name),
        venue: normalizeText(payload.venue),
        event_date: normalizeText(payload.event_date),
        created_by: normalizeText(payload.created_by),
        status: normalizeText(payload.status || existingQuotation?.status || 'Draft') || 'Draft',
        notes: normalizeText(payload.notes),
        sections,
        attachments: Array.isArray(payload.attachments)
            ? payload.attachments.map(normalizeAttachment)
            : (Array.isArray(existingQuotation?.attachments) ? existingQuotation.attachments.map(normalizeAttachment) : []),
        exclusions: sanitizeList(payload.exclusions, existingQuotation?.exclusions || defaults.exclusions),
        terms: sanitizeList(payload.terms, existingQuotation?.terms || defaults.terms),
        payment_terms: sanitizeList(payload.payment_terms, existingQuotation?.payment_terms || defaults.payment_terms),
        company_profile: companyProfile,
        vat_percent: vatPercent,
        total_selling: totalSelling,
        total_with_vat: totalWithVat,
        history: Array.isArray(payload.history)
            ? payload.history.map(sanitizeHistoryEntry).slice(-MAX_HISTORY_ENTRIES)
            : (Array.isArray(existingQuotation?.history) ? existingQuotation.history.map(sanitizeHistoryEntry).slice(-MAX_HISTORY_ENTRIES) : []),
        created_at: existingQuotation?.created_at || now.toISOString(),
        updated_at: now.toISOString(),
    };
}

function buildHistorySnapshot(quotation) {
    return {
        qt_number: quotation.qt_number,
        date: quotation.date,
        ref: quotation.ref,
        project_title: quotation.project_title,
        customer_id: quotation.customer_id,
        currency_code: quotation.currency_code,
        client_to: quotation.client_to,
        client_org: quotation.client_org,
        client_location: quotation.client_location,
        client_trn: quotation.client_trn,
        created_by: quotation.created_by,
        status: quotation.status,
        notes: quotation.notes,
        sections: quotation.sections,
        attachments: quotation.attachments,
        exclusions: quotation.exclusions,
        terms: quotation.terms,
        payment_terms: quotation.payment_terms,
        company_profile: quotation.company_profile,
        vat_percent: quotation.vat_percent,
        total_selling: quotation.total_selling,
        total_with_vat: quotation.total_with_vat,
        updated_at: quotation.updated_at,
    };
}

function appendHistoryEntry(quotation, previousQuotation = null) {
    const previousHistory = Array.isArray(previousQuotation?.history) ? previousQuotation.history.map(sanitizeHistoryEntry) : [];
    const version = previousHistory.length > 0
        ? previousHistory[previousHistory.length - 1].version + 1
        : 1;

    const nextEntry = {
        version,
        changed_at: quotation.updated_at,
        changed_by: quotation.created_by,
        status: quotation.status,
        snapshot: buildHistorySnapshot(quotation),
    };

    return {
        ...quotation,
        history: [...previousHistory, nextEntry].slice(-MAX_HISTORY_ENTRIES),
    };
}

function summarizeQuotationForList(quotation) {
    return {
        ...quotation,
        sections: (quotation.sections || []).map((section) => ({
            ...section,
            items: (section.items || []).map((item) => ({
                ...item,
                image: item.image ? '[attached-image]' : null,
            })),
        })),
        attachments: (quotation.attachments || []).map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            category: attachment.category,
            uploaded_at: attachment.uploaded_at,
        })),
        history: undefined,
        version_count: Array.isArray(quotation.history) ? quotation.history.length : 0,
    };
}

function summarizeQuotationForReport(quotation) {
    return {
        id: quotation.id,
        qt_number: quotation.qt_number,
        date: quotation.date,
        ref: quotation.ref,
        project_title: quotation.project_title,
        client_to: quotation.client_to,
        client_org: quotation.client_org,
        created_by: quotation.created_by,
        status: quotation.status,
        currency_code: quotation.currency_code,
        total_with_vat: quotation.total_with_vat,
        updated_at: quotation.updated_at,
    };
}

export async function getQuotations({ search = '', status = '' } = {}) {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const needle = String(search).trim().toLowerCase();
        const result = await pool.query(
            `SELECT * FROM quotations
             WHERE ($1 = '' OR (
                LOWER(project_title) LIKE $3 OR
                LOWER(client_org) LIKE $3 OR
                LOWER(client_to) LIKE $3 OR
                LOWER(created_by) LIKE $3 OR
                LOWER(ref) LIKE $3 OR
                LOWER(event_name) LIKE $3 OR
                CAST(qt_number AS TEXT) LIKE $3
             ))
             AND ($2 = '' OR status = $2)
             ORDER BY qt_number DESC`,
            [needle, String(status || ''), `%${needle}%`],
        );
        return result.rows.map(rowToQuotation).map(summarizeQuotationForList);
    }
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const searchValue = String(search).trim().toLowerCase();

    return quotations
        .map((quotation) => normalizeQuotation(quotation, quotation))
        .filter((quotation) => {
            const matchesSearch = !searchValue || [
                quotation.project_title,
                quotation.client_org,
                quotation.client_to,
                quotation.created_by,
                quotation.ref,
                quotation.event_name,
                String(quotation.qt_number || ''),
            ].some((value) => String(value || '').toLowerCase().includes(searchValue));

            const matchesStatus = !status || quotation.status === status;
            return matchesSearch && matchesStatus;
        })
        .map(summarizeQuotationForList)
        .sort((left, right) => Number(right.qt_number || 0) - Number(left.qt_number || 0));
}

export async function getQuotationReportSource() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query(
            `SELECT id, qt_number, date, ref, project_title, client_to, client_org, created_by, status, currency_code, total_with_vat, updated_at
             FROM quotations
             ORDER BY qt_number DESC`,
        );
        return result.rows.map((row) => summarizeQuotationForReport(rowToQuotation(row)));
    }

    const quotations = await readJson(QUOTATIONS_FILE, []);
    return quotations
        .map((quotation) => normalizeQuotation(quotation, quotation))
        .map(summarizeQuotationForReport)
        .sort((left, right) => Number(right.qt_number || 0) - Number(left.qt_number || 0));
}

export async function getQuotationById(id) {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM quotations WHERE id = $1 LIMIT 1', [String(id)]);
        return result.rows[0] ? rowToQuotation(result.rows[0]) : null;
    }
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const match = quotations.find((quotation) => String(quotation.id) === String(id));
    return match ? normalizeQuotation(match, match) : null;
}

export async function getQuotationHistory(id) {
    const quotation = await getQuotationById(id);
    if (!quotation) {
        return null;
    }

    return (quotation.history || []).map(sanitizeHistoryEntry).sort((left, right) => right.version - left.version);
}

export async function getNextQuotationNumber() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query(`SELECT value FROM quotation_meta WHERE key = 'next_qt_number' LIMIT 1`);
        return normalizeNumber(result.rows[0]?.value, DEFAULT_NEXT_NUMBER);
    }
    const meta = await readJson(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER });
    return normalizeNumber(meta.next_qt_number, DEFAULT_NEXT_NUMBER);
}

async function reserveNextQuotationNumber() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `SELECT value FROM quotation_meta WHERE key = 'next_qt_number' LIMIT 1 FOR UPDATE`,
            );
            const nextNumber = normalizeNumber(result.rows[0]?.value, DEFAULT_NEXT_NUMBER);
            await client.query(
                `UPDATE quotation_meta SET value = $1 WHERE key = 'next_qt_number'`,
                [String(nextNumber + 1)],
            );
            await client.query('COMMIT');
            return nextNumber;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    const meta = await readJson(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER });
    const nextNumber = normalizeNumber(meta.next_qt_number, DEFAULT_NEXT_NUMBER);
    meta.next_qt_number = nextNumber + 1;
    await writeJson(META_FILE, meta);
    return nextNumber;
}

export async function createQuotation(payload) {
    validateQuotationPayload(payload);
    const qtNumber = await reserveNextQuotationNumber();
    const quotation = appendHistoryEntry(normalizeQuotation(payload, null, qtNumber));
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await upsertQuotationRow(client, quotation);
            return quotation;
        } finally {
            client.release();
        }
    }
    const quotations = await readJson(QUOTATIONS_FILE, []);
    quotations.push(quotation);
    await writeJson(QUOTATIONS_FILE, quotations);
    return quotation;
}

export async function updateQuotation(id, payload) {
    validateQuotationPayload(payload, { isUpdate: true });
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            const existingResult = await client.query('SELECT * FROM quotations WHERE id = $1 LIMIT 1', [String(id)]);
            if (existingResult.rowCount === 0) {
                return null;
            }
            const existingQuotation = rowToQuotation(existingResult.rows[0]);
            const updatedQuotation = appendHistoryEntry(normalizeQuotation(payload, existingQuotation), existingQuotation);
            await upsertQuotationRow(client, updatedQuotation);
            return updatedQuotation;
        } finally {
            client.release();
        }
    }
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const index = quotations.findIndex((quotation) => String(quotation.id) === String(id));

    if (index === -1) {
        return null;
    }

    const updatedQuotation = appendHistoryEntry(normalizeQuotation(payload, quotations[index]), quotations[index]);
    quotations[index] = updatedQuotation;
    await writeJson(QUOTATIONS_FILE, quotations);
    return updatedQuotation;
}

export async function deleteQuotation(id) {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('DELETE FROM quotations WHERE id = $1', [String(id)]);
        return result.rowCount > 0;
    }
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const nextQuotations = quotations.filter((quotation) => String(quotation.id) !== String(id));

    if (nextQuotations.length === quotations.length) {
        return false;
    }

    await writeJson(QUOTATIONS_FILE, nextQuotations);
    return true;
}

export async function restoreQuotationVersion(id, version) {
    const quotation = await getQuotationById(id);
    if (!quotation) {
        return null;
    }

    const history = (quotation.history || []).map(sanitizeHistoryEntry);
    const targetEntry = history.find((entry) => Number(entry.version) === Number(version));
    if (!targetEntry?.snapshot) {
        throw new QuotationStoreError('Quotation version not found', 404);
    }

    const restoredPayload = {
        ...targetEntry.snapshot,
        id: quotation.id,
        qt_number: quotation.qt_number,
        created_at: quotation.created_at,
    };

    return updateQuotation(id, restoredPayload);
}

export async function duplicateQuotation(id) {
    const originalQuotation = await getQuotationById(id);
    if (!originalQuotation) {
        return null;
    }

    return createQuotation({
        ...originalQuotation,
        project_title: originalQuotation.project_title ? `${originalQuotation.project_title} (Copy)` : 'Untitled quotation (Copy)',
        ref: '',
        status: 'Draft',
        history: [],
    });
}

export function getQuotationSummary(quotation) {
    const sectionSummaries = (quotation.sections || []).map(getSectionSummary);
    const internalCost = sectionSummaries.reduce((sum, summary) => sum + summary.internalSubtotal, 0);
    const customerTotal = normalizeNumber(quotation.total_selling, sectionSummaries.reduce((sum, summary) => sum + summary.customerTotal, 0));
    const vatAmount = customerTotal * normalizeNumber(quotation.vat_percent, 10) / 100;
    const grandTotal = normalizeNumber(quotation.total_with_vat, customerTotal + vatAmount);

    return {
        internalCost,
        customerTotal,
        vatAmount,
        grandTotal,
    };
}

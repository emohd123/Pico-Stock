import { promises as fs } from 'fs';
import path from 'path';
import {
    computeSellingFromInternal,
    defaultCommercialLists,
    normalizeSellingRule,
} from '@/lib/quotationCommercial';

const DATA_DIR = path.join(process.cwd(), 'data');
const QUOTATIONS_FILE = path.join(DATA_DIR, 'quotations.json');
const META_FILE = path.join(DATA_DIR, 'quotation-meta.json');
const DEFAULT_NEXT_NUMBER = 11825;

async function ensureStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });

    await Promise.all([
        ensureJsonFile(QUOTATIONS_FILE, []),
        ensureJsonFile(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER }),
    ]);
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
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function formatDate(now = new Date()) {
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
}

function normalizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeList(value, fallbackValue) {
    if (Array.isArray(value) && value.length > 0) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    return [...fallbackValue];
}

function normalizeSectionItem(item = {}) {
    return {
        description: item.description || '',
        image: item.image || null,
        qty: item.qty ?? '',
        unit: item.unit || 'nos',
        costs_bhd: item.costs_bhd ?? '',
        rate: item.rate ?? '',
        cost: normalizeNumber(item.cost, 0),
        price_reference_id: item.price_reference_id || '',
    };
}

export function getSectionSummary(section = {}) {
    const items = Array.isArray(section.items) ? section.items.map(normalizeSectionItem) : [normalizeSectionItem()];
    const internalSubtotal = items.reduce((sum, item) => sum + (normalizeNumber(item.qty, 0) * normalizeNumber(item.rate, 0)), 0);
    const lineClientTotal = items.reduce((sum, item) => sum + normalizeNumber(item.costs_bhd, 0), 0);
    const sellingRule = normalizeSellingRule(section.selling_rule);
    const derivedSelling = internalSubtotal > 0 ? computeSellingFromInternal(internalSubtotal, sellingRule) : lineClientTotal;
    const sectionSelling = normalizeNumber(section.section_selling, 0);
    const customerTotal = sectionSelling > 0 ? sectionSelling : derivedSelling;

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
        name: section.name || '',
        selling_rule: sellingRule,
        section_selling: normalizeNumber(section.section_selling, summary.derivedSelling),
        items,
    };
}

function normalizeQuotation(payload = {}, existingQuotation = null, qtNumber = null) {
    const now = new Date();
    const defaults = defaultCommercialLists();
    const date = payload.date || existingQuotation?.date || formatDate(now);
    const parts = String(date).split('.');
    const month = parts[1] || String(now.getMonth() + 1).padStart(2, '0');
    const year = parts[2] || String(now.getFullYear());
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

    return {
        id: existingQuotation?.id ?? `qt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        qt_number: resolvedQtNumber,
        date,
        ref: payload.ref || existingQuotation?.ref || `Q/${year}/${month}/${resolvedQtNumber}`,
        project_title: payload.project_title || '',
        client_to: payload.client_to || '',
        client_org: payload.client_org || '',
        client_location: payload.client_location || '',
        event_name: payload.event_name || '',
        venue: payload.venue || '',
        event_date: payload.event_date || '',
        created_by: payload.created_by || '',
        status: payload.status || existingQuotation?.status || 'Draft',
        notes: payload.notes || '',
        sections,
        exclusions: sanitizeList(payload.exclusions, existingQuotation?.exclusions || defaults.exclusions),
        terms: sanitizeList(payload.terms, existingQuotation?.terms || defaults.terms),
        payment_terms: sanitizeList(payload.payment_terms, existingQuotation?.payment_terms || defaults.payment_terms),
        vat_percent: vatPercent,
        total_selling: totalSelling,
        total_with_vat: totalWithVat,
        created_at: existingQuotation?.created_at || now.toISOString(),
        updated_at: now.toISOString(),
    };
}

export async function getQuotations({ search = '', status = '' } = {}) {
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
        .sort((left, right) => Number(right.qt_number || 0) - Number(left.qt_number || 0));
}

export async function getQuotationById(id) {
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const match = quotations.find((quotation) => String(quotation.id) === String(id));
    return match ? normalizeQuotation(match, match) : null;
}

export async function getNextQuotationNumber() {
    const meta = await readJson(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER });
    return normalizeNumber(meta.next_qt_number, DEFAULT_NEXT_NUMBER);
}

async function reserveNextQuotationNumber() {
    const meta = await readJson(META_FILE, { next_qt_number: DEFAULT_NEXT_NUMBER });
    const nextNumber = normalizeNumber(meta.next_qt_number, DEFAULT_NEXT_NUMBER);
    meta.next_qt_number = nextNumber + 1;
    await writeJson(META_FILE, meta);
    return nextNumber;
}

export async function createQuotation(payload) {
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const qtNumber = await reserveNextQuotationNumber();
    const quotation = normalizeQuotation(payload, null, qtNumber);
    quotations.push(quotation);
    await writeJson(QUOTATIONS_FILE, quotations);
    return quotation;
}

export async function updateQuotation(id, payload) {
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const index = quotations.findIndex((quotation) => String(quotation.id) === String(id));

    if (index === -1) {
        return null;
    }

    const updatedQuotation = normalizeQuotation(payload, quotations[index]);
    quotations[index] = updatedQuotation;
    await writeJson(QUOTATIONS_FILE, quotations);
    return updatedQuotation;
}

export async function deleteQuotation(id) {
    const quotations = await readJson(QUOTATIONS_FILE, []);
    const nextQuotations = quotations.filter((quotation) => String(quotation.id) !== String(id));

    if (nextQuotations.length === quotations.length) {
        return false;
    }

    await writeJson(QUOTATIONS_FILE, nextQuotations);
    return true;
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

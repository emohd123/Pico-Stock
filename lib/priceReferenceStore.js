import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PRICE_REFERENCES_FILE = path.join(DATA_DIR, 'price-references.json');
const PRICE_REFERENCES_SEED_FILE = path.join(DATA_DIR, 'price-references.seed.json');

function parseJsonList(raw) {
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function readSeedReferences() {
    try {
        const raw = await fs.readFile(PRICE_REFERENCES_SEED_FILE, 'utf8');
        return parseJsonList(raw);
    } catch {
        return [];
    }
}

async function ensureStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(PRICE_REFERENCES_FILE);
    } catch {
        const seedReferences = await readSeedReferences();
        await fs.writeFile(PRICE_REFERENCES_FILE, JSON.stringify(seedReferences, null, 2), 'utf8');
    }
}

async function readReferences() {
    await ensureStore();
    try {
        const raw = await fs.readFile(PRICE_REFERENCES_FILE, 'utf8');
        const parsed = parseJsonList(raw);
        if (parsed.length > 0) {
            return parsed;
        }
    } catch {
        // Fall through to seed data.
    }

    return readSeedReferences();
}

async function writeReferences(value) {
    await ensureStore();
    await fs.writeFile(PRICE_REFERENCES_FILE, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeText(value, fallback = '') {
    return String(value ?? fallback).trim();
}

function normalizeNumber(value, fallback = 0) {
    if (value === '' || value === null || value === undefined) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableNumber(value, fallback = null) {
    if (value === '' || value === null || value === undefined) {
        return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReference(payload = {}, existingReference = null) {
    return {
        id: existingReference?.id || payload.id || `price-ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: normalizeText(payload.title, existingReference?.title),
        unit: normalizeText(payload.unit, existingReference?.unit || 'item') || 'item',
        reference_rate: normalizeNumber(payload.reference_rate, normalizeNumber(existingReference?.reference_rate, 0)),
        min_rate: normalizeNullableNumber(payload.min_rate, normalizeNullableNumber(existingReference?.min_rate, null)),
        max_rate: normalizeNullableNumber(payload.max_rate, normalizeNullableNumber(existingReference?.max_rate, null)),
        category: normalizeText(payload.category, existingReference?.category || 'General') || 'General',
        default_selling_rule: ['0.70', '0.75', 'none'].includes(payload.default_selling_rule)
            ? payload.default_selling_rule
            : (existingReference?.default_selling_rule || '0.70'),
        notes: normalizeText(payload.notes, existingReference?.notes),
        source: normalizeText(payload.source, existingReference?.source || 'Manual') || 'Manual',
        catalog_product_id: normalizeText(payload.catalog_product_id, existingReference?.catalog_product_id),
        updated_at: new Date().toISOString(),
        created_at: existingReference?.created_at || new Date().toISOString(),
    };
}

function byCategoryThenTitle(left, right) {
    const categoryCompare = String(left.category || 'General').localeCompare(String(right.category || 'General'));
    if (categoryCompare !== 0) {
        return categoryCompare;
    }

    return String(left.title || '').localeCompare(String(right.title || ''));
}

export async function getPriceReferences({ search = '' } = {}) {
    const references = await readReferences();
    const needle = String(search || '').trim().toLowerCase();

    return references
        .filter((reference) => {
            if (!needle) return true;

            return [
                reference.title,
                reference.category,
                reference.unit,
                reference.notes,
                reference.source,
                reference.catalog_product_id,
            ].some((value) => String(value || '').toLowerCase().includes(needle));
        })
        .sort(byCategoryThenTitle);
}

export async function getPriceReferenceById(id) {
    const references = await readReferences();
    return references.find((reference) => String(reference.id) === String(id)) || null;
}

export async function createPriceReference(payload) {
    const references = await readReferences();
    const reference = normalizeReference(payload);
    references.push(reference);
    references.sort(byCategoryThenTitle);
    await writeReferences(references);
    return reference;
}

export async function updatePriceReference(id, payload) {
    const references = await readReferences();
    const index = references.findIndex((reference) => String(reference.id) === String(id));

    if (index === -1) {
        return null;
    }

    const updatedReference = normalizeReference(payload, references[index]);
    references[index] = updatedReference;
    references.sort(byCategoryThenTitle);
    await writeReferences(references);
    return updatedReference;
}

export async function deletePriceReference(id) {
    const references = await readReferences();
    const nextReferences = references.filter((reference) => String(reference.id) !== String(id));

    if (nextReferences.length === references.length) {
        return false;
    }

    await writeReferences(nextReferences);
    return true;
}

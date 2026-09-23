/**
 * Event marketplace store.
 *
 * Persists the per-event marketplace configuration (which catalogue items are
 * showcased, event pricing, VAT, payment terms, status) and the client
 * requests submitted from the public event page.
 *
 * Storage follows the Grid Measure pattern: Supabase when configured, with a
 * local JSON file fallback for development. Tables are created by
 * supabase/migrations/20260916120000_event_marketplaces.sql.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeRequestTotals, DEFAULT_VAT_PERCENT, roundMoney } from './eventMarketplacePricing';

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'event-marketplaces.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'event-marketplace-requests.json');

const SUPABASE_ENABLED = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const PRODUCTION_READONLY_FALLBACK = process.env.VERCEL === '1' && !SUPABASE_ENABLED;
const SUPABASE_TIMEOUT_MS = Number(process.env.EVENT_MARKETPLACE_SUPABASE_TIMEOUT_MS || 8000);

export const EVENT_STATUSES = ['draft', 'open', 'closed'];
export const REQUEST_STATUSES = ['new', 'contacted', 'quoted', 'confirmed', 'declined'];

/**
 * Events the admin can manage. Each entry seeds the default configuration the
 * first time the event is opened; everything is editable afterwards.
 */
export const EVENT_MARKETPLACE_DEFAULTS = {
    'royal-bahrain-concours-2026': {
        id: 'royal-bahrain-concours-2026',
        name: 'ROYAL BAHRAIN CONCOURS 2026',
        tagline: 'Exhibitor extras for a two-day showcase of automotive excellence.',
        description: 'Browse the Pico rental catalogue prepared for the Royal Bahrain Concours 2026, see the price for the full two-day event, and send us your request. Our team confirms availability and sends the official quotation.',
        days: 2,
        startDate: '',
        endDate: '',
        venue: 'Bahrain',
        status: 'draft',
        currency: 'BHD',
        vatPercent: DEFAULT_VAT_PERCENT,
        referencePrefix: 'RBC26',
        paymentTerms: 'Prices cover the full two-day event including delivery, installation and collection at the venue. VAT is charged at 10%. Requests are confirmed by our team with an official Pico quotation; payment is due on confirmation unless agreed otherwise.',
        contactEmail: 'info@picobahrain.com',
        contactPhone: '+973 3635 7377',
        notifyEmail: '',
        heroImage: '',
        items: {},
        customItems: [],
    },
};

let supabaseClient = null;

export class EventMarketplaceStoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'EventMarketplaceStoreError';
        this.status = status;
    }
}

function normalizeText(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

function normalizeSlug(value) {
    return normalizeText(value, 100).toLowerCase();
}

function nowIso() {
    return new Date().toISOString();
}

function getSupabaseClient() {
    if (!SUPABASE_ENABLED) return null;
    if (!supabaseClient) {
        supabaseClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                auth: { persistSession: false, autoRefreshToken: false },
                // Keep Next's data cache away from Supabase reads so price and
                // stock edits show up on the event page straight away.
                global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
            },
        );
    }
    return supabaseClient;
}

function shouldUseJsonFallback() {
    return process.env.VERCEL !== '1';
}

async function withTimeout(promise, label) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Supabase ${label} timed out after ${SUPABASE_TIMEOUT_MS}ms`)), SUPABASE_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function ensureWritableStorage() {
    if (PRODUCTION_READONLY_FALLBACK) {
        throw new EventMarketplaceStoreError(
            'Production storage is not configured for event marketplaces. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY.',
            503,
        );
    }
}

// ─── JSON fallback ────────────────────────────────────────────────────────

async function readJsonFile(file) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return [];
    }
}

async function writeJsonFile(file, records) {
    ensureWritableStorage();
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempPath = `${file}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8');
    await fs.rename(tempPath, file);
}

// ─── Event config ─────────────────────────────────────────────────────────

function normalizeItemSettings(items) {
    const source = items && typeof items === 'object' && !Array.isArray(items) ? items : {};
    const next = {};
    for (const [productId, raw] of Object.entries(source)) {
        const id = normalizeText(productId, 120);
        if (!id || !raw || typeof raw !== 'object') continue;
        const priceRaw = raw.eventPrice;
        const hasPrice = priceRaw !== null && priceRaw !== undefined && priceRaw !== '' && Number.isFinite(Number(priceRaw));
        next[id] = {
            visible: raw.visible === true,
            eventPrice: hasPrice ? roundMoney(Math.max(0, Number(priceRaw))) : null,
            sortOrder: Number.parseInt(raw.sortOrder, 10) || 0,
            note: normalizeText(raw.note, 300),
        };
    }
    return next;
}

function normalizeCustomItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            id: normalizeText(item.id, 120) || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: normalizeText(item.name, 200),
            description: normalizeText(item.description, 1000),
            category: normalizeText(item.category, 60) || 'event',
            image: normalizeText(item.image, 1000),
            eventPrice: roundMoney(Math.max(0, Number(item.eventPrice) || 0)),
            visible: item.visible !== false,
            sortOrder: Number.parseInt(item.sortOrder, 10) || 0,
            note: normalizeText(item.note, 300),
        }))
        .filter((item) => item.name);
}

export function normalizeEventConfig(record = {}, existing = null) {
    const base = existing || EVENT_MARKETPLACE_DEFAULTS[normalizeSlug(record.id)] || {};
    const pick = (key, max) => (record[key] !== undefined ? normalizeText(record[key], max) : normalizeText(base[key], max));
    const days = Number.parseInt(record.days ?? base.days, 10);
    const vat = Number(record.vatPercent ?? base.vatPercent);
    const status = normalizeText(record.status ?? base.status, 20);

    return {
        id: normalizeSlug(record.id || base.id),
        name: pick('name', 200) || 'Event marketplace',
        tagline: pick('tagline', 300),
        description: pick('description', 3000),
        days: Number.isFinite(days) && days > 0 ? Math.min(days, 60) : 1,
        startDate: pick('startDate', 20),
        endDate: pick('endDate', 20),
        venue: pick('venue', 200),
        status: EVENT_STATUSES.includes(status) ? status : 'draft',
        currency: pick('currency', 10) || 'BHD',
        vatPercent: Number.isFinite(vat) && vat >= 0 ? Math.min(vat, 100) : DEFAULT_VAT_PERCENT,
        referencePrefix: (pick('referencePrefix', 12) || 'EVT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'EVT',
        paymentTerms: pick('paymentTerms', 3000),
        contactEmail: pick('contactEmail', 200),
        contactPhone: pick('contactPhone', 60),
        notifyEmail: pick('notifyEmail', 200),
        heroImage: pick('heroImage', 1000),
        items: record.items !== undefined ? normalizeItemSettings(record.items) : normalizeItemSettings(base.items),
        customItems: record.customItems !== undefined ? normalizeCustomItems(record.customItems) : normalizeCustomItems(base.customItems),
        createdAt: normalizeText(record.createdAt || base.createdAt || nowIso(), 40),
        updatedAt: normalizeText(record.updatedAt || base.updatedAt || nowIso(), 40),
    };
}

function eventRowToConfig(row) {
    const config = row.config && typeof row.config === 'object' ? row.config : {};
    return normalizeEventConfig({
        ...config,
        id: row.id,
        name: row.name,
        status: row.status,
        days: row.days,
        items: row.items,
        customItems: row.custom_items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }, EVENT_MARKETPLACE_DEFAULTS[row.id] || null);
}

function eventConfigToRow(config) {
    const { id, name, status, days, items, customItems, createdAt, updatedAt, ...rest } = config;
    return {
        id,
        name,
        status,
        days,
        config: rest,
        items,
        custom_items: customItems,
        created_at: createdAt,
        updated_at: updatedAt,
    };
}

export function isKnownEvent(slug) {
    return Boolean(EVENT_MARKETPLACE_DEFAULTS[normalizeSlug(slug)]);
}

async function readStoredEvent(slug) {
    const id = normalizeSlug(slug);
    if (!id) return null;

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('event_marketplaces').select('*').eq('id', id).maybeSingle(),
                'event marketplace get',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return data ? eventRowToConfig(data) : null;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(EVENTS_FILE);
    const found = records.find((item) => item?.id === id);
    return found ? normalizeEventConfig(found, EVENT_MARKETPLACE_DEFAULTS[id] || null) : null;
}

/**
 * Returns the event configuration. Known events fall back to their seeded
 * defaults until the admin saves them for the first time.
 */
export async function getEventMarketplace(slug) {
    const id = normalizeSlug(slug);
    const stored = await readStoredEvent(id);
    if (stored) return stored;
    const defaults = EVENT_MARKETPLACE_DEFAULTS[id];
    return defaults ? normalizeEventConfig({ ...defaults, id }, null) : null;
}

export async function saveEventMarketplace(slug, payload) {
    ensureWritableStorage();
    const id = normalizeSlug(slug);
    const current = await getEventMarketplace(id);
    if (!current) throw new EventMarketplaceStoreError('Unknown event', 404);

    const next = normalizeEventConfig(
        { ...payload, id, createdAt: current.createdAt, updatedAt: nowIso() },
        current,
    );

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { error } = await withTimeout(
                supabase.from('event_marketplaces').upsert(eventConfigToRow(next)),
                'event marketplace upsert',
            );
            if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
            return next;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(EVENTS_FILE);
    const others = records.filter((item) => item?.id !== id);
    await writeJsonFile(EVENTS_FILE, [next, ...others]);
    return next;
}

// ─── Requests ─────────────────────────────────────────────────────────────

function normalizeRequestItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .filter((item) => item && item.id)
        .map((item) => ({
            id: normalizeText(item.id, 120),
            source: item.source === 'custom' ? 'custom' : 'catalogue',
            name: normalizeText(item.name, 300),
            category: normalizeText(item.category, 60),
            image: normalizeText(item.image, 1000),
            eventPrice: roundMoney(Math.max(0, Number(item.eventPrice) || 0)),
            quantity: Math.max(1, Math.min(9999, Number.parseInt(item.quantity, 10) || 1)),
            comment: normalizeText(item.comment, 500),
        }))
        .map((item) => ({ ...item, lineTotal: roundMoney(item.eventPrice * item.quantity) }))
        .filter((item) => item.name);
}

function normalizeRequest(record = {}, existing = null) {
    const contactSource = record.contact && typeof record.contact === 'object'
        ? record.contact
        : (existing?.contact || {});
    const status = normalizeText(record.status ?? existing?.status ?? 'new', 20);
    return {
        id: normalizeText(record.id, 120) || existing?.id || `evreq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        eventId: normalizeSlug(record.eventId || existing?.eventId),
        reference: normalizeText(record.reference || existing?.reference, 40),
        company: normalizeText(record.company ?? existing?.company, 200),
        contact: {
            name: normalizeText(contactSource.name, 200),
            email: normalizeText(contactSource.email, 200),
            phone: normalizeText(contactSource.phone, 60),
            stand: normalizeText(contactSource.stand, 100),
            notes: normalizeText(contactSource.notes, 3000),
        },
        items: record.items !== undefined ? normalizeRequestItems(record.items) : (existing?.items || []),
        subtotal: roundMoney(record.subtotal ?? existing?.subtotal ?? 0),
        vatPercent: Number(record.vatPercent ?? existing?.vatPercent ?? DEFAULT_VAT_PERCENT),
        vatAmount: roundMoney(record.vatAmount ?? existing?.vatAmount ?? 0),
        total: roundMoney(record.total ?? existing?.total ?? 0),
        currency: normalizeText(record.currency || existing?.currency || 'BHD', 10),
        status: REQUEST_STATUSES.includes(status) ? status : 'new',
        adminNotes: normalizeText(record.adminNotes ?? existing?.adminNotes, 3000),
        createdAt: normalizeText(record.createdAt || existing?.createdAt || nowIso(), 40),
        updatedAt: normalizeText(record.updatedAt || nowIso(), 40),
    };
}

function requestRowToRecord(row) {
    return normalizeRequest({
        id: row.id,
        eventId: row.event_id,
        reference: row.reference,
        company: row.company,
        contact: row.contact,
        items: row.items,
        subtotal: row.subtotal,
        vatPercent: row.vat_percent,
        vatAmount: row.vat_amount,
        total: row.total,
        currency: row.currency,
        status: row.status,
        adminNotes: row.admin_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

function requestRecordToRow(record) {
    return {
        id: record.id,
        event_id: record.eventId,
        reference: record.reference,
        company: record.company,
        contact: record.contact,
        items: record.items,
        subtotal: record.subtotal,
        vat_percent: record.vatPercent,
        vat_amount: record.vatAmount,
        total: record.total,
        currency: record.currency,
        status: record.status,
        admin_notes: record.adminNotes,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
    };
}

function buildReference(prefix) {
    const now = new Date();
    const stamp = [
        String(now.getFullYear()).slice(-2),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('');
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${stamp}-${random}`;
}

export async function listEventRequests(slug) {
    const eventId = normalizeSlug(slug);
    if (!eventId) return [];

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('event_marketplace_requests').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
                'event request list',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return (data || []).map(requestRowToRecord);
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(REQUESTS_FILE);
    return records
        .filter((item) => item?.eventId === eventId)
        .map((item) => normalizeRequest(item, item))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function getEventRequestById(slug, id) {
    const eventId = normalizeSlug(slug);
    const requestId = normalizeText(id, 120);
    if (!eventId || !requestId) return null;

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('event_marketplace_requests').select('*').eq('event_id', eventId).eq('id', requestId).maybeSingle(),
                'event request get',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return data ? requestRowToRecord(data) : null;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(REQUESTS_FILE);
    const found = records.find((item) => item?.eventId === eventId && item?.id === requestId);
    return found ? normalizeRequest(found, found) : null;
}

async function persistRequest(record, { insert }) {
    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const query = insert
                ? supabase.from('event_marketplace_requests').insert(requestRecordToRow(record))
                : supabase.from('event_marketplace_requests').update(requestRecordToRow(record)).eq('id', record.id);
            const { error } = await withTimeout(query, insert ? 'event request insert' : 'event request update');
            if (error) throw new Error(`Supabase write failed: ${error.message}`);
            return record;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(REQUESTS_FILE);
    const next = insert
        ? [record, ...records.filter((item) => item?.id !== record.id)]
        : records.map((item) => (item?.id === record.id ? record : item));
    await writeJsonFile(REQUESTS_FILE, next);
    return record;
}

/**
 * Create a client request. `pricedItems` must already carry the resolved
 * event price for each line (the API resolves them against the live event
 * catalogue so clients cannot submit their own prices).
 */
export async function createEventRequest(slug, { company, contact, items }, config) {
    ensureWritableStorage();
    const eventId = normalizeSlug(slug);
    const normalizedItems = normalizeRequestItems(items);
    if (normalizedItems.length === 0) {
        throw new EventMarketplaceStoreError('Select at least one item before sending a request.', 400);
    }

    const totals = computeRequestTotals(normalizedItems, config);
    const record = normalizeRequest({
        eventId,
        reference: buildReference(config?.referencePrefix || 'EVT'),
        company,
        contact,
        items: totals.lines,
        subtotal: totals.subtotal,
        vatPercent: totals.vatPercent,
        vatAmount: totals.vatAmount,
        total: totals.total,
        currency: config?.currency || 'BHD',
        status: 'new',
        createdAt: nowIso(),
        updatedAt: nowIso(),
    });

    if (!record.company) throw new EventMarketplaceStoreError('Company name is required.', 400);
    if (!record.contact.name) throw new EventMarketplaceStoreError('Contact person is required.', 400);
    if (!record.contact.email && !record.contact.phone) {
        throw new EventMarketplaceStoreError('Provide an email address or a phone number so we can reach you.', 400);
    }

    return persistRequest(record, { insert: true });
}

export async function updateEventRequest(slug, id, updates) {
    ensureWritableStorage();
    const existing = await getEventRequestById(slug, id);
    if (!existing) return null;
    const allowed = {};
    if (updates.status !== undefined) allowed.status = updates.status;
    if (updates.adminNotes !== undefined) allowed.adminNotes = updates.adminNotes;
    const next = normalizeRequest({ ...allowed, id: existing.id, eventId: existing.eventId, updatedAt: nowIso() }, existing);
    return persistRequest(next, { insert: false });
}

export async function deleteEventRequest(slug, id) {
    ensureWritableStorage();
    const eventId = normalizeSlug(slug);
    const requestId = normalizeText(id, 120);
    if (!eventId || !requestId) return false;

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('event_marketplace_requests').delete().eq('event_id', eventId).eq('id', requestId).select('id'),
                'event request delete',
            );
            if (error) throw new Error(`Supabase delete failed: ${error.message}`);
            return Array.isArray(data) && data.length > 0;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
        }
    }

    const records = await readJsonFile(REQUESTS_FILE);
    const next = records.filter((item) => !(item?.eventId === eventId && item?.id === requestId));
    await writeJsonFile(REQUESTS_FILE, next);
    return next.length !== records.length;
}

export function getEventMarketplaceStorageStatus() {
    return {
        mode: SUPABASE_ENABLED ? 'supabase' : (PRODUCTION_READONLY_FALLBACK ? 'unconfigured' : 'json'),
        production_ready: SUPABASE_ENABLED || !PRODUCTION_READONLY_FALLBACK,
    };
}

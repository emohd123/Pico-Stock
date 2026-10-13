/**
 * Additional electricity order form (Form B).
 *
 * One configurable form (event details, power options with VAT-inclusive
 * prices, terms) that vendors fill in from a public link, and the orders they
 * submit. Orders reuse the event-order payment flow (see lib/eventPayments.js):
 * review → approved, bank details emailed → receipt sent → payment verified.
 *
 * Storage follows the event marketplace pattern: Supabase when configured,
 * a local JSON file fallback for development. Tables are created by
 * supabase/migrations/20261013120000_electricity_orders.sql.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { makeLinkKey, PAYMENT_STATUSES } from './eventMarketplaceStore';
import { roundMoney } from './eventMarketplacePricing';

const DATA_DIR = path.join(process.cwd(), 'data');
const FORMS_FILE = path.join(DATA_DIR, 'electricity-forms.json');
const ORDERS_FILE = path.join(DATA_DIR, 'electricity-orders.json');

const SUPABASE_ENABLED = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const PRODUCTION_READONLY_FALLBACK = process.env.VERCEL === '1' && !SUPABASE_ENABLED;
const SUPABASE_TIMEOUT_MS = 8000;

export const ELECTRICITY_FORM_ID = 'electricity';
export const FORM_STATUSES = ['draft', 'open', 'closed'];
export const ORDER_STATUSES = ['new', 'confirmed', 'declined'];
const MAX_QTY = 99;

export const ELECTRICITY_FORM_DEFAULTS = {
    id: ELECTRICITY_FORM_ID,
    status: 'draft',
    title: 'Additional Electricity Order Form',
    eventName: 'Bahrain Food Festival',
    eventDates: '',
    venue: 'Marassi, Bahrain',
    submitBy: '',
    referencePrefix: 'ELEC',
    currency: 'BHD',
    intro: 'Each vendor has (2) 13 amp double socket power points and general lighting. Order additional electricity below. Prices are for the duration of the event. Please contact us directly for any items not listed in the form.',
    items: [
        { id: 'p15-1ph', name: '15 amp single-phase power connection', price: 135, visible: true },
        { id: 'p30-3ph', name: '30 amp 3-phase power connection', price: 145, visible: true },
        { id: 'p60-3ph', name: '60 amp 3-phase power connection', price: 165, visible: true },
        // Price to be set by Pico before switching it on.
        { id: 's13-extra', name: 'Extra 13 amp double socket power point', price: 0, visible: false },
    ],
    terms: [
        'All items are on rental basis.',
        'We do not guarantee orders received after the deadline.',
        'All orders should be submitted before the deadline indicated, otherwise a 30% surcharge will apply. A surcharge of 50% applies for onsite orders.',
        'Prices include delivery, installation, rental and removal.',
        'Items cancelled will be charged 100% of the original price after move-in begins.',
    ].join('\n'),
    // New orders go to notifyTo with notifyCc copied; vendors send receipts to notifyTo.
    notifyTo: 'perri@picobahrain.com',
    notifyCc: 'ebrahim@picobahrain.com',
    contactPhone: '+973 3635 7377',
};

export class ElectricityStoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'ElectricityStoreError';
        this.status = status;
    }
}

function text(value, max = 2000) {
    return String(value ?? '').trim().slice(0, max);
}

function nowIso() {
    return new Date().toISOString();
}

let supabaseClient = null;
function db() {
    if (!SUPABASE_ENABLED) return null;
    if (!supabaseClient) {
        supabaseClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                auth: { persistSession: false, autoRefreshToken: false },
                global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
            },
        );
    }
    return supabaseClient;
}

async function query(promise, label) {
    let timer = null;
    try {
        const { data, error } = await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Supabase ${label} timed out`)), SUPABASE_TIMEOUT_MS);
            }),
        ]);
        if (error) throw new Error(`Supabase ${label} failed: ${error.message}`);
        return data;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function ensureWritable() {
    if (PRODUCTION_READONLY_FALLBACK) {
        throw new ElectricityStoreError('Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY.', 503);
    }
}

async function readJson(file) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        return [];
    }
}

async function writeJson(file, records) {
    ensureWritable();
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(records, null, 2), 'utf8');
    await fs.rename(`${file}.tmp`, file);
}

// ─── Form ─────────────────────────────────────────────────────────────────

function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    return items
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            let id = text(item.id, 60).replace(/[^a-zA-Z0-9-]/g, '') || `item-${Math.random().toString(36).slice(2, 8)}`;
            while (seen.has(id)) id = `${id}-x`;
            seen.add(id);
            return {
                id,
                name: text(item.name, 200),
                price: roundMoney(Math.max(0, Number(item.price) || 0)),
                visible: item.visible !== false,
            };
        })
        .filter((item) => item.name)
        .slice(0, 30);
}

export function normalizeForm(record = {}, base = ELECTRICITY_FORM_DEFAULTS) {
    const pick = (key, max) => text(record[key] !== undefined ? record[key] : base[key], max);
    const status = pick('status', 20);
    return {
        id: ELECTRICITY_FORM_ID,
        status: FORM_STATUSES.includes(status) ? status : 'draft',
        title: pick('title', 200) || ELECTRICITY_FORM_DEFAULTS.title,
        eventName: pick('eventName', 200),
        eventDates: pick('eventDates', 120),
        venue: pick('venue', 200),
        submitBy: pick('submitBy', 20),
        referencePrefix: (pick('referencePrefix', 10) || 'ELEC').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'ELEC',
        currency: pick('currency', 10) || 'BHD',
        intro: pick('intro', 2000),
        items: normalizeItems(record.items !== undefined ? record.items : base.items),
        terms: pick('terms', 4000),
        notifyTo: pick('notifyTo', 300),
        notifyCc: pick('notifyCc', 300),
        contactPhone: pick('contactPhone', 60),
        createdAt: text(record.createdAt || base.createdAt || nowIso(), 40),
        updatedAt: text(record.updatedAt || base.updatedAt || nowIso(), 40),
    };
}

export async function getElectricityForm() {
    if (SUPABASE_ENABLED) {
        const row = await query(db().from('electricity_forms').select('*').eq('id', ELECTRICITY_FORM_ID).maybeSingle(), 'form get');
        if (!row) return normalizeForm({});
        return normalizeForm({ ...(row.config || {}), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at });
    }
    const found = (await readJson(FORMS_FILE)).find((item) => item?.id === ELECTRICITY_FORM_ID);
    return normalizeForm(found || {});
}

export async function saveElectricityForm(payload) {
    ensureWritable();
    const current = await getElectricityForm();
    const next = normalizeForm({ ...payload, createdAt: current.createdAt, updatedAt: nowIso() }, current);
    if (SUPABASE_ENABLED) {
        const { id, status, createdAt, updatedAt, ...config } = next;
        await query(db().from('electricity_forms').upsert({ id, status, config, created_at: createdAt, updated_at: updatedAt }), 'form save');
        return next;
    }
    const others = (await readJson(FORMS_FILE)).filter((item) => item?.id !== ELECTRICITY_FORM_ID);
    await writeJson(FORMS_FILE, [next, ...others]);
    return next;
}

/** What vendors see: only the options that are switched on. */
export function publicForm(form) {
    const { notifyTo, notifyCc, createdAt, updatedAt, ...rest } = form;
    return { ...rest, items: form.items.filter((item) => item.visible), receiptEmail: notifyTo };
}

/**
 * Turn what the vendor asked for ([{ id, quantity }]) into priced lines, using
 * the live form so vendors can never set their own prices.
 */
export function resolveLines(form, requested) {
    const byId = new Map(form.items.filter((item) => item.visible).map((item) => [item.id, item]));
    const quantities = new Map();
    for (const line of Array.isArray(requested) ? requested : []) {
        const item = byId.get(text(line?.id, 60));
        const qty = Math.min(MAX_QTY, Math.max(0, Number.parseInt(line?.quantity, 10) || 0));
        if (item && qty > 0) quantities.set(item.id, Math.min(MAX_QTY, (quantities.get(item.id) || 0) + qty));
    }
    return [...quantities].map(([id, quantity]) => {
        const item = byId.get(id);
        return { id, name: item.name, price: item.price, quantity, lineTotal: roundMoney(item.price * quantity) };
    });
}

// ─── Orders ───────────────────────────────────────────────────────────────

const VENDOR_FIELDS = {
    company: 200, restaurantEn: 200, restaurantAr: 200, contactPerson: 200, designation: 120,
    tel: 60, fax: 60, mobile: 60, email: 200, crNo: 60, cprNo: 60, booth: 100, notes: 2000,
};

export function normalizeVendor(source = {}) {
    const vendor = {};
    for (const [key, max] of Object.entries(VENDOR_FIELDS)) vendor[key] = text(source?.[key], max);
    vendor.email = vendor.email.toLowerCase();
    return vendor;
}

export function validateVendor(vendor) {
    if (!vendor.company) return 'Company name is required.';
    if (!vendor.contactPerson) return 'Contact person is required.';
    if (!vendor.mobile) return 'Mobile number is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.email)) return 'A valid email address is required: we send the payment details there.';
    return '';
}

function normalizePayment(source = {}) {
    const status = text(source?.status || 'review', 20);
    return {
        status: PAYMENT_STATUSES.includes(status) ? status : 'review',
        proofPath: text(source?.proofPath, 300),
        proofName: text(source?.proofName, 200),
        proofType: text(source?.proofType, 60),
        uploadedAt: text(source?.uploadedAt, 40),
        approvedAt: text(source?.approvedAt, 40),
        verifiedAt: text(source?.verifiedAt, 40),
        note: text(source?.note, 500),
    };
}

function normalizeOrder(record = {}) {
    const status = text(record.status || 'new', 20);
    const items = (Array.isArray(record.items) ? record.items : []).map((item) => ({
        id: text(item.id, 60),
        name: text(item.name, 200),
        price: roundMoney(Number(item.price) || 0),
        quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        lineTotal: roundMoney(Number(item.lineTotal) || 0),
    }));
    const vendor = normalizeVendor(record.vendor);
    return {
        id: text(record.id, 80),
        formId: text(record.formId || ELECTRICITY_FORM_ID, 60),
        reference: text(record.reference, 40),
        orderKey: text(record.orderKey, 40),
        vendor,
        items,
        total: roundMoney(Number(record.total) || 0),
        currency: text(record.currency || 'BHD', 10),
        status: ORDER_STATUSES.includes(status) ? status : 'new',
        payment: normalizePayment(record.payment),
        adminNotes: text(record.adminNotes, 4000),
        createdAt: text(record.createdAt || nowIso(), 40),
        updatedAt: text(record.updatedAt || nowIso(), 40),
        // Shape the shared payment helpers and receipt storage expect.
        eventId: 'electricity',
        company: vendor.company,
        contact: { name: vendor.contactPerson, email: vendor.email, phone: vendor.mobile || vendor.tel },
    };
}

function rowToOrder(row) {
    return normalizeOrder({
        id: row.id, formId: row.form_id, reference: row.reference, orderKey: row.order_key,
        vendor: row.vendor, items: row.items, total: row.total, currency: row.currency,
        status: row.status, payment: row.payment, adminNotes: row.admin_notes,
        createdAt: row.created_at, updatedAt: row.updated_at,
    });
}

function orderToRow(order) {
    return {
        id: order.id, form_id: order.formId, reference: order.reference, order_key: order.orderKey,
        vendor: order.vendor, items: order.items, total: order.total, currency: order.currency,
        status: order.status, payment: order.payment, admin_notes: order.adminNotes,
        created_at: order.createdAt, updated_at: order.updatedAt,
    };
}

function buildReference(prefix) {
    const now = new Date();
    const stamp = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${makeLinkKey(4).toUpperCase()}`;
}

async function findOne(column, value, field) {
    if (SUPABASE_ENABLED) {
        const row = await query(db().from('electricity_orders').select('*').eq(column, value).maybeSingle(), `order by ${column}`);
        return row ? rowToOrder(row) : null;
    }
    const found = (await readJson(ORDERS_FILE)).find((item) => String(item?.[field] || '') === value);
    return found ? normalizeOrder(found) : null;
}

export async function listElectricityOrders() {
    if (SUPABASE_ENABLED) {
        const rows = await query(
            db().from('electricity_orders').select('*').eq('form_id', ELECTRICITY_FORM_ID).order('created_at', { ascending: false }),
            'order list',
        );
        return (rows || []).map(rowToOrder);
    }
    return (await readJson(ORDERS_FILE))
        .map(normalizeOrder)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getElectricityOrderById(id) {
    const value = text(id, 80);
    return value ? findOne('id', value, 'id') : Promise.resolve(null);
}

export function getElectricityOrderByKey(key) {
    const value = text(key, 40);
    return value.length >= 10 ? findOne('order_key', value, 'orderKey') : Promise.resolve(null);
}

export function getElectricityOrderByReference(reference) {
    const value = text(reference, 40).toUpperCase();
    return value ? findOne('reference', value, 'reference') : Promise.resolve(null);
}

async function persist(order, { insert }) {
    ensureWritable();
    if (SUPABASE_ENABLED) {
        const table = db().from('electricity_orders');
        await query(insert ? table.insert(orderToRow(order)) : table.update(orderToRow(order)).eq('id', order.id), insert ? 'order insert' : 'order update');
        return order;
    }
    const records = await readJson(ORDERS_FILE);
    const next = insert ? [order, ...records] : records.map((item) => (item?.id === order.id ? order : item));
    await writeJson(ORDERS_FILE, next);
    return order;
}

function totalOf(lines) {
    return roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
}

export async function createElectricityOrder(form, { vendor, lines }) {
    const cleanVendor = normalizeVendor(vendor);
    const problem = validateVendor(cleanVendor);
    if (problem) throw new ElectricityStoreError(problem);
    if (!lines.length) throw new ElectricityStoreError('Choose at least one power option (quantity 1 or more).');
    const order = normalizeOrder({
        id: `elec-${Date.now()}-${makeLinkKey(6)}`,
        reference: buildReference(form.referencePrefix),
        orderKey: makeLinkKey(12),
        vendor: cleanVendor,
        items: lines,
        total: totalOf(lines),
        currency: form.currency,
        status: 'new',
        payment: { status: 'review' },
    });
    return persist(order, { insert: true });
}

/** The vendor changes their own order (only while it is under review). */
export async function replaceElectricityOrder(existing, { vendor, lines }, note) {
    const cleanVendor = normalizeVendor(vendor);
    const problem = validateVendor(cleanVendor);
    if (problem) throw new ElectricityStoreError(problem);
    if (!lines.length) throw new ElectricityStoreError('Keep at least one power option in the order.');
    const payment = existing.payment.status === 'rejected' ? { status: 'awaiting' } : existing.payment;
    return persist(normalizeOrder({
        ...existing,
        vendor: cleanVendor,
        items: lines,
        total: totalOf(lines),
        payment,
        adminNotes: [existing.adminNotes, note].filter(Boolean).join('\n'),
        updatedAt: nowIso(),
    }), { insert: false });
}

/** Admin/payment updates: status, payment, notes (appendNote adds a log line). */
export async function updateElectricityOrder(existing, { status, payment, adminNotes, appendNote }) {
    const notes = adminNotes !== undefined ? adminNotes : existing.adminNotes;
    return persist(normalizeOrder({
        ...existing,
        status: status ?? existing.status,
        payment: payment ? { ...existing.payment, ...payment } : existing.payment,
        adminNotes: [notes, appendNote].filter(Boolean).join('\n'),
        updatedAt: nowIso(),
    }), { insert: false });
}

export async function deleteElectricityOrder(id) {
    ensureWritable();
    if (SUPABASE_ENABLED) {
        const rows = await query(db().from('electricity_orders').delete().eq('id', id).select('id'), 'order delete');
        return Array.isArray(rows) && rows.length > 0;
    }
    const records = await readJson(ORDERS_FILE);
    const next = records.filter((item) => item?.id !== id);
    await writeJson(ORDERS_FILE, next);
    return next.length !== records.length;
}

export function bahrainStamp() {
    return new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' });
}

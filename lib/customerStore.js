import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { getSupabaseClient } from '@/lib/supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SUPABASE_ENABLED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const DIRECT_DB_ENABLED = Boolean(process.env.DATABASE_URL);

let pgPool = null;
let ensureCustomersTablePromise = null;

async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(CUSTOMERS_FILE);
    } catch {
        await fs.writeFile(CUSTOMERS_FILE, '[]', 'utf8');
    }
}

async function readCustomersFile() {
    await ensureFile();
    try {
        const raw = await fs.readFile(CUSTOMERS_FILE, 'utf8');
        const sanitized = raw.replace(/^\uFEFF/, '');
        return JSON.parse(sanitized);
    } catch {
        return [];
    }
}

async function writeCustomersFile(customers) {
    await ensureFile();
    await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2), 'utf8');
}

function getPgPool() {
    if (!DIRECT_DB_ENABLED) return null;
    if (!pgPool) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pgPool;
}

async function directQuery(text, params = []) {
    const pool = getPgPool();
    if (!pool) {
        throw new Error('DATABASE_URL is not configured for direct customer storage');
    }
    return pool.query(text, params);
}

async function ensureCustomersTable() {
    if (!DIRECT_DB_ENABLED) return;
    if (!ensureCustomersTablePromise) {
        ensureCustomersTablePromise = directQuery(`
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL DEFAULT '',
                contact_to TEXT NOT NULL DEFAULT '',
                contact_title TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                trn TEXT NOT NULL DEFAULT '',
                registration_number TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                extra_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
                source TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            )
        `).catch((error) => {
            ensureCustomersTablePromise = null;
            throw error;
        });
    }
    await ensureCustomersTablePromise;
}

function shouldUseDatabase() {
    return DIRECT_DB_ENABLED || SUPABASE_ENABLED;
}

function isMissingCustomersTableError(error) {
    if (!error) return false;
    const code = String(error.code || error.status || '').toUpperCase();
    const message = String(error.message || '').toLowerCase();
    return code === '42P01' || code === 'PGRST205' || (message.includes('customers') && message.includes('does not exist'));
}

function normalizeExtraContacts(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((contact) => ({
            name: String(contact?.name || '').trim(),
            title: String(contact?.title || '').trim(),
            email: String(contact?.email || '').trim(),
            phone: String(contact?.phone || '').trim(),
        }))
        .filter((contact) => contact.name || contact.title || contact.email || contact.phone);
}

function shapeCustomer(payload, existing = {}) {
    return {
        ...existing,
        display_name: String(payload.display_name ?? existing.display_name ?? '').trim(),
        contact_to: String(payload.contact_to ?? existing.contact_to ?? '').trim(),
        contact_title: String(payload.contact_title ?? existing.contact_title ?? '').trim(),
        address: String(payload.address ?? existing.address ?? '').trim(),
        trn: String(payload.trn ?? existing.trn ?? '').trim(),
        registration_number: String(payload.registration_number ?? existing.registration_number ?? '').trim(),
        email: String(payload.email ?? existing.email ?? '').trim(),
        phone: String(payload.phone ?? existing.phone ?? '').trim(),
        extra_contacts: normalizeExtraContacts(payload.extra_contacts ?? existing.extra_contacts ?? []),
        source: String(payload.source ?? existing.source ?? '').trim(),
    };
}

function mapCustomerRow(row) {
    if (!row) return null;
    return {
        id: String(row.id || ''),
        display_name: String(row.display_name || '').trim(),
        contact_to: String(row.contact_to || '').trim(),
        contact_title: String(row.contact_title || '').trim(),
        address: String(row.address || '').trim(),
        trn: String(row.trn || '').trim(),
        registration_number: String(row.registration_number || '').trim(),
        email: String(row.email || '').trim(),
        phone: String(row.phone || '').trim(),
        extra_contacts: normalizeExtraContacts(row.extra_contacts || []),
        source: String(row.source || '').trim(),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
    };
}

async function getCustomersFromDatabase() {
    if (DIRECT_DB_ENABLED) {
        await ensureCustomersTable();
        const { rows } = await directQuery('SELECT * FROM customers ORDER BY updated_at DESC, display_name ASC');
        return rows.map(mapCustomerRow);
    }

    const db = getSupabaseClient();
    const { data, error } = await db.from('customers').select('*').order('updated_at', { ascending: false }).order('display_name', { ascending: true });
    if (error) {
        if (isMissingCustomersTableError(error)) {
            throw new Error('Customer storage is not configured in Supabase yet. Add a customers table or set DATABASE_URL.');
        }
        throw error;
    }
    return (data || []).map(mapCustomerRow);
}

async function getCustomerByIdFromDatabase(id) {
    if (DIRECT_DB_ENABLED) {
        await ensureCustomersTable();
        const { rows } = await directQuery('SELECT * FROM customers WHERE id = $1 LIMIT 1', [String(id)]);
        return mapCustomerRow(rows[0] || null);
    }

    const db = getSupabaseClient();
    const { data, error } = await db.from('customers').select('*').eq('id', String(id)).maybeSingle();
    if (error) {
        if (isMissingCustomersTableError(error)) {
            throw new Error('Customer storage is not configured in Supabase yet. Add a customers table or set DATABASE_URL.');
        }
        throw error;
    }
    return mapCustomerRow(data || null);
}

async function createCustomerInDatabase(payload) {
    const now = new Date().toISOString();
    const customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...shapeCustomer(payload),
        created_at: now,
        updated_at: now,
    };

    if (DIRECT_DB_ENABLED) {
        await ensureCustomersTable();
        await directQuery(
            `INSERT INTO customers (
                id, display_name, contact_to, contact_title, address, trn, registration_number, email, phone, extra_contacts, source, created_at, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13
            )`,
            [
                customer.id,
                customer.display_name,
                customer.contact_to,
                customer.contact_title,
                customer.address,
                customer.trn,
                customer.registration_number,
                customer.email,
                customer.phone,
                JSON.stringify(customer.extra_contacts),
                customer.source,
                customer.created_at,
                customer.updated_at,
            ],
        );
        return customer;
    }

    const db = getSupabaseClient();
    const { data, error } = await db.from('customers').insert(customer).select('*').maybeSingle();
    if (error) {
        if (isMissingCustomersTableError(error)) {
            throw new Error('Customer storage is not configured in Supabase yet. Add a customers table or set DATABASE_URL.');
        }
        throw error;
    }
    return mapCustomerRow(data || customer);
}

async function updateCustomerInDatabase(id, payload) {
    if (DIRECT_DB_ENABLED) {
        await ensureCustomersTable();
        const existing = await getCustomerByIdFromDatabase(id);
        if (!existing) return null;
        const customer = {
            ...shapeCustomer(payload, existing),
            id: String(id),
            created_at: existing.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        const { rows } = await directQuery(
            `UPDATE customers
             SET display_name = $2,
                 contact_to = $3,
                 contact_title = $4,
                 address = $5,
                 trn = $6,
                 registration_number = $7,
                 email = $8,
                 phone = $9,
                 extra_contacts = $10::jsonb,
                 source = $11,
                 updated_at = $12
             WHERE id = $1
             RETURNING *`,
            [
                customer.id,
                customer.display_name,
                customer.contact_to,
                customer.contact_title,
                customer.address,
                customer.trn,
                customer.registration_number,
                customer.email,
                customer.phone,
                JSON.stringify(customer.extra_contacts),
                customer.source,
                customer.updated_at,
            ],
        );
        return mapCustomerRow(rows[0] || null);
    }

    const existing = await getCustomerByIdFromDatabase(id);
    if (!existing) return null;
    const customer = {
        ...shapeCustomer(payload, existing),
        updated_at: new Date().toISOString(),
    };
    const db = getSupabaseClient();
    const { data, error } = await db.from('customers').update(customer).eq('id', String(id)).select('*').maybeSingle();
    if (error) {
        if (isMissingCustomersTableError(error)) {
            throw new Error('Customer storage is not configured in Supabase yet. Add a customers table or set DATABASE_URL.');
        }
        throw error;
    }
    return mapCustomerRow(data || null);
}

async function deleteCustomerInDatabase(id) {
    if (DIRECT_DB_ENABLED) {
        await ensureCustomersTable();
        const { rowCount } = await directQuery('DELETE FROM customers WHERE id = $1', [String(id)]);
        return rowCount > 0;
    }

    const db = getSupabaseClient();
    const { data, error } = await db.from('customers').delete().eq('id', String(id)).select('id');
    if (error) {
        if (isMissingCustomersTableError(error)) {
            throw new Error('Customer storage is not configured in Supabase yet. Add a customers table or set DATABASE_URL.');
        }
        throw error;
    }
    return (data || []).length > 0;
}

export async function getCustomers() {
    if (shouldUseDatabase()) {
        return getCustomersFromDatabase();
    }
    return readCustomersFile();
}

export async function getCustomerById(id) {
    if (shouldUseDatabase()) {
        return getCustomerByIdFromDatabase(id);
    }
    const customers = await readCustomersFile();
    return customers.find((customer) => String(customer.id) === String(id)) || null;
}

export async function createCustomer(payload) {
    if (shouldUseDatabase()) {
        return createCustomerInDatabase(payload);
    }
    const customers = await readCustomersFile();
    const customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...shapeCustomer(payload),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    customers.push(customer);
    await writeCustomersFile(customers);
    return customer;
}

export async function updateCustomer(id, payload) {
    if (shouldUseDatabase()) {
        return updateCustomerInDatabase(id, payload);
    }
    const customers = await readCustomersFile();
    const index = customers.findIndex((customer) => String(customer.id) === String(id));
    if (index === -1) return null;
    customers[index] = {
        ...shapeCustomer(payload, customers[index]),
        updated_at: new Date().toISOString(),
    };
    await writeCustomersFile(customers);
    return customers[index];
}

export async function deleteCustomer(id) {
    if (shouldUseDatabase()) {
        return deleteCustomerInDatabase(id);
    }
    const customers = await readCustomersFile();
    const next = customers.filter((customer) => String(customer.id) !== String(id));
    if (next.length === customers.length) return false;
    await writeCustomersFile(next);
    return true;
}

import { Pool } from 'pg';

// Dedicated connection for the Ministry Meeting portal. Uses the same Supabase
// DATABASE_URL as the rest of pico-stock, but all objects live in an isolated
// "ministry" schema so nothing here can affect the stock/exhibitor tables.

let pool = null;
function getPool() {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is not configured');
        }
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
            max: 3,
        });
    }
    return pool;
}

export async function query(text, params = []) {
    const res = await getPool().query(text, params);
    return res.rows;
}

let schemaReady = null;
/** Create the ministry schema + tables if missing (idempotent, safe to re-run). */
export async function ensureSchema() {
    if (schemaReady) return schemaReady;
    schemaReady = (async () => {
        await query(`CREATE SCHEMA IF NOT EXISTS ministry`);
        await query(`
            CREATE TABLE IF NOT EXISTS ministry.ministries (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                name_ar TEXT,
                token TEXT NOT NULL UNIQUE,
                contact_email TEXT,
                attention_name TEXT,
                attention_title TEXT,
                po_box TEXT,
                internal_note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
        await query(`
            CREATE TABLE IF NOT EXISTS ministry.catalog_items (
                id SERIAL PRIMARY KEY,
                item_no INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT NOT NULL,
                default_qty INTEGER NOT NULL DEFAULT 1,
                qty_fixed BOOLEAN NOT NULL DEFAULT false,
                unit TEXT,
                unit_price_fils INTEGER NOT NULL,
                sort_order INTEGER NOT NULL,
                active BOOLEAN NOT NULL DEFAULT true
            )`);
        await query(`
            CREATE TABLE IF NOT EXISTS ministry.quotations (
                id SERIAL PRIMARY KEY,
                ministry_id INTEGER NOT NULL REFERENCES ministry.ministries(id),
                ref TEXT NOT NULL,
                event_name TEXT,
                venue TEXT,
                event_date TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'submitted',
                subtotal_fils INTEGER NOT NULL,
                vat_fils INTEGER NOT NULL,
                total_fils INTEGER NOT NULL,
                pdf_blob_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
        await query(`
            CREATE TABLE IF NOT EXISTS ministry.quotation_lines (
                id SERIAL PRIMARY KEY,
                quotation_id INTEGER NOT NULL REFERENCES ministry.quotations(id),
                item_id INTEGER,
                item_no INTEGER NOT NULL,
                name_snapshot TEXT NOT NULL,
                unit_price_fils_snapshot INTEGER NOT NULL,
                qty INTEGER NOT NULL,
                line_total_fils INTEGER NOT NULL
            )`);
        await query(`
            CREATE TABLE IF NOT EXISTS ministry.ministry_photos (
                id SERIAL PRIMARY KEY,
                ministry_id INTEGER NOT NULL REFERENCES ministry.ministries(id),
                blob_url TEXT NOT NULL,
                pathname TEXT,
                caption TEXT,
                uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )`);
    })();
    return schemaReady;
}

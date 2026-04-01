import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SCHEMA_FILE = path.join(ROOT_DIR, 'supabase', 'schema.sql');
const DEFAULT_ENV_FILE = path.join(ROOT_DIR, '.env.local');

dotenv.config({ path: DEFAULT_ENV_FILE });

function getTimestamp(value) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function readJsonFile(filename, fallbackValue) {
    try {
        const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

async function ensureConnection() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is missing. Set it in .env.local or the current shell.');
    }

    const client = new Client({
        connectionString,
        ssl: process.env.DATABASE_SSL === 'require' || connectionString.includes('sslmode=require')
            ? { rejectUnauthorized: false }
            : undefined,
    });

    await client.connect();
    return client;
}

async function applyBaseSchema(client) {
    const schemaSql = await fs.readFile(SCHEMA_FILE, 'utf8');
    await client.query(schemaSql);
}

async function ensureQuotationSchema(client) {
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
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_order_id TEXT NOT NULL DEFAULT '',
            source_order_reference TEXT NOT NULL DEFAULT '',
            source_order_customer_email TEXT NOT NULL DEFAULT '',
            email_sent_at TIMESTAMPTZ NULL,
            confirmed_at TIMESTAMPTZ NULL,
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
}

async function upsertProducts(client, items) {
    for (const item of items) {
        await client.query(
            `INSERT INTO products (
                id, name, description, category, price, currency, image, stock, in_stock, featured, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                price = EXCLUDED.price,
                currency = EXCLUDED.currency,
                image = EXCLUDED.image,
                stock = EXCLUDED.stock,
                in_stock = EXCLUDED.in_stock,
                featured = EXCLUDED.featured`,
            [
                String(item.id),
                String(item.name || ''),
                String(item.description || ''),
                String(item.category || 'furniture'),
                Number(item.price || 0),
                String(item.currency || 'BHD'),
                String(item.image || '/products/table.svg'),
                item.stock ?? null,
                Boolean(item.inStock ?? item.in_stock ?? true),
                Boolean(item.featured ?? false),
                getTimestamp(item.createdAt || item.created_at),
            ],
        );
    }
}

async function upsertOrders(client, items) {
    for (const item of items) {
        const total = Number(item.total || 0);
        const days = Number(item.days || 1);
        await client.query(
            `INSERT INTO orders (
                id, items, exhibitor, total, days, grand_total, attachments, status, notes, zoho_quote_id, created_at, updated_at
            ) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
            ON CONFLICT (id) DO UPDATE SET
                items = EXCLUDED.items,
                exhibitor = EXCLUDED.exhibitor,
                total = EXCLUDED.total,
                days = EXCLUDED.days,
                grand_total = EXCLUDED.grand_total,
                attachments = EXCLUDED.attachments,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                zoho_quote_id = EXCLUDED.zoho_quote_id,
                updated_at = EXCLUDED.updated_at`,
            [
                String(item.id),
                JSON.stringify(item.items || []),
                JSON.stringify(item.exhibitor || {}),
                total,
                days,
                Number(item.grandTotal ?? item.grand_total ?? total * days),
                JSON.stringify(item.attachments || []),
                String(item.status || 'pending'),
                String(item.notes || ''),
                item.zohoQuoteId ?? item.zoho_quote_id ?? null,
                getTimestamp(item.createdAt || item.created_at),
                getTimestamp(item.updatedAt || item.updated_at),
            ],
        );
    }
}

async function upsertDesigners(client, items) {
    for (const item of items) {
        await client.query(
            `INSERT INTO designers (id, name, projects, created_at)
             VALUES ($1,$2,$3::jsonb,$4)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                projects = EXCLUDED.projects`,
            [
                String(item.id),
                String(item.name || ''),
                JSON.stringify(item.projects || []),
                getTimestamp(item.createdAt || item.created_at),
            ],
        );
    }
}

async function upsertStandDesigns(client, items) {
    for (const item of items) {
        await client.query(
            `INSERT INTO stand_designs (
                id, mode, prompt, refinement_prompt, style_preset, angle, reference_image_path,
                brief_json, concepts, provider, model, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13)
            ON CONFLICT (id) DO UPDATE SET
                mode = EXCLUDED.mode,
                prompt = EXCLUDED.prompt,
                refinement_prompt = EXCLUDED.refinement_prompt,
                style_preset = EXCLUDED.style_preset,
                angle = EXCLUDED.angle,
                reference_image_path = EXCLUDED.reference_image_path,
                brief_json = EXCLUDED.brief_json,
                concepts = EXCLUDED.concepts,
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                updated_at = EXCLUDED.updated_at`,
            [
                String(item.id),
                String(item.mode || 'generate'),
                String(item.prompt || ''),
                String(item.refinement_prompt || ''),
                String(item.style_preset || 'crisp'),
                String(item.angle || ''),
                String(item.reference_image_path || ''),
                JSON.stringify(item.brief_json || item.brief || {}),
                JSON.stringify(item.concepts || []),
                String(item.provider || 'google-genai'),
                String(item.model || ''),
                getTimestamp(item.created_at || item.createdAt),
                getTimestamp(item.updated_at || item.updatedAt),
            ],
        );
    }
}

async function upsertQuotations(client, items, nextQtNumber) {
    await client.query(
        `INSERT INTO quotation_meta(key, value)
         VALUES ('next_qt_number', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(nextQtNumber || 11825)],
    );

    for (const item of items) {
        await client.query(
            `INSERT INTO quotations (
                id, qt_number, customer_id, currency_code, source_type, source_order_id, source_order_reference,
                source_order_customer_email, email_sent_at, confirmed_at, date, ref, project_title, client_to,
                client_org, client_location, client_trn, event_name, venue, event_date, created_by, status, notes,
                sections, attachments, exclusions, terms, payment_terms, company_profile, vat_percent,
                total_selling, total_with_vat, history, created_at, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                $15,$16,$17,$18,$19,$20,$21,$22,$23,
                $24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,$28::jsonb,$29::jsonb,$30,
                $31,$32,$33::jsonb,$34,$35
            )
            ON CONFLICT (id) DO UPDATE SET
                qt_number = EXCLUDED.qt_number,
                customer_id = EXCLUDED.customer_id,
                currency_code = EXCLUDED.currency_code,
                source_type = EXCLUDED.source_type,
                source_order_id = EXCLUDED.source_order_id,
                source_order_reference = EXCLUDED.source_order_reference,
                source_order_customer_email = EXCLUDED.source_order_customer_email,
                email_sent_at = EXCLUDED.email_sent_at,
                confirmed_at = EXCLUDED.confirmed_at,
                date = EXCLUDED.date,
                ref = EXCLUDED.ref,
                project_title = EXCLUDED.project_title,
                client_to = EXCLUDED.client_to,
                client_org = EXCLUDED.client_org,
                client_location = EXCLUDED.client_location,
                client_trn = EXCLUDED.client_trn,
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
                updated_at = EXCLUDED.updated_at`,
            [
                String(item.id),
                Number(item.qt_number || 0),
                String(item.customer_id || ''),
                String(item.currency_code || 'BHD'),
                String(item.source_type || 'manual'),
                String(item.source_order_id || ''),
                String(item.source_order_reference || ''),
                String(item.source_order_customer_email || ''),
                item.email_sent_at || null,
                item.confirmed_at || null,
                String(item.date || ''),
                String(item.ref || ''),
                String(item.project_title || ''),
                String(item.client_to || ''),
                String(item.client_org || ''),
                String(item.client_location || ''),
                String(item.client_trn || ''),
                String(item.event_name || ''),
                String(item.venue || ''),
                String(item.event_date || ''),
                String(item.created_by || ''),
                String(item.status || 'Draft'),
                String(item.notes || ''),
                JSON.stringify(item.sections || []),
                JSON.stringify(item.attachments || []),
                JSON.stringify(item.exclusions || []),
                JSON.stringify(item.terms || []),
                JSON.stringify(item.payment_terms || []),
                JSON.stringify(item.company_profile || {}),
                Number(item.vat_percent || 10),
                Number(item.total_selling || 0),
                Number(item.total_with_vat || 0),
                JSON.stringify(item.history || []),
                getTimestamp(item.created_at || item.createdAt),
                getTimestamp(item.updated_at || item.updatedAt),
            ],
        );
    }
}

async function fetchCounts(client) {
    const tables = ['products', 'orders', 'designers', 'stand_designs', 'quotations'];
    const counts = {};
    for (const table of tables) {
        const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
        counts[table] = result.rows[0]?.count ?? 0;
    }
    return counts;
}

async function main() {
    const client = await ensureConnection();
    try {
        const products = await readJsonFile('products.json', []);
        const orders = await readJsonFile('orders.json', []);
        const designers = await readJsonFile('designers.json', []);
        const standDesigns = await readJsonFile('stand-designs.json', []);
        const quotations = await readJsonFile('quotations.json', []);
        const quotationMeta = await readJsonFile('quotation-meta.json', { next_qt_number: 11825 });

        console.log('Applying Supabase base schema...');
        await applyBaseSchema(client);
        console.log('Ensuring quotation schema...');
        await ensureQuotationSchema(client);

        console.log(`Restoring ${products.length} products...`);
        await upsertProducts(client, products);
        console.log(`Restoring ${orders.length} orders...`);
        await upsertOrders(client, orders);
        console.log(`Restoring ${designers.length} designers...`);
        await upsertDesigners(client, designers);
        console.log(`Restoring ${standDesigns.length} stand designs...`);
        await upsertStandDesigns(client, standDesigns);
        console.log(`Restoring ${quotations.length} quotations...`);
        await upsertQuotations(client, quotations, quotationMeta.next_qt_number);

        const counts = await fetchCounts(client);
        console.log('Restore complete.');
        console.table(counts);
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('Backend restore failed:', error.message);
    process.exitCode = 1;
});

/**
 * One-time import: Quotations_Client_Data_Extracted.xlsx → customers table via direct Postgres
 * Usage: node scripts/importCustomers.mjs
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const { Pool } = require('pg');

const XLSX_PATH = 'C:/Users/PICO/Desktop/New folder (2)/Quotations_Client_Data_Extracted.xlsx';
const DATABASE_URL = 'postgresql://postgres.iclmzodwmqetoibgmrtz:fSX4PJ52or6sAuLq@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

function str(v) {
    return String(v || '').trim();
}

function buildExtraContacts(row) {
    const contacts = [];
    for (let i = 2; i <= 3; i++) {
        const name = str(row[`Contact ${i} Name`]);
        const title = str(row[`Contact ${i} Title`]);
        const email = str(row[`Contact ${i} Email`]);
        const phone = str(row[`Contact ${i} Phone`]);
        if (name || email || phone) {
            contacts.push({ name, title, email, phone });
        }
    }
    return contacts;
}

// ── Main ────────────────────────────────────────────────────────────────────

const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets['Client Directory'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

console.log(`\nRead ${rows.length} rows from Excel`);

// Ensure table exists
await pool.query(`
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
`);

// Fetch existing names
const { rows: existingRows } = await pool.query('SELECT display_name FROM customers');
const existingNames = new Set(existingRows.map(r => r.display_name.toLowerCase()));
console.log(`Existing customers in DB: ${existingNames.size}\n`);

let created = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
    const display_name = str(row['Company Name']);
    if (!display_name) { skipped++; continue; }

    if (existingNames.has(display_name.toLowerCase())) {
        console.log(`  SKIP  ${display_name}`);
        skipped++;
        continue;
    }

    const crVat = str(row['CR / VAT']);
    const isVat = /^(vat|trn)/i.test(crVat);
    const now = new Date().toISOString();
    const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
        await pool.query(
            `INSERT INTO customers (
                id, display_name, contact_to, contact_title, address, trn,
                registration_number, email, phone, extra_contacts, source, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
            [
                id,
                display_name,
                str(row['Contact 1 Name']),
                str(row['Contact 1 Title']),
                str(row['Address']),
                isVat ? crVat.replace(/^(vat|trn)\s*:?\s*/i, '') : '',
                !isVat ? crVat : '',
                str(row['Contact 1 Email']),
                str(row['Contact 1 Phone']),
                JSON.stringify(buildExtraContacts(row)),
                'import',
                now,
                now,
            ]
        );
        console.log(`  OK    ${display_name}`);
        existingNames.add(display_name.toLowerCase());
        created++;
    } catch (err) {
        console.error(`  FAIL  ${display_name}: ${err.message}`);
        failed++;
    }
}

await pool.end();

console.log(`\n─────────────────────────────────────`);
console.log(`Created: ${created}  Skipped: ${skipped}  Failed: ${failed}`);
console.log(`─────────────────────────────────────\n`);

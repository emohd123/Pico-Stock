import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try { await fs.access(CUSTOMERS_FILE); }
    catch { await fs.writeFile(CUSTOMERS_FILE, '[]', 'utf8'); }
}

async function readCustomers() {
    await ensureFile();
    try { return JSON.parse(await fs.readFile(CUSTOMERS_FILE, 'utf8')); }
    catch { return []; }
}

async function writeCustomers(customers) {
    await ensureFile();
    await fs.writeFile(CUSTOMERS_FILE, JSON.stringify(customers, null, 2), 'utf8');
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

export async function getCustomers() {
    return readCustomers();
}

export async function getCustomerById(id) {
    const customers = await readCustomers();
    return customers.find(c => String(c.id) === String(id)) || null;
}

export async function createCustomer(payload) {
    const customers = await readCustomers();
    const customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...shapeCustomer(payload),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    customers.push(customer);
    await writeCustomers(customers);
    return customer;
}

export async function updateCustomer(id, payload) {
    const customers = await readCustomers();
    const idx = customers.findIndex(c => String(c.id) === String(id));
    if (idx === -1) return null;
    customers[idx] = {
        ...shapeCustomer(payload, customers[idx]),
        updated_at: new Date().toISOString(),
    };
    await writeCustomers(customers);
    return customers[idx];
}

export async function deleteCustomer(id) {
    const customers = await readCustomers();
    const next = customers.filter(c => String(c.id) !== String(id));
    if (next.length === customers.length) return false;
    await writeCustomers(next);
    return true;
}

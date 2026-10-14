/**
 * Equipment list files for electricity orders. Stored in a private bucket;
 * only admins (and the vendor, through their order key) get short-lived links.
 */

import { createClient } from '@supabase/supabase-js';
import { ElectricityStoreError } from './electricityOrderStore';

const BUCKET = 'electricity-equipment';
export const MAX_EQUIPMENT_BYTES = 4 * 1024 * 1024;

const OFFICE = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    doc: 'application/msword',
};

function extension(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

/** Recognise the file by its first bytes (the name only picks between Office formats). */
function sniff(buffer, name) {
    const ext = extension(name);
    if (buffer.length >= 4 && buffer.slice(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
    // .xlsx / .docx are zip files
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04 && (ext === 'xlsx' || ext === 'docx')) {
        return { mime: OFFICE[ext], ext };
    }
    // .xls / .doc (older Office)
    if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && (ext === 'xls' || ext === 'doc')) {
        return { mime: OFFICE[ext], ext };
    }
    return null;
}

let client = null;
function storage() {
    if (!client) {
        client = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
    }
    return client.storage;
}

/** True when the form field holds an actual file. */
export function isFile(value) {
    return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0);
}

/** Check and store the equipment list for an order. Returns { path, name, type, size, uploadedAt }. */
export async function storeEquipmentFile(order, file) {
    if (!isFile(file)) throw new ElectricityStoreError('Upload your equipment list before sending the order.');
    if (file.size > MAX_EQUIPMENT_BYTES) throw new ElectricityStoreError('The equipment list is larger than 4 MB. Please upload a smaller file.');
    const buffer = Buffer.from(await file.arrayBuffer());
    const type = sniff(buffer, file.name);
    if (!type) throw new ElectricityStoreError('Upload the equipment list as a PDF, photo (JPG/PNG), Excel or Word file.');

    const { error: bucketError } = await storage().createBucket(BUCKET, { public: false, fileSizeLimit: MAX_EQUIPMENT_BYTES });
    if (bucketError && !/already exists/i.test(bucketError.message)) console.warn('[electricity] bucket:', bucketError.message);

    const path = `${order.reference}/equipment-${Date.now()}.${type.ext}`;
    const { error } = await storage().from(BUCKET).upload(path, buffer, { contentType: type.mime, upsert: false });
    if (error) throw new ElectricityStoreError(`The equipment list could not be saved (${error.message}). Please try again.`, 500);
    return {
        path,
        name: String(file.name || `equipment.${type.ext}`).slice(0, 200),
        type: type.mime,
        size: buffer.length,
        uploadedAt: new Date().toISOString(),
    };
}

/** Short-lived private link to an equipment list. */
export async function signedEquipmentUrl(path, seconds = 300, downloadName) {
    const { data, error } = await storage().from(BUCKET).createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
    if (error) throw new Error(error.message);
    return data?.signedUrl || '';
}

/** The file itself, for attaching to Pico's notification email. */
export async function equipmentAttachment(equipment) {
    if (!equipment?.path) return null;
    const { data, error } = await storage().from(BUCKET).download(equipment.path);
    if (error || !data) return null;
    return { filename: equipment.name || 'equipment-list', content: Buffer.from(await data.arrayBuffer()), contentType: equipment.type };
}

/**
 * Orders arrive as multipart form data: a JSON "payload" field plus the
 * "equipment" file. Plain JSON is still accepted (with no file).
 */
export async function readOrderRequest(request) {
    const type = request.headers.get('content-type') || '';
    if (type.includes('multipart/form-data')) {
        const form = await request.formData().catch(() => null);
        if (!form) return { body: {}, file: null };
        let body = {};
        try { body = JSON.parse(String(form.get('payload') || '{}')); } catch { body = {}; }
        const file = form.get('equipment');
        return { body, file: isFile(file) ? file : null };
    }
    return { body: await request.json().catch(() => ({})), file: null };
}

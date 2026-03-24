import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SIGS_FILE = path.join(DATA_DIR, 'staff-signatures.json');

async function ensureFile() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try { await fs.access(SIGS_FILE); }
    catch { await fs.writeFile(SIGS_FILE, '[]', 'utf8'); }
}

async function readSigs() {
    await ensureFile();
    try { return JSON.parse(await fs.readFile(SIGS_FILE, 'utf8')); }
    catch { return []; }
}

async function writeSigs(sigs) {
    await ensureFile();
    await fs.writeFile(SIGS_FILE, JSON.stringify(sigs, null, 2), 'utf8');
}

export async function getSignatures() {
    return readSigs();
}

export async function getSignatureByName(name) {
    const sigs = await readSigs();
    return sigs.find(s => String(s.name).toLowerCase() === String(name).toLowerCase()) || null;
}

export async function upsertSignature(name, payload) {
    const sigs = await readSigs();
    const idx = sigs.findIndex(s => String(s.name).toLowerCase() === String(name).toLowerCase());
    const entry = {
        name: String(name).trim(),
        signature_image: payload.signature_image !== undefined ? payload.signature_image : (sigs[idx]?.signature_image ?? null),
        stamp_image: payload.stamp_image !== undefined ? payload.stamp_image : (sigs[idx]?.stamp_image ?? null),
        updated_at: new Date().toISOString(),
    };
    if (idx >= 0) sigs[idx] = entry;
    else sigs.push(entry);
    await writeSigs(sigs);
    return entry;
}

export async function deleteSignature(name) {
    const sigs = await readSigs();
    const next = sigs.filter(s => String(s.name).toLowerCase() !== String(name).toLowerCase());
    if (next.length === sigs.length) return false;
    await writeSigs(next);
    return true;
}

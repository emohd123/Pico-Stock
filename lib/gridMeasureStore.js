import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { list, put } from '@vercel/blob';

const DATA_DIR = path.join(process.cwd(), 'data');
const GRID_MEASURE_FILE = path.join(DATA_DIR, 'grid-measure-projects.json');
const GRID_MEASURE_BLOB_PATH = 'grid-measure/projects.json';
const SUPABASE_ENABLED = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const BLOB_ENABLED = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const PRODUCTION_READONLY_FALLBACK = process.env.VERCEL === '1' && !SUPABASE_ENABLED;
const SUPABASE_TIMEOUT_MS = Number(process.env.GRID_MEASURE_SUPABASE_TIMEOUT_MS || 8000);

let supabaseClient = null;

export class GridMeasureStoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'GridMeasureStoreError';
        this.status = status;
    }
}

function normalizeText(value) {
    return String(value || '').trim();
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
            { auth: { persistSession: false, autoRefreshToken: false } },
        );
    }
    return supabaseClient;
}

function shouldUseJsonFallback() {
    if (process.env.VERCEL === '1') return false;
    return !PRODUCTION_READONLY_FALLBACK;
}

function shouldUseBlobFallback() {
    return process.env.VERCEL === '1' && BLOB_ENABLED;
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
        throw new GridMeasureStoreError(
            'Production storage is not configured for Grid Measure. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel.',
            503,
        );
    }
}

async function ensureJsonStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(GRID_MEASURE_FILE);
    } catch {
        await fs.writeFile(GRID_MEASURE_FILE, '[]', 'utf8');
    }
}

async function readJsonStore() {
    await ensureJsonStore();
    try {
        return JSON.parse(await fs.readFile(GRID_MEASURE_FILE, 'utf8'));
    } catch {
        return [];
    }
}

async function writeJsonStore(records) {
    ensureWritableStorage();
    await ensureJsonStore();
    const tempPath = `${GRID_MEASURE_FILE}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8');
    await fs.rename(tempPath, GRID_MEASURE_FILE);
}

async function readBlobStore() {
    const response = await list({ prefix: GRID_MEASURE_BLOB_PATH, limit: 1 });
    const blob = response.blobs.find((item) => item.pathname === GRID_MEASURE_BLOB_PATH);
    if (!blob) return [];
    const data = await fetch(blob.downloadUrl || blob.url, { cache: 'no-store' });
    if (!data.ok) return [];
    try {
        return await data.json();
    } catch {
        return [];
    }
}

async function writeBlobStore(records) {
    await put(GRID_MEASURE_BLOB_PATH, JSON.stringify(records, null, 2), {
        access: 'public',
        allowOverwrite: true,
        contentType: 'application/json',
    });
}

function normalizeProject(record = {}, existing = null) {
    const timestamp = nowIso();
    return {
        id: normalizeText(record.id) || existing?.id || `grid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeText(record.name) || existing?.name || 'Untitled grid measure',
        image: record.image && typeof record.image === 'object' ? record.image : (existing?.image || null),
        grid: record.grid && typeof record.grid === 'object' ? record.grid : (existing?.grid || {}),
        view: record.view && typeof record.view === 'object' ? record.view : (existing?.view || {}),
        groups: Array.isArray(record.groups) ? record.groups : (existing?.groups || []),
        checklist: Array.isArray(record.checklist) ? record.checklist : (existing?.checklist || []),
        scale_mode: normalizeText(record.scale_mode || existing?.scale_mode || 'plan'),
        created_at: normalizeText(record.created_at || existing?.created_at || timestamp),
        updated_at: timestamp,
    };
}

function rowToProject(row = {}) {
    return normalizeProject({
        id: row.id,
        name: row.name,
        image: row.image,
        grid: row.grid,
        view: row.view,
        groups: row.groups,
        checklist: row.checklist,
        scale_mode: row.scale_mode,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }, row);
}

async function upsertSupabaseProject(project) {
    const supabase = getSupabaseClient();
    const { error } = await withTimeout(
        supabase.from('grid_measure_projects').upsert({
            id: project.id,
            name: project.name,
            image: project.image,
            grid: project.grid,
            view: project.view,
            groups: project.groups,
            checklist: project.checklist,
            scale_mode: project.scale_mode,
            created_at: project.created_at,
            updated_at: project.updated_at,
        }),
        'grid measure upsert',
    );
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

export async function getGridMeasureProjects() {
    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('grid_measure_projects').select('*').order('updated_at', { ascending: false }),
                'grid measure list',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return (data || []).map(rowToProject);
        } catch (error) {
            if (shouldUseBlobFallback()) {
                return (await readBlobStore()).map((item) => normalizeProject(item, item)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
            }
            if (!shouldUseJsonFallback()) throw error;
            return (await readJsonStore()).map((item) => normalizeProject(item, item)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
        }
    }
    if (shouldUseBlobFallback()) {
        return (await readBlobStore()).map((item) => normalizeProject(item, item)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    return (await readJsonStore()).map((item) => normalizeProject(item, item)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function getGridMeasureProjectById(id) {
    const recordId = normalizeText(id);
    if (!recordId) return null;
    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withTimeout(
                supabase.from('grid_measure_projects').select('*').eq('id', recordId).maybeSingle(),
                'grid measure get',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return data ? rowToProject(data) : null;
        } catch (error) {
            if (shouldUseBlobFallback()) {
                return (await readBlobStore()).map((item) => normalizeProject(item, item)).find((item) => item.id === recordId) || null;
            }
            if (!shouldUseJsonFallback()) throw error;
            return (await readJsonStore()).map((item) => normalizeProject(item, item)).find((item) => item.id === recordId) || null;
        }
    }
    if (shouldUseBlobFallback()) {
        return (await readBlobStore()).map((item) => normalizeProject(item, item)).find((item) => item.id === recordId) || null;
    }
    return (await getGridMeasureProjects()).find((item) => item.id === recordId) || null;
}

export async function createGridMeasureProject(payload) {
    ensureWritableStorage();
    const project = normalizeProject(payload);
    if (SUPABASE_ENABLED) {
        try {
            await upsertSupabaseProject(project);
            return project;
        } catch (error) {
            if (!shouldUseBlobFallback() && !shouldUseJsonFallback()) throw error;
        }
    }
    if (shouldUseBlobFallback()) {
        const records = await readBlobStore();
        records.unshift(project);
        await writeBlobStore(records);
        return project;
    }
    const records = await readJsonStore();
    records.unshift(project);
    await writeJsonStore(records);
    return project;
}

export async function updateGridMeasureProject(id, payload) {
    ensureWritableStorage();
    const existing = await getGridMeasureProjectById(id);
    if (!existing) return null;
    const project = normalizeProject({ ...payload, id: existing.id, created_at: existing.created_at }, existing);
    if (SUPABASE_ENABLED) {
        try {
            await upsertSupabaseProject(project);
            return project;
        } catch (error) {
            if (!shouldUseBlobFallback() && !shouldUseJsonFallback()) throw error;
        }
    }
    if (shouldUseBlobFallback()) {
        const records = await readBlobStore();
        const next = records.map((item) => (item.id === existing.id ? project : item));
        await writeBlobStore(next);
        return project;
    }
    const records = await readJsonStore();
    const next = records.map((item) => (item.id === existing.id ? project : item));
    await writeJsonStore(next);
    return project;
}

export async function deleteGridMeasureProject(id) {
    ensureWritableStorage();
    const recordId = normalizeText(id);
    if (!recordId) return false;
    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await supabase.from('grid_measure_projects').delete().eq('id', recordId).select('id');
            if (error) throw new Error(`Supabase delete failed: ${error.message}`);
            return Array.isArray(data) && data.length > 0;
        } catch (error) {
            if (!shouldUseBlobFallback() && !shouldUseJsonFallback()) throw error;
        }
    }
    if (shouldUseBlobFallback()) {
        const records = await readBlobStore();
        const next = records.filter((item) => item.id !== recordId);
        await writeBlobStore(next);
        return next.length !== records.length;
    }
    const records = await readJsonStore();
    const next = records.filter((item) => item.id !== recordId);
    await writeJsonStore(next);
    return next.length !== records.length;
}

export function getGridMeasureStorageStatus() {
    return {
        mode: SUPABASE_ENABLED ? 'supabase' : (PRODUCTION_READONLY_FALLBACK ? 'unconfigured' : 'json'),
        fallback: shouldUseBlobFallback() ? 'blob' : (shouldUseJsonFallback() ? 'json' : null),
        production_ready: SUPABASE_ENABLED || BLOB_ENABLED || !PRODUCTION_READONLY_FALLBACK,
    };
}

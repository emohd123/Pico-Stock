import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
    isValidStandDesignAngle,
    isValidStandDesignMode,
    isValidStandDesignStylePreset,
} from '@/lib/standDesignConfig';
import {
    buildStandDesignCoverageSummary,
    createDefaultStandDesignBrief,
    normalizeStandDesignBrief,
} from '@/lib/standDesignBrief';

const DATA_DIR = path.join(process.cwd(), 'data');
const STAND_DESIGNS_FILE = path.join(DATA_DIR, 'stand-designs.json');
const SUPABASE_ENABLED = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const PRODUCTION_READONLY_FALLBACK = process.env.VERCEL === '1' && !SUPABASE_ENABLED;
const SUPABASE_TIMEOUT_MS = Number(process.env.STAND_DESIGN_SUPABASE_TIMEOUT_MS || 4000);

let supabaseClient = null;

export class StandDesignStoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'StandDesignStoreError';
        this.status = status;
    }
}

function ensureStandDesignWritableStorage() {
    if (PRODUCTION_READONLY_FALLBACK) {
        throw new StandDesignStoreError(
            'Production storage is not configured for Stand Design. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel to enable saved records and generation.',
            503,
        );
    }
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
    return !PRODUCTION_READONLY_FALLBACK;
}

async function withSupabaseTimeout(promise, label) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`Supabase ${label} timed out after ${SUPABASE_TIMEOUT_MS}ms`));
                }, SUPABASE_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function ensureJsonStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(STAND_DESIGNS_FILE);
    } catch {
        await fs.writeFile(STAND_DESIGNS_FILE, '[]', 'utf8');
    }
}

async function readJsonStore() {
    await ensureJsonStore();
    try {
        const raw = await fs.readFile(STAND_DESIGNS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

async function writeJsonStore(records) {
    await ensureJsonStore();
    const tempFilePath = `${STAND_DESIGNS_FILE}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(records, null, 2), 'utf8');
    await fs.rename(tempFilePath, STAND_DESIGNS_FILE);
}

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeTimestamp(value, fallback = null) {
    const text = normalizeText(value);
    return text || fallback;
}

function normalizeConcept(concept = {}, index = 0) {
    return {
        id: normalizeText(concept.id) || `concept-${index + 1}`,
        path: normalizeText(concept.path),
        mimeType: normalizeText(concept.mimeType) || 'image/png',
        title: normalizeText(concept.title) || `Concept ${index + 1}`,
        summary: normalizeText(concept.summary),
        refinement_prompt: normalizeText(concept.refinement_prompt),
        source_variant: normalizeText(concept.source_variant),
        prompt: normalizeText(concept.prompt),
        width: Number.isFinite(Number(concept.width)) ? Number(concept.width) : null,
        height: Number.isFinite(Number(concept.height)) ? Number(concept.height) : null,
        coverage: Array.isArray(concept.coverage)
            ? concept.coverage.map((item) => ({
                key: normalizeText(item.key),
                label: normalizeText(item.label),
                status: normalizeText(item.status) || 'needs-review',
                source: normalizeText(item.source),
            }))
            : [],
        views: Array.isArray(concept.views)
            ? concept.views.map((view, viewIndex) => ({
                id: normalizeText(view.id) || `${normalizeText(concept.id) || `concept-${index + 1}`}-view-${viewIndex + 1}`,
                label: normalizeText(view.label) || `View ${viewIndex + 1}`,
                angle: normalizeText(view.angle),
                path: normalizeText(view.path),
                mimeType: normalizeText(view.mimeType) || 'image/png',
                created_at: normalizeTimestamp(view.created_at, new Date().toISOString()),
            })).filter((view) => view.path)
            : [],
        created_at: normalizeTimestamp(concept.created_at, new Date().toISOString()),
    };
}

function summarizeConcept(concept = {}, index = 0) {
    const normalized = normalizeConcept(concept, index);
    return {
        id: normalized.id,
        path: normalized.path,
        mimeType: normalized.mimeType,
        title: normalized.title,
        summary: normalized.summary,
        refinement_prompt: normalized.refinement_prompt,
        source_variant: normalized.source_variant,
        prompt: normalized.prompt,
        width: normalized.width,
        height: normalized.height,
        coverage: normalized.coverage,
        views: normalized.views,
        created_at: normalized.created_at,
    };
}

function normalizeStandDesign(record = {}, existing = null) {
    const now = new Date().toISOString();
    const mode = isValidStandDesignMode(record.mode) ? record.mode : (existing?.mode || 'generate');
    const stylePreset = isValidStandDesignStylePreset(record.style_preset)
        ? record.style_preset
        : (existing?.style_preset || 'crisp');
    const angle = isValidStandDesignAngle(record.angle) ? record.angle : (existing?.angle || '');
    const concepts = Array.isArray(record.concepts)
        ? record.concepts.map(normalizeConcept).filter((concept) => concept.path)
        : (Array.isArray(existing?.concepts) ? existing.concepts.map(normalizeConcept) : []);
    const brief = normalizeStandDesignBrief(record.brief || existing?.brief || createDefaultStandDesignBrief());

    return {
        id: normalizeText(record.id) || existing?.id || `stand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode,
        prompt: normalizeText(record.prompt),
        refinement_prompt: normalizeText(record.refinement_prompt ?? existing?.refinement_prompt ?? ''),
        style_preset: stylePreset,
        angle,
        reference_image_path: normalizeText(record.reference_image_path ?? existing?.reference_image_path ?? ''),
        concepts,
        provider: normalizeText(record.provider || existing?.provider || 'google-genai'),
        model: normalizeText(record.model || existing?.model || ''),
        brief,
        created_at: normalizeTimestamp(record.created_at, existing?.created_at || now),
        updated_at: normalizeTimestamp(record.updated_at, now),
    };
}

function summarizeStandDesign(record = {}) {
    const normalized = normalizeStandDesign(record, record);
    return {
        id: normalized.id,
        mode: normalized.mode,
        prompt: normalized.prompt,
        refinement_prompt: normalized.refinement_prompt,
        style_preset: normalized.style_preset,
        angle: normalized.angle,
        reference_image_path: normalized.reference_image_path,
        concepts: normalized.concepts.map(summarizeConcept),
        provider: normalized.provider,
        model: normalized.model,
        brief: normalized.brief,
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
    };
}

function validateAndEnrichStandDesign(record) {
    const hasPrompt = Boolean(normalizeText(record.prompt));
    if (!isValidStandDesignMode(record.mode)) {
        throw new StandDesignStoreError('Invalid stand design mode');
    }
    if (!isValidStandDesignStylePreset(record.style_preset)) {
        throw new StandDesignStoreError('Invalid style preset');
    }
    if (!isValidStandDesignAngle(record.angle)) {
        throw new StandDesignStoreError('Invalid angle option');
    }
    const brief = normalizeStandDesignBrief(record.brief);
    const hasStructuredBrief = Object.values(brief).some((value) => Boolean(normalizeText(value)));
    if (!hasPrompt && !hasStructuredBrief) {
        throw new StandDesignStoreError('Provide a design prompt or fill the structured brief');
    }
    if (record.mode === 'edit' && !normalizeText(record.reference_image_path) && !normalizeText(brief.brand_reference_image_path)) {
        throw new StandDesignStoreError('Reference image is required in edit mode');
    }
    if (!Array.isArray(record.concepts) || record.concepts.length !== 2) {
        throw new StandDesignStoreError('Exactly 2 generated concepts are required');
    }
    const concepts = record.concepts.map((concept, index) => ({
        ...normalizeConcept(concept, index),
        coverage: Array.isArray(concept.coverage) && concept.coverage.length > 0
            ? concept.coverage
            : buildStandDesignCoverageSummary(brief),
    }));
    return { ...record, brief, concepts };
}

function sortByUpdated(records) {
    return [...records].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

function rowToRecord(row) {
    // Supabase returns JSONB columns as parsed JS objects; timestamps as ISO strings
    return normalizeStandDesign({
        ...row,
        brief: row.brief_json || row.brief || {},
        concepts: row.concepts || [],
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    }, {
        ...row,
        brief: row.brief_json || row.brief || {},
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    });
}

function safeRowToRecord(row) {
    try {
        return rowToRecord(row);
    } catch {
        return null;
    }
}

function safeNormalizeRecord(record) {
    try {
        return normalizeStandDesign(record, record);
    } catch {
        return null;
    }
}

async function upsertSupabaseRow(supabase, record) {
    const { error } = await supabase.from('stand_designs').upsert({
        id: record.id,
        mode: record.mode,
        prompt: record.prompt,
        refinement_prompt: record.refinement_prompt,
        style_preset: record.style_preset,
        angle: record.angle,
        reference_image_path: record.reference_image_path,
        brief_json: record.brief,
        concepts: record.concepts,
        provider: record.provider,
        model: record.model,
        created_at: record.created_at,
        updated_at: record.updated_at,
    });
    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

export async function getStandDesigns() {
    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withSupabaseTimeout(
                supabase
                    .from('stand_designs')
                    .select('id, mode, prompt, refinement_prompt, style_preset, angle, reference_image_path, brief_json, concepts, provider, model, created_at, updated_at')
                    .order('updated_at', { ascending: false }),
                'stand design list query',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return (data || []).map(safeRowToRecord).filter(Boolean).map(summarizeStandDesign);
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
            const records = await readJsonStore();
            return sortByUpdated(records.map(safeNormalizeRecord).filter(Boolean).map(summarizeStandDesign));
        }
    }

    if (PRODUCTION_READONLY_FALLBACK) {
        return [];
    }

    const records = await readJsonStore();
    return sortByUpdated(records.map(safeNormalizeRecord).filter(Boolean).map(summarizeStandDesign));
}

export async function getStandDesignById(id) {
    const recordId = normalizeText(id);
    if (!recordId) return null;

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        try {
            const { data, error } = await withSupabaseTimeout(
                supabase
                    .from('stand_designs')
                    .select('*')
                    .eq('id', recordId)
                    .maybeSingle(),
                'stand design record query',
            );
            if (error) throw new Error(`Supabase query failed: ${error.message}`);
            return data ? rowToRecord(data) : null;
        } catch (error) {
            if (!shouldUseJsonFallback()) throw error;
            const records = await readJsonStore();
            const record = records.find((item) => String(item.id) === recordId);
            return record ? normalizeStandDesign(record, record) : null;
        }
    }

    if (PRODUCTION_READONLY_FALLBACK) {
        return null;
    }

    const records = await readJsonStore();
    const record = records.find((item) => String(item.id) === recordId);
    return record ? normalizeStandDesign(record, record) : null;
}

export async function createStandDesign(payload) {
    const timestamp = new Date().toISOString();
    const record = validateAndEnrichStandDesign(
        normalizeStandDesign({ ...payload, created_at: timestamp, updated_at: timestamp }, null),
    );

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        await upsertSupabaseRow(supabase, record);
        return record;
    }

    ensureStandDesignWritableStorage();
    const records = await readJsonStore();
    records.push(record);
    await writeJsonStore(records);
    return record;
}

export async function updateStandDesign(id, payload) {
    const existing = await getStandDesignById(id);
    if (!existing) return null;
    const record = validateAndEnrichStandDesign(
        normalizeStandDesign(
            { ...existing, ...payload, id: existing.id, created_at: existing.created_at, updated_at: new Date().toISOString() },
            existing,
        ),
    );

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        await upsertSupabaseRow(supabase, record);
        return record;
    }

    ensureStandDesignWritableStorage();
    const records = await readJsonStore();
    const index = records.findIndex((item) => String(item.id) === String(existing.id));
    if (index === -1) return null;
    records[index] = record;
    await writeJsonStore(records);
    return record;
}

export async function deleteStandDesign(id) {
    const recordId = normalizeText(id);
    if (!recordId) return false;

    if (SUPABASE_ENABLED) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('stand_designs')
            .delete()
            .eq('id', recordId)
            .select('id');
        if (error) throw new Error(`Supabase delete failed: ${error.message}`);
        return Array.isArray(data) && data.length > 0;
    }

    ensureStandDesignWritableStorage();
    const records = await readJsonStore();
    const nextRecords = records.filter((item) => String(item.id) !== recordId);
    if (nextRecords.length === records.length) return false;
    await writeJsonStore(nextRecords);
    return true;
}

export function getStandDesignStorageStatus() {
    return {
        mode: SUPABASE_ENABLED ? 'supabase' : (PRODUCTION_READONLY_FALLBACK ? 'unconfigured' : 'json'),
        production_ready: SUPABASE_ENABLED || !PRODUCTION_READONLY_FALLBACK,
    };
}

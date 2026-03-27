import { promises as fs } from 'fs';
import path from 'path';
import { Pool } from 'pg';
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

const IS_VERCEL = process.env.VERCEL === '1';
const DATA_DIR = IS_VERCEL
    ? '/tmp/pico-stock-stand-design'
    : path.join(process.cwd(), 'data');
const STAND_DESIGNS_FILE = path.join(DATA_DIR, 'stand-designs.json');
const POSTGRES_ENABLED = Boolean(process.env.DATABASE_URL);

let pgPool = null;
let pgReadyPromise = null;

export class StandDesignStoreError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'StandDesignStoreError';
        this.status = status;
    }
}

function getPgPool() {
    if (!POSTGRES_ENABLED) return null;
    if (!pgPool) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pgPool;
}

async function ensureJsonStore() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(STAND_DESIGNS_FILE);
    } catch {
        await fs.writeFile(STAND_DESIGNS_FILE, '[]', 'utf8');
    }
}

async function ensurePostgresStore() {
    if (!POSTGRES_ENABLED) return;
    if (!pgReadyPromise) {
        pgReadyPromise = (async () => {
            const pool = getPgPool();
            const client = await pool.connect();
            try {
                await client.query(`
                    CREATE TABLE IF NOT EXISTS stand_designs (
                        id TEXT PRIMARY KEY,
                        mode TEXT NOT NULL,
                        prompt TEXT NOT NULL,
                        refinement_prompt TEXT NOT NULL DEFAULT '',
                        style_preset TEXT NOT NULL,
                        angle TEXT NOT NULL DEFAULT '',
                        reference_image_path TEXT NOT NULL DEFAULT '',
                        brief_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                        concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
                        provider TEXT NOT NULL DEFAULT 'google-genai',
                        model TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                `);
                await client.query(`ALTER TABLE stand_designs ADD COLUMN IF NOT EXISTS brief_json JSONB NOT NULL DEFAULT '{}'::jsonb`);
            } finally {
                client.release();
            }
        })();
    }
    await pgReadyPromise;
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

    const normalized = {
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

    validateStandDesign(normalized);
    return normalized;
}

function validateStandDesign(record) {
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
    record.brief = normalizeStandDesignBrief(record.brief);
    const hasStructuredBrief = Object.values(record.brief).some((value) => Boolean(normalizeText(value)));
    if (!hasPrompt && !hasStructuredBrief) {
        throw new StandDesignStoreError('Provide a design prompt or fill the structured brief');
    }
    if (record.mode === 'edit' && !normalizeText(record.reference_image_path) && !normalizeText(record.brief.brand_reference_image_path)) {
        throw new StandDesignStoreError('Reference image is required in edit mode');
    }
    if (!Array.isArray(record.concepts) || record.concepts.length !== 2) {
        throw new StandDesignStoreError('Exactly 2 generated concepts are required');
    }
    record.concepts = record.concepts.map((concept, index) => ({
        ...normalizeConcept(concept, index),
        coverage: Array.isArray(concept.coverage) && concept.coverage.length > 0
            ? concept.coverage
            : buildStandDesignCoverageSummary(record.brief),
    }));
}

function sortByUpdated(records) {
    return [...records].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

function rowToRecord(row) {
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

async function upsertStandDesignRow(client, record) {
    await client.query(
        `INSERT INTO stand_designs (
            id, mode, prompt, refinement_prompt, style_preset, angle, reference_image_path,
            brief_json, concepts, provider, model, created_at, updated_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12::timestamptz,$13::timestamptz
        )
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
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at`,
        [
            record.id,
            record.mode,
            record.prompt,
            record.refinement_prompt,
            record.style_preset,
            record.angle,
            record.reference_image_path,
            JSON.stringify(record.brief),
            JSON.stringify(record.concepts),
            record.provider,
            record.model,
            record.created_at,
            record.updated_at,
        ],
    );
}

export async function getStandDesigns() {
    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM stand_designs ORDER BY updated_at DESC');
        return result.rows.map(rowToRecord);
    }

    const records = await readJsonStore();
    return sortByUpdated(records.map((record) => normalizeStandDesign(record, record)));
}

export async function getStandDesignById(id) {
    const recordId = normalizeText(id);
    if (!recordId) return null;

    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('SELECT * FROM stand_designs WHERE id = $1 LIMIT 1', [recordId]);
        return result.rows[0] ? rowToRecord(result.rows[0]) : null;
    }

    const records = await readJsonStore();
    const record = records.find((item) => String(item.id) === recordId);
    return record ? normalizeStandDesign(record, record) : null;
}

export async function createStandDesign(payload) {
    const timestamp = new Date().toISOString();
    const record = normalizeStandDesign({ ...payload, created_at: timestamp, updated_at: timestamp }, null);

    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await upsertStandDesignRow(client, record);
            return record;
        } finally {
            client.release();
        }
    }

    const records = await readJsonStore();
    records.push(record);
    await writeJsonStore(records);
    return record;
}

export async function updateStandDesign(id, payload) {
    const existing = await getStandDesignById(id);
    if (!existing) return null;
    const record = normalizeStandDesign(
        { ...existing, ...payload, id: existing.id, created_at: existing.created_at, updated_at: new Date().toISOString() },
        existing,
    );

    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const client = await pool.connect();
        try {
            await upsertStandDesignRow(client, record);
            return record;
        } finally {
            client.release();
        }
    }

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

    if (POSTGRES_ENABLED) {
        await ensurePostgresStore();
        const pool = getPgPool();
        const result = await pool.query('DELETE FROM stand_designs WHERE id = $1', [recordId]);
        return result.rowCount > 0;
    }

    const records = await readJsonStore();
    const nextRecords = records.filter((item) => String(item.id) !== recordId);
    if (nextRecords.length === records.length) return false;
    await writeJsonStore(nextRecords);
    return true;
}

export function getStandDesignStorageStatus() {
    return {
        mode: POSTGRES_ENABLED ? 'postgres' : IS_VERCEL ? 'tmp-json' : 'json',
        production_ready: POSTGRES_ENABLED,
    };
}

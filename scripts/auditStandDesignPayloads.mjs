import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env.production.local'), override: false });

const SUPABASE_URL = normalizeText(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_KEY = normalizeText(process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const STORAGE_BUCKET = normalizeText(process.env.STAND_DESIGN_STORAGE_BUCKET || 'stand-design-assets');
const PAGE_SIZE = 100;

function normalizeText(value) {
  return String(value || '').trim();
}

function isDataUrl(value) {
  return /^data:/i.test(normalizeText(value));
}

function parseArgs(argv = []) {
  return {
    migrate: argv.includes('--migrate'),
    verbose: argv.includes('--verbose'),
    limit: Number.parseInt((argv.find((item) => item.startsWith('--limit=')) || '').split('=')[1] || '', 10) || 0,
    recordId: normalizeText((argv.find((item) => item.startsWith('--id=')) || '').split('=').slice(1).join('=')),
    output: normalizeText((argv.find((item) => item.startsWith('--output=')) || '').split('=').slice(1).join('=')),
  };
}

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
}

function getSupabase() {
  ensureEnv();
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function estimateBytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function extractDataUrlParts(value) {
  const clean = normalizeText(value);
  const match = clean.match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (!match) return null;
  return {
    mimeType: normalizeText(match[1]) || 'image/png',
    imageBytes: match[2],
  };
}

function buildPublicUrl(supabase, storagePath) {
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return normalizeText(data?.publicUrl);
}

async function uploadInlineAsset(supabase, storagePath, dataUrl) {
  const parsed = extractDataUrlParts(dataUrl);
  if (!parsed) {
    throw new Error('Inline asset is not a valid base64 data URL.');
  }
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(
    storagePath,
    Buffer.from(parsed.imageBytes, 'base64'),
    {
      contentType: parsed.mimeType,
      upsert: true,
      cacheControl: '3600',
    },
  );
  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }
  return {
    path: buildPublicUrl(supabase, storagePath),
    mimeType: parsed.mimeType,
    estimatedBytes: estimateBytes(dataUrl),
  };
}

function scanRecord(record) {
  const concepts = Array.isArray(record?.concepts) ? record.concepts : [];
  let inlineCount = 0;
  let inlineBytes = 0;
  let sceneBytes = 0;
  const refs = [];

  concepts.forEach((concept, conceptIndex) => {
    const scene = concept?.scene;
    if (scene) {
      sceneBytes += estimateBytes(JSON.stringify(scene));
    }

    const candidates = [
      { kind: 'concept', key: 'path', value: concept?.path, conceptIndex },
      ...(Array.isArray(concept?.views)
        ? concept.views.map((view, viewIndex) => ({ kind: 'view', key: `views.${viewIndex}.path`, value: view?.path, conceptIndex }))
        : []),
      ...(Array.isArray(concept?.scene_renders)
        ? concept.scene_renders.map((render, renderIndex) => ({ kind: 'scene_render', key: `scene_renders.${renderIndex}.path`, value: render?.path, conceptIndex }))
        : []),
    ];

    candidates.forEach((candidate) => {
      if (!isDataUrl(candidate.value)) return;
      const bytes = estimateBytes(candidate.value);
      inlineCount += 1;
      inlineBytes += bytes;
      refs.push({ ...candidate, bytes });
    });
  });

  return {
    id: normalizeText(record?.id),
    updated_at: normalizeText(record?.updated_at),
    inlineCount,
    inlineBytes,
    sceneBytes,
    refs,
  };
}

function summarizeAudit(results) {
  const totals = results.reduce((acc, item) => {
    acc.records += 1;
    acc.recordsWithInline += item.inlineCount > 0 ? 1 : 0;
    acc.inlineAssets += item.inlineCount;
    acc.inlineBytes += item.inlineBytes;
    acc.sceneBytes += item.sceneBytes;
    return acc;
  }, {
    records: 0,
    recordsWithInline: 0,
    inlineAssets: 0,
    inlineBytes: 0,
    sceneBytes: 0,
  });

  return {
    ...totals,
    largestInlineRecords: [...results]
      .filter((item) => item.inlineBytes > 0)
      .sort((a, b) => b.inlineBytes - a.inlineBytes)
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        updated_at: item.updated_at,
        inline_assets: item.inlineCount,
        inline_bytes: item.inlineBytes,
        scene_bytes: item.sceneBytes,
      })),
  };
}

async function fetchStandDesignRows(supabase, options) {
  const rows = [];
  let from = 0;
  const maxRows = options.limit > 0 ? options.limit : Number.POSITIVE_INFINITY;

  while (rows.length < maxRows) {
    const to = from + Math.min(PAGE_SIZE, maxRows - rows.length) - 1;
    let query = supabase
      .from('stand_designs')
      .select('id, concepts, updated_at')
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (options.recordId) {
      query = query.eq('id', options.recordId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < (to - from + 1) || options.recordId) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function migrateRecord(supabase, record, auditEntry, verbose = false) {
  if (!auditEntry.inlineCount) {
    return { migrated: false, bytesSaved: 0, assetCount: 0 };
  }

  const nextConcepts = (Array.isArray(record.concepts) ? structuredClone(record.concepts) : []);
  let migratedAssets = 0;
  let bytesSaved = 0;

  for (const ref of auditEntry.refs) {
    const concept = nextConcepts[ref.conceptIndex];
    if (!concept) continue;
    let target = null;
    let label = 'asset';

    if (ref.kind === 'concept') {
      target = concept;
      label = concept.id || `concept-${ref.conceptIndex + 1}`;
    } else if (ref.kind === 'view') {
      const viewIndex = Number.parseInt(ref.key.split('.')[1], 10);
      target = Array.isArray(concept.views) ? concept.views[viewIndex] : null;
      label = target?.angle || target?.id || `view-${viewIndex + 1}`;
    } else if (ref.kind === 'scene_render') {
      const renderIndex = Number.parseInt(ref.key.split('.')[1], 10);
      target = Array.isArray(concept.scene_renders) ? concept.scene_renders[renderIndex] : null;
      label = target?.label || target?.id || `scene-render-${renderIndex + 1}`;
    }

    if (!target || !isDataUrl(target.path)) continue;

    const extension = /image\/jpeg/i.test(target.mimeType || '') ? 'jpg' : /image\/webp/i.test(target.mimeType || '') ? 'webp' : 'png';
    const storagePath = [
      'migrated',
      record.id,
      concept.id || `concept-${ref.conceptIndex + 1}`,
      `${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'asset'}-${Date.now()}-${migratedAssets + 1}.${extension}`,
    ].join('/');

    const upload = await uploadInlineAsset(supabase, storagePath, target.path);
    target.path = upload.path;
    target.mimeType = upload.mimeType;
    migratedAssets += 1;
    bytesSaved += upload.estimatedBytes;

    if (verbose) {
      console.log(`Migrated ${record.id} -> ${storagePath} (${formatBytes(upload.estimatedBytes)})`);
    }
  }

  if (!migratedAssets) {
    return { migrated: false, bytesSaved: 0, assetCount: 0 };
  }

  const { error } = await supabase
    .from('stand_designs')
    .update({
      concepts: nextConcepts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  if (error) {
    throw new Error(`Failed to update stand_designs ${record.id}: ${error.message}`);
  }

  return {
    migrated: true,
    bytesSaved,
    assetCount: migratedAssets,
  };
}

async function maybeWriteOutput(outputPath, payload) {
  const clean = normalizeText(outputPath);
  if (!clean) return;
  await fs.writeFile(path.resolve(projectRoot, clean), JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = getSupabase();
  const rows = await fetchStandDesignRows(supabase, options);
  const results = rows.map(scanRecord);
  const summary = summarizeAudit(results);

  console.log(`Stand Design records scanned: ${summary.records}`);
  console.log(`Records with inline assets: ${summary.recordsWithInline}`);
  console.log(`Inline assets found: ${summary.inlineAssets}`);
  console.log(`Estimated inline payload: ${formatBytes(summary.inlineBytes)}`);
  console.log(`Estimated scene JSON payload: ${formatBytes(summary.sceneBytes)}`);

  if (summary.largestInlineRecords.length) {
    console.log('\nLargest inline records:');
    summary.largestInlineRecords.forEach((item) => {
      console.log(`- ${item.id}: ${formatBytes(item.inline_bytes)} across ${item.inline_assets} inline assets`);
    });
  }

  const outputPayload = { summary, results };

  if (options.migrate) {
    console.log(`\nMigrating inline assets to Supabase Storage bucket "${STORAGE_BUCKET}"...`);
    let migratedRecords = 0;
    let migratedAssets = 0;
    let bytesSaved = 0;

    for (const row of rows) {
      const auditEntry = results.find((item) => item.id === row.id);
      if (!auditEntry?.inlineCount) continue;
      const migration = await migrateRecord(supabase, row, auditEntry, options.verbose);
      if (migration.migrated) {
        migratedRecords += 1;
        migratedAssets += migration.assetCount;
        bytesSaved += migration.bytesSaved;
      }
    }

    outputPayload.migration = {
      migratedRecords,
      migratedAssets,
      bytesSaved,
      bytesSavedFormatted: formatBytes(bytesSaved),
      bucket: STORAGE_BUCKET,
    };

    console.log(`Migrated records: ${migratedRecords}`);
    console.log(`Migrated assets: ${migratedAssets}`);
    console.log(`Estimated bytes removed from DB payloads: ${formatBytes(bytesSaved)}`);
  } else {
    console.log('\nDry run only. Re-run with --migrate to upload inline assets to Supabase Storage and rewrite stand_designs rows.');
  }

  await maybeWriteOutput(options.output, outputPayload);
}

main().catch((error) => {
  console.error(`Stand design audit failed: ${error.message}`);
  process.exitCode = 1;
});

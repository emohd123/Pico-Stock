import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { EVENT_LAYOUT_ID, EventLayoutError, validateEventLayout, validateRevision, validateRevisionName } from './eventLayoutSchema.js';

export const EVENT_LAYOUT_BUCKET = 'event-layout-private';
const PROJECTS = 'event_layout_projects', REVISIONS = 'event_layout_revisions';
const privateRoot = () => path.join(process.cwd(), 'private', 'event-studio', 'rbc');
function assertSlug(slug) { if (slug !== EVENT_LAYOUT_ID) throw new EventLayoutError('Layout not found', 404); }
function client() {
  if (typeof window !== 'undefined') throw new Error('Event layout storage is server-only');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (url && key) return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new EventLayoutError('Layout cloud storage is not configured', 503);
  return null;
}
async function checked(query) {
  const { data, error } = await query;
  if (error) {
    if (error.code === 'P4090') throw new EventLayoutError('This layout was changed in another session. Reload before saving.', 409, { currentRevision: /^\d+$/.test(error.details || '') ? Number(error.details) : undefined });
    if (error.code === 'P4040') throw new EventLayoutError('Version not found', 404);
    console.error('Event layout storage:', error.code, error.message);
    throw new EventLayoutError('Layout storage is unavailable. Your changes have not been saved.', 503);
  }
  return data;
}
function projectResult(row, persistence) {
  return { scene: row.scene, revision: Number(row.revision), updatedAt: row.updated_at, persistence };
}
function revisionResult(row, includeScene = false) {
  return { revision: Number(row.revision), name: row.name, createdAt: row.created_at, kind: row.kind, restoredFrom: row.restored_from === null ? null : Number(row.restored_from), ...(includeScene ? { scene: row.scene } : {}) };
}
async function seedDocument(slug) {
  try { return validateEventLayout(JSON.parse(await fs.readFile(path.join(privateRoot(), 'site-seed.json'), 'utf8')), slug); }
  catch (error) { if (error instanceof EventLayoutError) throw error; throw new EventLayoutError('The initial site layout is not installed', 503); }
}
async function ensureProject(db, slug) {
  const existing = await checked(db.from(PROJECTS).select('*').eq('id', slug).maybeSingle());
  if (existing) return existing;
  return checked(db.rpc('event_layout_initialize', { p_id: slug, p_scene: await seedDocument(slug) }));
}

// This path is used only without cloud configuration on a local development server.
// The lock file serializes writers across local processes; atomic rename prevents partial JSON.
const localPath = () => path.join(process.env.EVENT_LAYOUT_LOCAL_DIR || path.join(process.cwd(), 'data', 'event-layouts'), `${EVENT_LAYOUT_ID}.json`);
async function localTransaction(callback) {
  const target = localPath(); await fs.mkdir(path.dirname(target), { recursive: true });
  const lock = `${target}.lock`; let handle;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { handle = await fs.open(lock, 'wx'); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  if (!handle) throw new EventLayoutError('A save is already in progress. Please retry.', 409);
  try {
    let state;
    try { state = JSON.parse(await fs.readFile(target, 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const timestamp = new Date().toISOString(), scene = await seedDocument(EVENT_LAYOUT_ID);
      state = { project: { id: EVENT_LAYOUT_ID, scene, revision: 0, updated_at: timestamp }, revisions: [{ project_id: EVENT_LAYOUT_ID, revision: 0, scene, name: 'Original site layout', kind: 'initial', created_at: timestamp, restored_from: null }] };
    }
    const result = await callback(state);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 }); await fs.rename(temporary, target); }
    finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
    return result;
  } finally { await handle.close(); await fs.rm(lock, { force: true }); }
}

export async function getEventLayout(slug = EVENT_LAYOUT_ID) {
  assertSlug(slug); const db = client();
  return db ? projectResult(await ensureProject(db, slug), 'supabase') : localTransaction(state => projectResult(state.project, 'local'));
}

export async function saveEventLayout(slug, { scene, expectedRevision, name, restoreRevision } = {}) {
  assertSlug(slug); validateRevision(expectedRevision); name = validateRevisionName(name);
  if (restoreRevision === undefined) validateEventLayout(scene, slug); else validateRevision(restoreRevision);
  const db = client();
  if (db) {
    await ensureProject(db, slug);
    const row = await checked(db.rpc('event_layout_save', { p_id: slug, p_expected_revision: expectedRevision, p_scene: restoreRevision === undefined ? scene : null, p_name: name, p_restore_revision: restoreRevision ?? null }));
    return projectResult(row, 'supabase');
  }
  return localTransaction(state => {
    if (state.project.revision !== expectedRevision) throw new EventLayoutError('This layout was changed in another session. Reload before saving.', 409, { currentRevision: state.project.revision });
    if (restoreRevision !== undefined) {
      const previous = state.revisions.find(r => r.revision === restoreRevision);
      if (!previous) throw new EventLayoutError('Version not found', 404); scene = previous.scene;
    }
    const revision = expectedRevision + 1, timestamp = new Date().toISOString();
    state.project = { ...state.project, scene, revision, updated_at: timestamp };
    state.revisions.push({ project_id: slug, revision, scene, name, kind: restoreRevision !== undefined ? 'restore' : name ? 'named' : 'autosave', created_at: timestamp, restored_from: restoreRevision ?? null });
    return projectResult(state.project, 'local');
  });
}

export async function getEventLayoutRevisions(slug, { before, limit = 100 } = {}) {
  assertSlug(slug); const db = client();
  if (before !== undefined) validateRevision(before);
  limit = Math.min(100, Math.max(1, Number(limit) || 100));
  if (db) {
    await ensureProject(db, slug);
    let query = db.from(REVISIONS).select('revision,name,created_at,kind,restored_from').eq('project_id', slug).order('revision', { ascending: false }).limit(limit);
    if (before !== undefined) query = query.lt('revision', before);
    return (await checked(query)).map(row => revisionResult(row));
  }
  return localTransaction(state => [...state.revisions].reverse().filter(r => before === undefined || r.revision < before).slice(0, limit).map(row => revisionResult(row)));
}

export async function getEventLayoutRevision(slug, revision) {
  assertSlug(slug); validateRevision(revision); const db = client();
  const row = db ? await checked(db.from(REVISIONS).select('*').eq('project_id', slug).eq('revision', revision).maybeSingle()) : await localTransaction(state => state.revisions.find(r => r.revision === revision));
  if (!row) throw new EventLayoutError('Version not found', 404);
  return revisionResult(row, true);
}

/**
 * Sizes as the Pico Stock product record publishes them, e.g. "… H79*D47*W51cm".
 * A depth on its own is a diameter, so a round table stays round. Centimetres to metres.
 */
export function catalogueDimensions(name) {
  const group = /((?:[HWDL]\s*\d+(?:\.\d+)?\s*[*x×]?\s*)+)cm/i.exec(String(name || ''));
  if (!group) return null;
  const found = {};
  for (const match of group[1].matchAll(/([HWDL])\s*(\d+(?:\.\d+)?)/gi)) found[match[1].toUpperCase()] = Number(match[2]) / 100;
  const width = found.W ?? found.L ?? found.D, depth = found.D ?? found.W ?? found.L;
  if (!found.H || !width || !depth) return null;
  return [Number(width.toFixed(3)), Number(found.H.toFixed(3)), Number(depth.toFixed(3))];
}

export async function getEventLayoutAssets() {
  let items;
  try {
    const registry = JSON.parse(await fs.readFile(path.join(privateRoot(), 'furniture-assets.json'), 'utf8'));
    items = registry.items || [];
  } catch { throw new EventLayoutError('The furniture asset catalogue is not installed', 503); }
  // Only what Pico Stock actually rents, at the size and stock its product record states.
  // The product store reaches for the site database; load it on demand so offline tooling
  // can still read the asset registry on its own.
  let products = [];
  try { const { getProducts } = await import('./store.js'); products = await getProducts(); } catch { products = []; }
  if (!products.length) return items;
  const byProduct = new Map(products.map(product => [String(product.id), product]));
  return items.filter(item => byProduct.has(String(item.productId))).map(item => {
    const product = byProduct.get(String(item.productId));
    const dimensions = catalogueDimensions(product.name);
    return {
      ...item,
      stock: product.stock ?? item.stock,
      ...(dimensions ? { dimensions, measurementStatus: 'catalogue', sourceDimensions: [product.name, product.description].filter(Boolean).join('\n') } : {}),
    };
  });
}

export async function getEventLayoutDownloads(slug) {
  assertSlug(slug); const db = client();
  if (!db) return [];
  const rows = await checked(db.from('event_layout_assets').select('asset_path,filename,size_bytes,metadata').eq('project_id', slug).order('asset_path'));
  return rows.filter(row => row.metadata?.download === true).map(row => ({
    name: row.filename, label: row.metadata.label || row.filename, bytes: Number(row.size_bytes),
    kind: row.metadata.kind || 'file', url: `/api/pico-ai/admin/event-layouts/${slug}/assets/${row.asset_path.split('/').map(encodeURIComponent).join('/')}`,
  }));
}

const MIME = { '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.blend': 'application/octet-stream', '.zip': 'application/zip', '.mp4': 'video/mp4' };
export async function getEventLayoutAsset(slug, assetPath) {
  assertSlug(slug);
  if (typeof assetPath !== 'string' || !assetPath || assetPath.includes('\\') || assetPath.split('/').some(part => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9._ -]+$/.test(part))) throw new EventLayoutError('Asset not found', 404);
  const extension = path.extname(assetPath).toLowerCase();
  if (!MIME[extension]) throw new EventLayoutError('Asset not found', 404);
  const root = path.resolve(privateRoot()), filename = path.resolve(root, assetPath);
  if (!filename.startsWith(`${root}${path.sep}`)) throw new EventLayoutError('Asset not found', 404);
  // Registered releases use immutable storage paths. Prefer that metadata even for
  // small JSON files so an atomic release switch cannot be shadowed by an older bundle.
  const db = client();
  if (db) {
    const asset = await checked(db.from('event_layout_assets').select('storage_path,content_type,filename').eq('project_id', slug).eq('asset_path', assetPath).maybeSingle());
    if (asset) {
      const signed = await checked(db.storage.from(EVENT_LAYOUT_BUCKET).createSignedUrl(asset.storage_path, 120, { download: asset.filename }));
      return { signedUrl: signed.signedUrl };
    }
  }
  try {
    const actual = await fs.realpath(filename);
    if (!actual.startsWith(`${root}${path.sep}`)) throw new EventLayoutError('Asset not found', 404);
    const stat = await fs.stat(actual);
    if (stat.size <= 4 * 1024 * 1024) return { bytes: await fs.readFile(actual), contentType: MIME[extension], filename: path.basename(filename) };
  } catch (error) { if (error instanceof EventLayoutError) throw error; if (error.code !== 'ENOENT') throw new EventLayoutError('Asset unavailable', 503); }
  throw new EventLayoutError('Asset not found or not yet uploaded', 404);
}

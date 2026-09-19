// Explicit phases: plan is read-only; stage uploads private immutable files;
// publish switches all changed metadata rows in one PostgREST upsert statement.
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';
import { canonicalLayoutValue } from '../lib/eventLayoutMerge.js';

dotenv.config({ path: '.env.local', quiet: true });
const [action, ...args] = process.argv.slice(2), options = {};
if (!['plan', 'stage', 'publish'].includes(action)) throw new Error('Usage: node scripts/release-event-layout-assets.mjs plan --release <name> [--manifest <file>] | stage --plan <file> | publish --plan <file>');
for (let i = 0; i < args.length; i += 1) {
  if (!['--release', '--manifest', '--plan'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${args[i]}`);
  options[args[i].slice(2)] = args[++i];
}
const BUCKET = 'event-layout-private', TABLE = 'event_layout_assets';
const MIME = { '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.blend': 'application/octet-stream', '.zip': 'application/zip', '.mp4': 'video/mp4' };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Cloud service configuration is required; no local fallback is used by a release.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const root = await realpath('private/event-studio/rbc');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fingerprint = rows => hash(JSON.stringify(canonicalLayoutValue(rows.map(({ updated_at, ...row }) => row).sort((a, b) => a.asset_path.localeCompare(b.asset_path)))));
const checked = async query => { const { data, error } = await query; if (error) throw new Error(error.message); return data; };
const currentRows = () => checked(db.from(TABLE).select('*').eq('project_id', EVENT_LAYOUT_ID));
function validateAssetPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9._ -]+$/.test(part))) throw new Error(`Invalid private asset path: ${value}`);
  if (!MIME[path.extname(value).toLowerCase()]) throw new Error(`Unsupported asset type: ${value}`);
  return value;
}
async function localBytes(assetPath) {
  validateAssetPath(assetPath);
  const actual = await realpath(path.resolve(root, assetPath));
  if (!actual.startsWith(`${root}${path.sep}`)) throw new Error('Private asset escaped its source directory.');
  return readFile(actual);
}
async function verifyStored(record) {
  const blob = await checked(db.storage.from(BUCKET).download(record.storage_path));
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length !== Number(record.size_bytes) || hash(bytes) !== record.metadata.sha256) throw new Error(`Stored bytes do not match: ${record.asset_path}`);
}
function checkPlan(plan) {
  if (plan.schemaVersion !== 1 || plan.eventId !== EVENT_LAYOUT_ID || plan.storageOrigin !== new URL(url).origin || !Array.isArray(plan.records) || !Array.isArray(plan.before)) throw new Error('Invalid release plan or wrong storage project.');
  const ids = new Set();
  for (const row of plan.records) {
    validateAssetPath(row.asset_path);
    if (ids.has(row.asset_path) || row.project_id !== EVENT_LAYOUT_ID || !/^[a-f0-9]{64}$/.test(row.metadata?.sha256) || !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 0) throw new Error('Invalid or duplicate release record.');
    ids.add(row.asset_path);
    const prior = plan.before.find(old => old.asset_path === row.asset_path);
    const unchanged = prior && prior.storage_path === row.storage_path && prior.metadata?.sha256 === row.metadata.sha256;
    if (!unchanged && row.storage_path !== `${EVENT_LAYOUT_ID}/sha256/${row.metadata.sha256}/${row.asset_path}`) throw new Error('New files must use their exact content hash storage path.');
  }
  if (fingerprint(plan.before) !== plan.beforeFingerprint) throw new Error('The recorded rollback snapshot changed.');
}
if (action === 'plan') {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,80}$/.test(options.release || '')) throw new Error('Provide a short release name containing letters, digits, periods, dashes or underscores.');
  const manifestPath = options.manifest || 'private/event-studio/rbc/delivery-manifest.json';
  const manifestBytes = await readFile(manifestPath), manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.eventId !== EVENT_LAYOUT_ID || !Array.isArray(manifest.files)) throw new Error('A final delivery manifest for this event is required.');
  const bundledManifest = await localBytes('delivery-manifest.json');
  if (!manifestBytes.equals(bundledManifest)) throw new Error('The manifest must match private/event-studio/rbc/delivery-manifest.json before planning.');
  const wanted = [...manifest.files, { path: 'delivery-manifest.json', bytes: manifestBytes.length, sha256: hash(manifestBytes) }];
  const before = await currentRows(), records = [], uploads = [];
  for (const file of wanted) {
    const bytes = await localBytes(file.path), sha256 = hash(bytes), ext = path.extname(file.path).toLowerCase();
    if (bytes.length !== file.bytes || sha256 !== file.sha256) throw new Error(`Stale manifest: ${file.path}. Regenerate the manifest after final artifacts are frozen.`);
    if (bytes.length > 50 * 1024 * 1024) throw new Error(`Asset exceeds the current 50 MB delivery limit: ${file.path}`);
    const old = before.find(row => row.asset_path === file.path);
    const reusable = old?.metadata?.sha256 === sha256 && Number(old.size_bytes) === bytes.length;
    const kind = ext === '.blend' ? 'blender' : ext === '.zip' ? 'library' : ext === '.mp4' ? 'video' : ext === '.glb' ? 'model' : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'image' : 'file';
    records.push({ project_id: EVENT_LAYOUT_ID, asset_path: file.path, storage_path: reusable ? old.storage_path : `${EVENT_LAYOUT_ID}/sha256/${sha256}/${file.path}`, filename: path.basename(file.path), content_type: MIME[ext], size_bytes: bytes.length, metadata: { ...old?.metadata, download: true, kind, label: old?.metadata?.label || path.basename(file.path, ext).replace(/[-_]/g, ' '), sha256, ...(!reusable ? { release: options.release } : {}) } });
    if (!reusable) uploads.push(file.path);
  }
  const plan = { schemaVersion: 1, eventId: EVENT_LAYOUT_ID, release: options.release, plannedAt: new Date().toISOString(), storageOrigin: new URL(url).origin, beforeFingerprint: fingerprint(before), before, records, uploads };
  checkPlan(plan);
  const folder = path.join('output/event-studio/photo-refresh/releases', options.release);
  await mkdir(folder, { recursive: true });
  const planPath = path.join(folder, 'asset-release.json');
  await writeFile(planPath, JSON.stringify(plan, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ action, planPath, files: records.length, uploadFiles: uploads.length, uploadBytes: records.filter(row => uploads.includes(row.asset_path)).reduce((sum, row) => sum + row.size_bytes, 0), cloudMutations: 0 }));
  process.exit(0);
}
if (!options.plan) throw new Error('Provide --plan <asset-release.json>.');
const planBytes = await readFile(options.plan), plan = JSON.parse(planBytes.toString('utf8'));
checkPlan(plan);
const folder = path.dirname(path.resolve(options.plan)), planSha256 = hash(planBytes);
const uploads = plan.records.filter(row => plan.uploads.includes(row.asset_path));
if (action === 'stage') {
  // Check every source before the first upload; no existing path is ever overwritten.
  for (const row of uploads) {
    const bytes = await localBytes(row.asset_path);
    if (hash(bytes) !== row.metadata.sha256 || bytes.length !== row.size_bytes) throw new Error(`Source changed after planning: ${row.asset_path}`);
  }
  for (const row of uploads) {
    const bytes = await localBytes(row.asset_path);
    if (hash(bytes) !== row.metadata.sha256) throw new Error(`Source changed while staging: ${row.asset_path}`);
    const { error } = await db.storage.from(BUCKET).upload(row.storage_path, bytes, { contentType: row.content_type, upsert: false, cacheControl: '31536000' });
    if (error && !([400, 409].includes(Number(error.statusCode)) && /already exists|duplicate/i.test(error.message))) throw new Error(`Stage failed for ${row.asset_path}: ${error.message}`);
    // Also verifies an immutable object already created by an interrupted prior run.
    await verifyStored(row);
    console.log(JSON.stringify({ staged: row.asset_path, bytes: row.size_bytes, sha256: row.metadata.sha256 }));
  }
  await writeFile(path.join(folder, 'staged-assets.json'), JSON.stringify({ planSha256, stagedAt: new Date().toISOString(), verifiedPaths: uploads.map(row => row.asset_path) }, null, 2));
  console.log(JSON.stringify({ action, staged: uploads.length, metadataChanged: false }));
  process.exit(0);
}
const staged = JSON.parse(await readFile(path.join(folder, 'staged-assets.json'), 'utf8'));
if (staged.planSha256 !== planSha256 || uploads.some(row => !staged.verifiedPaths.includes(row.asset_path))) throw new Error('All planned uploads must be staged and hash-verified first.');
const current = await currentRows();
const target = new Map(plan.before.map(row => [row.asset_path, row]));
for (const row of plan.records) target.set(row.asset_path, row);
if (fingerprint(current) === fingerprint([...target.values()])) {
  console.log(JSON.stringify({ action, alreadyPublished: true, files: plan.records.length }));
  process.exit(0);
}
if (fingerprint(current) !== plan.beforeFingerprint) throw new Error('Asset metadata changed since planning. No links were switched; create a new plan after reviewing the concurrent release.');
const timestamp = new Date().toISOString();
// One array upsert is one PostgreSQL statement/transaction: readers cannot see a partial batch.
// Use one release publisher; the preflight fingerprint is not a server-side compare-and-swap.
await checked(db.from(TABLE).upsert(plan.records.map(row => ({ ...row, updated_at: timestamp })), { onConflict: 'project_id,asset_path' }));
if (fingerprint(await currentRows()) !== fingerprint([...target.values()])) throw new Error('Post-publication metadata differs; inspect the release before retrying.');
await writeFile(path.join(folder, 'published-assets.json'), JSON.stringify({ release: plan.release, publishedAt: timestamp, files: plan.records.length, planSha256, previousAssetsPreserved: true }, null, 2));
console.log(JSON.stringify({ action, published: true, files: plan.records.length, previousStorageObjectsPreserved: true }));

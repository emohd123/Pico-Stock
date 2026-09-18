import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';
import { EVENT_LAYOUT_BUCKET, getEventLayout } from '../lib/eventLayoutStore.js';
dotenv.config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2), downloadable = !args.includes('--internal');
const paths = args.filter(arg => arg !== '--internal');
if (!paths.length) throw new Error('Usage: node scripts/upload-event-layout-assets.mjs [--internal] relative/path [...]; files must be under private/event-studio/rbc.');
const root = await realpath(path.join(process.cwd(), 'private/event-studio/rbc'));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const MIME = { '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.blend': 'application/octet-stream', '.zip': 'application/zip', '.mp4': 'video/mp4' };
await getEventLayout();
for (const relative of paths) {
  const local = await realpath(path.resolve(root, relative));
  if (!local.startsWith(`${root}${path.sep}`)) throw new Error('Asset must be inside the private event folder');
  const extension = path.extname(local).toLowerCase(), contentType = MIME[extension]; if (!contentType) throw new Error(`Unsupported asset type: ${extension}`);
  const assetPath = path.relative(root, local).split(path.sep).join('/'), storagePath = `${EVENT_LAYOUT_ID}/${assetPath}`, fileStat = await stat(local);
  const bytes=await readFile(local),sha256=createHash('sha256').update(bytes).digest('hex');
  const { error } = await db.storage.from(EVENT_LAYOUT_BUCKET).upload(storagePath, bytes, { contentType, upsert: true, cacheControl: '3600' });
  if (error) throw new Error(`Asset upload failed for ${assetPath}: ${error.message}`);
  const kind = extension === '.blend' ? 'blender' : extension === '.mp4' ? 'video' : ['.png', '.jpg', '.webp'].includes(extension) ? 'image' : extension === '.glb' ? 'model' : extension === '.zip' ? 'library' : 'file';
  const { error: metadataError } = await db.from('event_layout_assets').upsert({ project_id: EVENT_LAYOUT_ID, asset_path: assetPath, storage_path: storagePath, filename: path.basename(local), content_type: contentType, size_bytes: fileStat.size, metadata: { download: downloadable, kind, label: path.basename(local, extension).replace(/[-_]/g, ' '), sha256 }, updated_at: new Date().toISOString() }, { onConflict: 'project_id,asset_path' });
  if (metadataError) throw new Error(`Asset metadata failed for ${assetPath}: ${metadataError.message}`);
  console.log(JSON.stringify({ assetPath, bytes: fileStat.size, kind, downloadable, sha256 }));
}

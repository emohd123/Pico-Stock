import { getAdminCookieName, verifyAdminSessionToken } from './adminAuth.js';
import { EVENT_LAYOUT_ID, MAX_LAYOUT_BYTES, EventLayoutError } from './eventLayoutSchema.js';
import * as defaultStore from './eventLayoutStore.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
function cookieValue(request) {
  const name = getAdminCookieName();
  const raw = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : '';
}
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_LAYOUT_BYTES + 8192) throw new EventLayoutError('Request too large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new EventLayoutError('A JSON request body is required');
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > MAX_LAYOUT_BYTES + 8192) { await reader.cancel(); throw new EventLayoutError('Request too large', 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new EventLayoutError('Invalid JSON request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EventLayoutError('A JSON object is required');
  return body;
}

/** Dependency injection keeps authorization and conflict handling testable without a running server. */
export function createEventLayoutHandler(store = defaultStore) {
  return async function handleEventLayout(request, { params }) {
    try {
      if (!await verifyAdminSessionToken(cookieValue(request))) throw new EventLayoutError('Unauthorized', 401);
      const { slug, path: parts = [] } = await params;
      if (slug !== EVENT_LAYOUT_ID) throw new EventLayoutError('Layout not found', 404);
      const url = new URL(request.url), method = request.method;
      if (!['GET', 'HEAD'].includes(method)) {
        const origin = request.headers.get('origin');
        if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new EventLayoutError('Invalid origin', 403);
        if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new EventLayoutError('Content-Type must be application/json', 415);
      }
      if (parts.length === 0 && method === 'GET') {
        const [layout, assets, history] = await Promise.all([store.getEventLayout(slug), store.getEventLayoutAssets(), store.getEventLayoutRevisions(slug)]);
        return json({ ...layout, assets, history });
      }
      if (parts.length === 0 && method === 'PUT') {
        const body = await readBody(request);
        return json(await store.saveEventLayout(slug, { scene: body.scene, expectedRevision: body.expectedRevision, name: body.name }));
      }
      if (parts.length === 1 && parts[0] === 'revisions' && method === 'GET') {
        const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
        return json({ revisions: await store.getEventLayoutRevisions(slug, { before }) });
      }
      if (parts.length === 1 && parts[0] === 'downloads' && method === 'GET') return json({ files: await store.getEventLayoutDownloads(slug) });
      if (parts.length === 2 && parts[0] === 'revisions' && /^\d+$/.test(parts[1])) {
        const revision = Number(parts[1]);
        if (method === 'GET') return json(await store.getEventLayoutRevision(slug, revision));
        if (method === 'POST') {
          const body = await readBody(request);
          return json(await store.saveEventLayout(slug, { expectedRevision: body.expectedRevision, name: body.name || `Restored version ${revision}`, restoreRevision: revision }));
        }
      }
      if (parts.length === 1 && parts[0] === 'export' && method === 'GET') {
        const layout = await store.getEventLayout(slug);
        return new Response(JSON.stringify(layout.scene, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${slug}-v${layout.revision}.json"`, 'Cache-Control': 'private, no-store' } });
      }
      if (parts[0] === 'assets' && parts.length > 1 && method === 'GET') {
        const asset = await store.getEventLayoutAsset(slug, parts.slice(1).join('/'));
        if (asset.signedUrl) return new Response(null, { status: 302, headers: { Location: asset.signedUrl, 'Cache-Control': 'private, no-store' } });
        return new Response(asset.bytes, { headers: { 'Content-Type': asset.contentType, 'Content-Disposition': `inline; filename="${asset.filename.replace(/["\r\n]/g, '')}"`, 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
      }
      throw new EventLayoutError('Not found', 404);
    } catch (error) {
      if (!error.status) console.error('Event layout API:', error);
      return json({ error: error.status ? error.message : 'The layout request could not be completed', ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}) }, error.status || 500);
    }
  };
}

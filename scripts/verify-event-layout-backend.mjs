import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEventLayoutHandler } from '../lib/eventLayoutApi.js';
import { createAdminSessionToken } from '../lib/adminAuth.js';
import { EVENT_LAYOUT_ID, validateEventLayout } from '../lib/eventLayoutSchema.js';
import * as store from '../lib/eventLayoutStore.js';

const scene = {
  schemaVersion: 1, id: EVENT_LAYOUT_ID, name: 'Backend verification', units: 'm',
  site: { bounds: { minX: -286, maxX: 286, minZ: -141, maxZ: 141 }, metresPerPoint: .174835 },
  objects: [{ id: 'A1', name: 'Tent A1', kind: 'tent', position: [0, 0, 0], rotation: [0, .2, 0], dimensions: [12, 5, 12], color: '#ffffff', zoneId: 'A', metadata: { measurementStatus: 'mixed', sourceDimensions: '12000' } }],
  zones: [{ id: 'A', name: 'Zone A', position: [0, 0, 0], objectIds: ['A1'] }], views: [], tour: [],
};
const originalCwd = process.cwd(), originalEnv = { ...process.env };
const temporary = await mkdtemp(path.join(tmpdir(), 'pico-event-layout-test-'));
let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }
function altered(fn) { const value = structuredClone(scene); fn(value); return value; }
try {
  process.chdir(temporary);
  await mkdir('private/event-studio/rbc', { recursive: true });
  await writeFile('private/event-studio/rbc/site-seed.json', JSON.stringify(scene));
  await writeFile('private/event-studio/rbc/furniture-assets.json', JSON.stringify({ items: [{ id: 'test-asset' }] }));
  await writeFile('private/event-studio/rbc/site-plan.png', 'test-png');
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; delete process.env.VERCEL;
  process.env.NODE_ENV = 'test'; process.env.ADMIN_SESSION_SECRET = 'only-a-local-test-secret';
  const handler = createEventLayoutHandler(), token = await createAdminSessionToken();
  function request(method = 'GET', suffix = '', body, authenticated = true, extraHeaders = {}) {
    const headers = { ...(authenticated ? { cookie: `pico_admin_session=${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extraHeaders };
    return handler(new Request(`https://test.local/api/pico-ai/admin/event-layouts/${EVENT_LAYOUT_ID}${suffix}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), { params: { slug: EVENT_LAYOUT_ID, path: suffix.split('?')[0].split('/').filter(Boolean) } });
  }
  await test('schema preserves provenance and accepts real venue dimensions', () => assert.deepEqual(validateEventLayout(scene), scene));
  await test('schema rejects duplicate IDs, invalid transforms, negative dimensions, unknown zones and malformed polygons', () => {
    for (const change of [s => s.objects.push(s.objects[0]), s => s.objects[0].position[0] = NaN, s => s.objects[0].dimensions[0] = -1, s => s.objects[0].zoneId = 'missing', s => s.objects[0].points = [[0, 0]]]) assert.throws(() => validateEventLayout(altered(change)));
  });
  await test('anonymous requests cannot read layout, versions, export or private plan', async () => {
    for (const suffix of ['', '/revisions', '/export', '/assets/site-plan.png']) assert.equal((await request('GET', suffix, undefined, false)).status, 401);
  });
  await test('authenticated initial load returns scene, assets and initial revision', async () => {
    const response = await request(); assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.revision, 0); assert.equal(result.assets.length, 1); assert.equal(result.history[0].revision, 0); assert.equal(result.persistence, 'local');
  });
  await test('cross-origin writes are rejected before touching storage', async () => {
    const response = await request('PUT', '', { scene, expectedRevision: 0 }, true, { origin: 'https://other.local' }); assert.equal(response.status, 403);
  });
  await test('malformed request and unsupported content types are rejected', async () => {
    assert.equal((await request('PUT', '', null)).status, 400);
    assert.equal((await request('PUT', '', { scene, expectedRevision: 0 }, true, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await request('PUT', '', { scene, expectedRevision: -1 })).status, 400);
  });
  await test('simultaneous saves use optimistic revision control', async () => {
    const first = altered(s => { s.objects[0].position[0] = 12.34; });
    const responses = await Promise.all([request('PUT', '', { scene: first, expectedRevision: 0, name: 'Arranged tent' }), request('PUT', '', { scene, expectedRevision: 0 })]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const conflict = await responses.find(r => r.status === 409).json(); assert.equal(conflict.currentRevision, 1);
  });
  await test('saved scene survives a new read and local disk round trip', async () => {
    const saved = await store.getEventLayout(); assert.equal(saved.revision, 1);
    const disk = JSON.parse(await readFile(path.join(temporary, 'data/event-layouts', `${EVENT_LAYOUT_ID}.json`), 'utf8')); assert.deepEqual(saved.scene, disk.project.scene);
  });
  await test('restore creates a new revision and keeps the prior revision', async () => {
    const response = await request('POST', '/revisions/0', { expectedRevision: 1 }); assert.equal(response.status, 200);
    const restored = await response.json(); assert.equal(restored.revision, 2); assert.deepEqual(restored.scene, scene);
    const history = await (await request('GET', '/revisions')).json(); assert.equal(history.revisions.length, 3); assert.equal(history.revisions[0].restoredFrom, 0);
    assert.equal((await request('GET', '/revisions/1')).status, 200);
  });
  await test('missing restore leaves the saved revision unchanged', async () => {
    assert.equal((await request('POST', '/revisions/999', { expectedRevision: 2 })).status, 404); assert.equal((await store.getEventLayout()).revision, 2);
  });
  await test('private asset traversal is rejected and valid plan requires authentication', async () => {
    for (const name of ['../.env.local', 'nested/../../.env.local', 'C:\\secrets', 'file.js']) await assert.rejects(store.getEventLayoutAsset(EVENT_LAYOUT_ID, name), error => error.status === 404);
    const response = await request('GET', '/assets/site-plan.png'); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  });
  await test('registered private release takes precedence over an older bundled file', async () => {
    const originalFetch = globalThis.fetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://event-layout-test.invalid'; process.env.SUPABASE_SERVICE_KEY = 'local-test-key';
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url); calls.push(url.pathname);
      assert.equal(url.origin, 'https://event-layout-test.invalid');
      if (url.pathname.startsWith('/rest/v1/')) return Response.json({ storage_path: 'sha256/new/site-plan.png', filename: 'site-plan.png', content_type: 'image/png' });
      return Response.json({ signedURL: '/object/sign/event-layout-private/sha256/new/site-plan.png?token=unit-test' });
    };
    try {
      const asset = await store.getEventLayoutAsset(EVENT_LAYOUT_ID, 'site-plan.png');
      assert.ok(asset.signedUrl.includes('/sha256/new/site-plan.png')); assert.equal(asset.bytes, undefined); assert.equal(calls.length, 2);
    } finally { globalThis.fetch = originalFetch; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }
  });
  await test('unregistered private file still has the small-file local fallback', async () => {
    const originalFetch = globalThis.fetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://event-layout-test.invalid'; process.env.SUPABASE_SERVICE_KEY = 'local-test-key';
    globalThis.fetch = async () => Response.json([]);
    try { const asset = await store.getEventLayoutAsset(EVENT_LAYOUT_ID, 'site-plan.png'); assert.equal(asset.bytes.toString(), 'test-png'); }
    finally { globalThis.fetch = originalFetch; delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }
  });
  await test('export preserves metre units, exact transforms and provenance', async () => {
    const response = await request('GET', '/export'); assert.equal(response.status, 200); assert.deepEqual(await response.json(), scene);
  });
  await test('production refuses silently ephemeral local persistence', async () => {
    process.env.NODE_ENV = 'production'; await assert.rejects(store.getEventLayout(), error => error.status === 503); process.env.NODE_ENV = 'test';
  });
  console.log(JSON.stringify({ ok: true, tests: passed }));
} finally {
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  // Only the freshly created, resolved temporary test directory is removed.
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  await rm(temporary, { recursive: true, force: true });
}

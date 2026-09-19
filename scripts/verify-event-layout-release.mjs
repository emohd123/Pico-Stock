// Hermetic fake storage/REST service: exercises release writes without cloud credentials.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';
const run = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const directory = await mkdtemp(path.join(tmpdir(), 'pico-release-test-'));
const source = path.join(directory, 'private/event-studio/rbc'); await mkdir(source, { recursive: true });
const script = path.resolve('scripts/release-event-layout-assets.mjs');
const oldReadme = Buffer.from('old release'), newReadme = Buffer.from('new release'), seed = Buffer.from('{"unchanged":true}');
await writeFile(path.join(source, 'READ-ME.md'), newReadme); await writeFile(path.join(source, 'site-seed.json'), seed);
const wanted = [{ path: 'READ-ME.md', bytes: newReadme.length, sha256: hash(newReadme) }, { path: 'site-seed.json', bytes: seed.length, sha256: hash(seed) }];
await writeFile(path.join(source, 'delivery-manifest.json'), JSON.stringify({ eventId: EVENT_LAYOUT_ID, files: wanted }));
function row(name, bytes) { return { project_id: EVENT_LAYOUT_ID, asset_path: name, storage_path: `${EVENT_LAYOUT_ID}/${name}`, filename: name, content_type: name.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/json', size_bytes: bytes.length, metadata: { download: true, sha256: hash(bytes) }, updated_at: '2026-09-18T00:00:00Z' }; }
let rows = [row('READ-ME.md', oldReadme), row('site-seed.json', seed), row('historical-report.json', Buffer.from('{}'))];
const before = structuredClone(rows), storage = new Map([[rows[0].storage_path, oldReadme], [rows[1].storage_path, seed]]);
let uploadCalls = 0, upsertCalls = 0;
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const chunks = []; for await (const chunk of request) chunks.push(chunk); const body = Buffer.concat(chunks);
    if (url.pathname === '/rest/v1/event_layout_assets') {
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET') return response.end(JSON.stringify(rows));
      assert.equal(request.method, 'POST'); upsertCalls += 1;
      const updates = JSON.parse(body); assert.ok(Array.isArray(updates));
      const next = new Map(rows.map(value => [value.asset_path, value])); for (const update of updates) next.set(update.asset_path, update); rows = [...next.values()];
      response.statusCode = 201; return response.end('');
    }
    const prefix = '/storage/v1/object/event-layout-private/';
    assert.ok(url.pathname.startsWith(prefix)); const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (request.method === 'GET') { assert.ok(storage.has(key)); return response.end(storage.get(key)); }
    assert.equal(request.method, 'POST'); assert.equal(request.headers['x-upsert'], 'false');
    if (storage.has(key)) { response.statusCode = 400; response.setHeader('Content-Type', 'application/json'); return response.end(JSON.stringify({ statusCode: '400', message: 'Asset already exists', error: 'Duplicate' })); }
    uploadCalls += 1; storage.set(key, body); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ Key: key }));
  } catch (error) { response.statusCode = 500; response.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_KEY: 'hermetic-unit-test', NODE_NO_WARNINGS: '1' };
const command = args => run(process.execPath, [script, ...args], { cwd: directory, env, maxBuffer: 1024 * 1024 });
const planPath = path.join(directory, 'output/event-studio/photo-refresh/releases/test/asset-release.json');
let passed = 0; const pass = name => { passed += 1; console.log(`PASS ${name}`); };
try {
  await command(['plan', '--release', 'test']); assert.equal(uploadCalls, 0); assert.equal(upsertCalls, 0); pass('planning never writes storage or metadata');
  const plan = JSON.parse(await readFile(planPath, 'utf8')); assert.equal(plan.uploads.length, 2); assert.deepEqual(plan.before, before); pass('unchanged bytes are reused and prior metadata is retained for recovery');
  await command(['stage', '--plan', planPath]); assert.equal(uploadCalls, 2); assert.equal(upsertCalls, 0); assert.deepEqual(rows, before); assert.equal(storage.get(before[0].storage_path).toString(), oldReadme.toString()); pass('staging writes immutable paths while every live link and old object stays intact');
  await command(['stage', '--plan', planPath]); assert.equal(uploadCalls, 2); pass('interrupted staging can resume without overwriting immutable objects');
  rows[0].metadata.label = 'Concurrent release';
  await assert.rejects(command(['publish', '--plan', planPath]), error => error.stderr.includes('Asset metadata changed since planning')); assert.equal(upsertCalls, 0); rows = structuredClone(before); pass('concurrent metadata changes block publication');
  await command(['publish', '--plan', planPath]); assert.equal(upsertCalls, 1); assert.equal(rows.length, 4); assert.ok(rows.some(value => value.asset_path === 'historical-report.json')); assert.notEqual(rows.find(value => value.asset_path === 'READ-ME.md').storage_path, before[0].storage_path); pass('one bulk upsert switches all planned links and retains unmentioned assets');
  const repeated = await command(['publish', '--plan', planPath]); assert.ok(repeated.stdout.includes('alreadyPublished')); assert.equal(upsertCalls, 1); pass('an uncertain publication can be retried idempotently');
  await writeFile(path.join(source, 'READ-ME.md'), 'changed after planning');
  await assert.rejects(command(['stage', '--plan', planPath]), error => error.stderr.includes('Source changed after planning')); assert.equal(uploadCalls, 2); pass('changed source files fail before any upload');
  console.log(JSON.stringify({ passed, realCloudCalls: 0 }));
} finally {
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
}

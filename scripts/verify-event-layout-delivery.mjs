// Read-only verification of authenticated downloads against the exact delivery manifest.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { createAdminSessionToken, getAdminCookieName } from '../lib/adminAuth.js';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';

dotenv.config({ path: '.env.local', quiet: true });
const base = new URL(process.argv[2] || 'http://localhost:3120');
const prefix = `/api/pico-ai/admin/event-layouts/${EVENT_LAYOUT_ID}`;
// Optional Netscape cookie jar from `vercel curl ... -- -c <file>`.
// Only deployment-protection cookies are kept; anonymous application checks stay anonymous.
const protectionCookies = process.argv[3] ? (await readFile(process.argv[3], 'utf8')).split(/\r?\n/)
  .filter(line => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
  .map(line => line.replace(/^#HttpOnly_/, '').split('\t'))
  .filter(fields => fields.length >= 7 && fields[0].replace(/^\./, '') === base.hostname && /vercel/i.test(fields[5]))
  .map(fields => `${fields[5]}=${fields[6]}`).join('; ') : '';
const protectionHeaders = protectionCookies ? { cookie: protectionCookies } : {};
const headers = { cookie: [protectionCookies, `${getAdminCookieName()}=${await createAdminSessionToken()}`].filter(Boolean).join('; ') };
const manifest = JSON.parse(await readFile(process.argv[4] || 'private/event-studio/rbc/delivery-manifest.json', 'utf8'));
const anonymous = await fetch(new URL(`${prefix}/downloads`, base), { headers: protectionHeaders, redirect: 'manual' });
assert.equal(anonymous.status, 401, 'Download listing must require admin authentication');
const listing = await fetch(new URL(`${prefix}/downloads`, base), { headers, redirect: 'manual' });
assert.equal(listing.status, 200, 'Authenticated download listing must succeed');
const { files } = await listing.json();
const results = [];
for (const expected of manifest.files) {
  const entry = files.find(item => item.url === expected.url);
  assert.ok(entry, `Missing download listing: ${expected.path}`);
  assert.equal(entry.bytes, expected.bytes, `Metadata size mismatch: ${expected.path}`);
  assert.ok(entry.url.startsWith(`${prefix}/assets/`) && !entry.url.includes('token='), 'Listing must use stable authenticated routes');
  const denied = await fetch(new URL(entry.url, base), { headers: protectionHeaders, redirect: 'manual' });
  assert.equal(denied.status, 401, `Anonymous asset access allowed: ${expected.path}`);
  let response = await fetch(new URL(entry.url, base), { headers, redirect: 'manual' });
  let redirected = false;
  if (response.status === 302) {
    const signed = new URL(response.headers.get('location'));
    const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
    assert.equal(signed.origin, storageOrigin, 'Asset redirect must stay on the configured storage service');
    assert.ok(signed.pathname.includes('/storage/v1/object/sign/event-layout-private/'));
    // Do not forward the application admin cookie to the storage origin.
    response = await fetch(signed);
    redirected = true;
  }
  assert.equal(response.status, 200, `Download failed: ${expected.path}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, expected.bytes, `Downloaded size mismatch: ${expected.path}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `Downloaded hash mismatch: ${expected.path}`);
  results.push({ path: expected.path, bytes: bytes.length, authenticated: true, sha256Verified: true, redirected });
  console.log(JSON.stringify(results.at(-1)));
}
const report = { verifiedAt: new Date().toISOString(), host: base.origin, files: results, totalBytes: results.reduce((sum, item) => sum + item.bytes, 0) };
await mkdir('output/event-studio', { recursive: true });
await writeFile('output/event-studio/delivery-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: results.length, totalBytes: report.totalBytes, host: base.origin }));

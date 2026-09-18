import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(url && key && anonKey, 'Cloud verification needs configured Supabase service and anonymous keys');
const options = { auth: { persistSession: false, autoRefreshToken: false } }, db = createClient(url, key, options), anon = createClient(url, anonKey, options);
const id = `event-layout-verification-${randomUUID()}`;
const assetPath = `verification/${id}.json`;
const scene = { schemaVersion: 1, id, units: 'm', name: 'Temporary automated persistence verification', objects: [] };
async function checked(query) { const { data, error } = await query; if (error) throw new Error(`Cloud check failed: ${error.code} ${error.message}`); return data; }
try {
  const initial = await checked(db.rpc('event_layout_initialize', { p_id: id, p_scene: scene })); assert.equal(initial.revision, 0);
  const writes = await Promise.all([1, 2].map(n => db.rpc('event_layout_save', { p_id: id, p_expected_revision: 0, p_scene: { ...scene, name: `Concurrent save ${n}` }, p_name: 'Verification' })));
  assert.equal(writes.filter(r => !r.error).length, 1); assert.equal(writes.filter(r => r.error?.code === 'P4090').length, 1);
  const reload = await checked(db.from('event_layout_projects').select('*').eq('id', id).single()); assert.equal(reload.revision, 1);
  const restored = await checked(db.rpc('event_layout_save', { p_id: id, p_expected_revision: 1, p_scene: null, p_name: 'Verification restore', p_restore_revision: 0 })); assert.equal(restored.revision, 2); assert.deepEqual(restored.scene, scene);
  const history = await checked(db.from('event_layout_revisions').select('revision,kind,restored_from').eq('project_id', id).order('revision')); assert.equal(history.length, 3); assert.equal(history[2].restored_from, 0);
  for (const table of ['event_layout_projects', 'event_layout_revisions', 'event_layout_assets']) {
    const denied = await anon.from(table).select('*').limit(1); assert.ok(denied.error, `Anonymous access to ${table} must be denied`);
  }
  const deniedRpc = await anon.rpc('event_layout_initialize', { p_id: id, p_scene: scene }); assert.ok(deniedRpc.error, 'Anonymous initialization must be denied');
  const bucket = await checked(db.storage.getBucket('event-layout-private')); assert.equal(bucket.public, false);
  await checked(db.storage.from('event-layout-private').upload(assetPath, JSON.stringify({ verification: true }), { contentType: 'application/json' }));
  const anonymousFile = await anon.storage.from('event-layout-private').download(assetPath); assert.ok(anonymousFile.error, 'Anonymous file download must be denied');
  const signed = await checked(db.storage.from('event-layout-private').createSignedUrl(assetPath, 60));
  const downloaded = await fetch(signed.signedUrl); assert.equal(downloaded.status, 200); assert.deepEqual(await downloaded.json(), { verification: true });
  console.log(JSON.stringify({ ok: true, persistence: 'supabase', checks: ['initialize', 'concurrent-write-conflict', 'reload', 'restore-as-new-revision', 'revision-history', 'anonymous-table-denial', 'anonymous-rpc-denial', 'private-bucket', 'anonymous-asset-denial', 'signed-asset-download'], temporaryProjectRemovedAfterCheck: true }));
} finally {
  await checked(db.storage.from('event-layout-private').remove([assetPath]));
  await checked(db.from('event_layout_projects').delete().eq('id', id));
}

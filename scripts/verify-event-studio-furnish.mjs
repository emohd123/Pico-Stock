// Checks AI furnishing without calling a model: the layout engine, the built-in planner, the
// cleaning of model output and the API route. Run: node scripts/verify-event-studio-furnish.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describe, furnitureRole, tableShape, layoutPlan, auditLayout, plannerPlans, entranceEdge, polygonArea,
} from '../lib/eventStudioFurnish.js';
import { furnishTent, sanitisePlans, validateFurnishRequest } from '../lib/eventStudioFurnishAi.js';
import { tentFootprint, rectsOverlap } from '../lib/eventStudioLayout.js';
import { createEventLayoutHandler } from '../lib/eventLayoutApi.js';
import { createAdminSessionToken } from '../lib/adminAuth.js';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';

const scene = JSON.parse(readFileSync('private/event-studio/rbc/site-seed.json', 'utf8'));
const registry = JSON.parse(readFileSync('private/event-studio/rbc/furniture-assets.json', 'utf8'));
const assets = (registry.assets || registry.items).map(a => ({ ...a, stock: a.stock ?? 20 }));
const byId = new Map(assets.map(a => [String(a.productId), a]));
const tents = scene.objects.filter(o => o.kind === 'tent');
const usageOutside = tent => { const usage = {}; for (const o of scene.objects) if (o.kind === 'furniture' && o.metadata?.parentTentId !== tent.id) usage[o.productId] = (usage[o.productId] || 0) + 1; return usage; };
let tests = 0;
async function test(name, fn) { await fn(); tests += 1; console.log(`PASS ${name}`); }

await test('a stock code in the name never decides what a piece is', () => {
  const named = name => ({ name, dimensions: [.64, .73, .64], category: 'furniture' });
  assert.equal(describe(named('ID 4412 FSSOFADGREY [500] Armchair Dark Grey H73*D64*W64cm')), 'Armchair Dark Grey');
  assert.equal(furnitureRole(named('ID 4412 FSSOFADGREY [500] Armchair Dark Grey H73*D64*W64cm')), 'armchair');
  assert.equal(furnitureRole({ name: 'Soft Frame Sofa', dimensions: [2.2, .82, .9], category: 'furniture' }), 'sofa');
  assert.equal(furnitureRole({ name: 'ID 1417 FHBARTBL3 [73] High Table Black H90*D60cm', dimensions: [.6, .9, .6], category: 'furniture' }), 'high-table');
  assert.equal(tableShape({ name: 'ID 1413 FGRTBL4 [80] Meeting Table Glass H70*D80cm', dimensions: [.8, .7, .8] }), 'round', 'a lone D is a diameter');
  assert.equal(tableShape({ name: 'ID 1548 FWSTBL [76] Meeting Table White H75*D90*W90cm', dimensions: [.9, .75, .9] }), 'square');
  const roles = new Set(assets.map(furnitureRole));
  for (const role of ['sofa', 'armchair', 'chair', 'table', 'coffee-table', 'high-table', 'high-stool', 'console', 'office-chair', 'lamp', 'decor']) assert.ok(roles.has(role), `the catalogue offers ${role}`);
});

await test('every tent, every brief: pieces stay inside the walls, clear of each other and of the doorway', () => {
  const briefs = ['', 'VIP lounge for 20 guests with a bar', 'gala dinner for 60', 'cocktail party for 40', 'majlis for 16', 'presentation for 50'];
  let layouts = 0;
  for (const tent of tents) for (const brief of briefs) {
    const usage = usageOutside(tent), footprint = tentFootprint(tent), door = entranceEdge(footprint);
    for (const plan of plannerPlans({ brief, tent, assets, usage })) {
      const result = layoutPlan({ tent, plan, assets, usage });
      assert.deepEqual(auditLayout({ tent, placements: result.placements, assets }), [], `${tent.id} · ${plan.title}`);
      const doorway = { x: door.x, z: door.z - .3, width: Math.min(door.length, 1.2), depth: .6, angle: 0 };
      for (const p of result.placements.filter(q => !q.y)) {
        const a = byId.get(p.productId);
        assert.ok(!rectsOverlap({ x: p.x, z: p.z, width: a.dimensions[0], depth: a.dimensions[2], angle: p.angle }, doorway, 0), `${tent.id} · ${plan.title}: ${a.name} blocks the entrance`);
      }
      layouts += 1;
    }
  }
  assert.ok(layouts > 1500, `exercised ${layouts} layouts`);
});

await test('chairs face their table and the seat count is what was set out', () => {
  const tent = { id: 'T', kind: 'tent', position: [0, 0, 0], rotation: [0, 0, 0], dimensions: [12, 5, 12] };
  const table = assets.find(a => a.productId === 'wh-round-marble-dining-table'), chair = assets.find(a => a.productId === 'wh-white-rattan-back-chair');
  const result = layoutPlan({ tent, plan: { zones: [{ motif: 'dining-round', count: 1, products: { table: table.productId, chair: chair.productId } }] }, assets });
  const centre = result.placements.find(p => p.productId === table.productId), chairs = result.placements.filter(p => p.productId === chair.productId);
  assert.equal(chairs.length, 6, 'a 1.2 m round seats six');
  assert.equal(result.seats, 6);
  for (const c of chairs) {
    const towards = Math.atan2(centre.x - c.x, centre.z - c.z), off = Math.abs(Math.atan2(Math.sin(towards - c.angle), Math.cos(towards - c.angle)));
    assert.ok(off < .02, `a chair faces the table (off by ${off.toFixed(3)} rad)`);
  }
});

await test('stock is never exceeded, and a short item is reported', () => {
  const tent = tents.find(t => t.id === 'owners-enclosure'), sofa = 'wh-soft-frame-sofa';
  const usage = { [sofa]: byId.get(sofa).stock - 3 };
  const result = layoutPlan({ tent, plan: { zones: [{ motif: 'lounge', count: 8, products: { sofa, 'coffee-table': 'wh-sleek-gold-coffee-table', armchair: 'wh-cove-chair' } }] }, assets, usage });
  assert.equal(result.placements.filter(p => p.productId === sofa).length, 3, 'three sofas were left, three are used');
  assert.ok(result.notes.some(n => n.includes('Soft Frame Sofa')), 'the shortage is explained');
  for (const { productId, count } of result.counts) assert.ok(count <= byId.get(productId).stock - (usage[productId] || 0), `${productId} within stock`);
});

await test('pieces that stay are planned around, never on top of', () => {
  const tent = tents.find(t => t.id === 'corporate-lounge');
  const kept = [{ x: 0, z: 0, width: 3, depth: 3, angle: 0 }, { x: -6, z: -4, width: 2.2, depth: .9, angle: .4 }];
  for (const plan of plannerPlans({ brief: 'lounge for 30', tent, assets })) {
    const result = layoutPlan({ tent, plan, assets, kept });
    assert.deepEqual(auditLayout({ tent, placements: result.placements, assets, kept }), [], plan.title);
  }
});

await test('the tent keeps its size: the plan works in its own floor and never resizes it', async () => {
  const tent = structuredClone(tents.find(t => t.id === 'lounge-1')), before = JSON.stringify(tent);
  const { options } = await furnishTent({ ...validateFurnishRequest({ tent, brief: 'majlis for 20' }), assets, useModel: false });
  assert.equal(JSON.stringify(tent), before);
  assert.equal(options.length, 3, 'three options');
  assert.equal(new Set(options.map(o => o.placements.map(p => p.productId).sort().join())).size, 3, 'three different layouts');
  for (const o of options) assert.ok(o.placements.length && o.title && o.summary && Number.isFinite(o.seats));
});

await test('a floor too small for anything gets no option rather than a broken one', async () => {
  const tent = { id: 'tiny', name: 'Tiny', kind: 'tent', position: [0, 0, 0], rotation: [0, 0, 0], dimensions: [.9, 2, .9] };
  const { options } = await furnishTent({ ...validateFurnishRequest({ tent }), assets, useModel: false });
  for (const o of options) assert.deepEqual(auditLayout({ tent, placements: o.placements, assets }), []);
});

await test('model output is cleaned: unknown pieces, wrong roles and made-up arrangements do not get through', () => {
  const plans = sanitisePlans([
    { title: 'Good', summary: 'Fine.', zones: [{ motif: 'lounge', count: 2, products: { sofa: 'wh-soft-frame-sofa', 'coffee-table': 'wh-sleek-gold-coffee-table' } }] },
    { title: 'Wrong role', summary: 'A chair used as a sofa.', zones: [{ motif: 'lounge', count: 1, products: { sofa: 'wh-wishbone-chair', 'coffee-table': 'no-such-item' } }] },
    { title: 'Invented', summary: 'Nothing real.', zones: [{ motif: 'trampoline', products: { x: 'y' } }] },
  ], assets, {});
  assert.equal(plans.length, 2, 'the invented arrangement is dropped');
  assert.deepEqual(plans[0].zones[0].products, { sofa: 'wh-soft-frame-sofa', 'coffee-table': 'wh-sleek-gold-coffee-table' });
  assert.equal(furnitureRole(byId.get(plans[1].zones[0].products.sofa)), 'sofa', 'a wrong piece is replaced by a real sofa');
  assert.equal(furnitureRole(byId.get(plans[1].zones[0].products['coffee-table'])), 'coffee-table', 'an unknown id is replaced');
});

await test('the furnishing API is for signed-in staff, checks its input and uses the server catalogue', async () => {
  process.env.ADMIN_SESSION_SECRET = 'only-a-local-test-secret';
  const token = await createAdminSessionToken();
  let received = null;
  const handler = createEventLayoutHandler({ getEventLayoutAssets: async () => assets }, { furnish: async input => { received = input; return { options: [], source: 'planner' }; } });
  const call = (body, authenticated = true, headers = {}) => handler(new Request(`https://test.local/api/pico-ai/admin/event-layouts/${EVENT_LAYOUT_ID}/furnish`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { cookie: `pico_admin_session=${token}` } : {}), ...headers }, body: JSON.stringify(body),
  }), { params: { slug: EVENT_LAYOUT_ID, path: ['furnish'] } });
  const tent = tents.find(t => t.id === 'A1');
  assert.equal((await call({ tent }, false)).status, 401);
  assert.equal((await call({ tent }, true, { origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await call({ tent: { kind: 'tent', dimensions: [5, -1, 5] } })).status, 400);
  const ok = await call({ tent, brief: 'x'.repeat(2000), usage: { 'wh-soft-frame-sofa': 3, bad: -4 }, kept: [{ x: 0, z: 0, width: 1, depth: 1, angle: 0 }, { x: 'no' }] });
  assert.equal(ok.status, 200);
  assert.equal(received.assets, assets, 'the catalogue comes from the server, not the request');
  assert.equal(received.brief.length, 600, 'the brief is capped');
  assert.deepEqual(received.usage, { 'wh-soft-frame-sofa': 3 }, 'bad stock counts are dropped');
  assert.equal(received.kept.length, 1, 'malformed kept pieces are dropped');
  assert.deepEqual(received.tent.position, [0, 0, 0], 'the plan is made in the tent’s own frame');
});

await test('the booths get options that fit a 5 × 5 m floor with the door open', async () => {
  const tent = tents.find(t => t.id === 'A8');
  assert.ok(Math.abs(polygonArea(tentFootprint(tent)) - 25) < .5);
  const { options } = await furnishTent({ ...validateFurnishRequest({ tent, usage: usageOutside(tent) }), assets, useModel: false });
  assert.equal(options.length, 3);
  assert.ok(options.every(o => o.seats >= 2 && o.placements.length >= 3), 'each booth option seats people');
});

console.log(JSON.stringify({ ok: true, tests }));

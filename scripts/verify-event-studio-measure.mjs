import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measureSummary, snapCorners, formatLength, formatArea, pointName } from '../lib/eventStudioMeasure.js';

let tests = 0;
async function test(name, fn) { await fn(); tests++; console.log(`PASS ${name}`); }
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);

await test('a run is measured leg by leg, flat, with its total', () => {
  const summary = measureSummary([[0, 0, 0], [3, 0, 0], [3, 0, 4]]);
  assert.deepEqual(summary.legs.map(leg => leg.length), [3, 4]);
  near(summary.total, 7); assert.equal(summary.closed, false); assert.equal(summary.area, null);
});
await test('closing a run adds the leg home and the area inside, whichever way it was drawn', () => {
  for (const points of [[[0, 0, 0], [3, 0, 0], [3, 0, 4]], [[3, 0, 4], [3, 0, 0], [0, 0, 0]]]) {
    const summary = measureSummary(points, true);
    assert.deepEqual(summary.legs.map(leg => leg.length).sort((a, b) => a - b), [3, 4, 5]);
    near(summary.total, 12); near(summary.area, 6); assert.equal(summary.legs.at(-1).to, 0);
  }
  assert.equal(measureSummary([[0, 0, 0], [5, 0, 0]], true).closed, false, 'two points cannot close');
});
await test('a climb is kept apart from the flat length', () => {
  const [leg] = measureSummary([[0, 0, 0], [0, 5.55, 0]]).legs;
  near(leg.length, 0); near(leg.rise, 5.55, 1e-12);
  const [slope] = measureSummary([[0, 0, 0], [12, 1, 0]]).legs;
  near(slope.length, 12); near(slope.rise, 1);
});
await test('plan metres turn into ground metres with the site’s own factors', () => {
  const summary = measureSummary([[0, 0, 0], [100, 0, 0], [100, 0, 100]], false, { x: 1.0116, z: 1.017 });
  near(summary.total, 200); near(summary.groundTotal, 101.16 + 101.7, 1e-9);
});
await test('lengths and areas read to the centimetre, and points are lettered', () => {
  assert.equal(formatLength(5), '5.00 m'); assert.equal(formatLength(1234.567), '1,234.57 m'); assert.equal(formatArea(25), '25.0 m²');
  assert.equal(pointName(0), 'A'); assert.equal(pointName(25), 'Z'); assert.equal(pointName(26), 'P27');
});
await test('the ruler snaps to real corners: a 5 × 5 m booth measures 5.00 m a side, 25.0 m² inside', () => {
  const scene = JSON.parse(readFileSync('private/event-studio/rbc/site-seed.json', 'utf8'));
  const booth = scene.objects.find(o => o.metadata?.booth);
  const corners = snapCorners(scene).filter(c => c.id === booth.id).map(c => c.point);
  assert.equal(corners.length, 4);
  const sides = measureSummary(corners, true);
  for (const leg of sides.legs) near(leg.length, booth.dimensions[0], 1e-6);
  near(sides.area, booth.dimensions[0] * booth.dimensions[2], 1e-6);
  assert.ok(corners.every(p => Math.abs(p[1] - corners[0][1]) < 1e-9), 'the corners sit level, on the tent floor');
  const kinds = new Set(snapCorners(scene).map(c => scene.objects.find(o => o.id === c.id).kind));
  assert.deepEqual([...kinds].sort(), ['building', 'stage', 'tent']);
});

console.log(JSON.stringify({ ok: true, tests }));

import assert from 'node:assert/strict';
import { mergeEventLayoutCandidate, sameLayoutValue } from '../lib/eventLayoutMerge.js';
const baseline = { objects: [{ id: 'tent', position: [0, 0, 0], color: '#ffffff', metadata: { height: 4, source: 'plan' } }], zones: [], views: [], tour: [], site: { source: 'plan' } };
const copy = () => structuredClone(baseline);
let passed = 0;
function test(name, run) { run(); passed += 1; console.log(`PASS ${name}`); }
test('candidate appearance updates preserve a user move and new furniture', () => {
  const next = copy(), live = copy(); next.objects[0].color = '#eeeeee'; live.objects[0].position = [5, 0, 9]; live.objects.push({ id: 'user-chair', position: [6, 0, 9] });
  const result = mergeEventLayoutCandidate(baseline, next, live);
  assert.deepEqual(result.conflicts, []); assert.equal(result.scene.objects[0].color, '#eeeeee'); assert.deepEqual(result.scene.objects[0].position, [5, 0, 9]); assert.equal(result.scene.objects[1].id, 'user-chair');
});
test('two different moves conflict as one transform, without overwriting the live move', () => {
  const next = copy(), live = copy(); next.objects[0].position[0] = 3; live.objects[0].position[2] = 7;
  const result = mergeEventLayoutCandidate(baseline, next, live);
  assert.deepEqual(result.conflicts, ['/objects/tent/position']); assert.deepEqual(result.scene.objects[0].position, [0, 0, 7]);
});
test('independent nested metadata edits merge', () => {
  const next = copy(), live = copy(); next.objects[0].metadata.source = 'photo'; live.objects[0].metadata.notes = 'Client choice';
  const result = mergeEventLayoutCandidate(baseline, next, live);
  assert.deepEqual(result.conflicts, []); assert.deepEqual(result.scene.objects[0].metadata, { height: 4, source: 'photo', notes: 'Client choice' });
});
test('unchanged candidate preserves a user deletion', () => {
  const next = copy(), live = copy(); live.objects = [];
  const result = mergeEventLayoutCandidate(baseline, next, live); assert.deepEqual(result.conflicts, []); assert.equal(result.scene.objects.length, 0);
});
test('deleting an object modified by a user conflicts', () => {
  const next = copy(), live = copy(); next.objects = []; live.objects[0].color = '#ff0000';
  const result = mergeEventLayoutCandidate(baseline, next, live); assert.deepEqual(result.conflicts, ['/objects/tent']); assert.equal(result.scene.objects[0].color, '#ff0000');
});
test('identical concurrent edits need no conflict', () => {
  const next = copy(); next.objects[0].color = '#eeeeee';
  const result = mergeEventLayoutCandidate(baseline, next, structuredClone(next)); assert.deepEqual(result.conflicts, []); assert.deepEqual(result.scene, next);
});
test('different new objects with the same identity conflict', () => {
  const next = copy(), live = copy(); next.objects.push({ id: 'new', name: 'Reference' }); live.objects.push({ id: 'new', name: 'User furniture' });
  const result = mergeEventLayoutCandidate(baseline, next, live); assert.deepEqual(result.conflicts, ['/objects/new']); assert.equal(result.scene.objects[1].name, 'User furniture');
});
test('JSONB key ordering and signed zero do not invent changes', () => {
  assert.ok(sameLayoutValue({ x: -0, nested: { a: 1, b: 2 } }, { nested: { b: 2, a: 1 }, x: 0 }));
});
console.log(JSON.stringify({ passed }));

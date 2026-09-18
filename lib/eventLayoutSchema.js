export const EVENT_LAYOUT_ID = 'royal-bahrain-concours-2026';
export const MAX_LAYOUT_BYTES = 4 * 1024 * 1024;
const KINDS = new Set(['tent', 'building', 'tree', 'car', 'water', 'ground', 'path', 'stage', 'sign', 'furniture']);
const ROOFS = new Set(['pagoda', 'gable', 'hexagon', 'flat']);

export class EventLayoutError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message); this.name = 'EventLayoutError'; this.status = status; Object.assign(this, details);
  }
}

function requireValue(condition, message) { if (!condition) throw new EventLayoutError(message); }
function text(value, max = 200) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function vector(value, positive = false) {
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100000 && (!positive || n > 0));
}
function uniqueIds(values, name) {
  const ids = new Set();
  for (const value of values) {
    requireValue(value && text(value.id, 200), `${name} needs an identifier`);
    requireValue(!ids.has(value.id), `Duplicate ${name} identifier: ${value.id}`); ids.add(value.id);
  }
  return ids;
}

/** Validate the shared metre-based browser/Blender document without dropping provenance. */
export function validateEventLayout(scene, slug = EVENT_LAYOUT_ID) {
  requireValue(scene && typeof scene === 'object' && !Array.isArray(scene), 'A layout document is required');
  requireValue(scene.schemaVersion === 1 && scene.id === slug && scene.units === 'm', 'Unsupported layout schema, event, or units');
  requireValue(text(scene.name), 'A layout name is required');
  const bounds = scene.site?.bounds;
  requireValue(bounds && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => Number.isFinite(bounds[k]) && Math.abs(bounds[k]) <= 100000), 'Valid site bounds are required');
  requireValue(bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ, 'Site bounds must have positive width and depth');
  requireValue(Array.isArray(scene.objects) && scene.objects.length <= 20000, 'Layouts support up to 20,000 objects');
  requireValue(Array.isArray(scene.zones) && scene.zones.length <= 2000, 'Valid zones are required');
  requireValue(Array.isArray(scene.views) && scene.views.length <= 500 && Array.isArray(scene.tour) && scene.tour.length <= 500, 'Valid camera views and tour are required');
  const objectIds = uniqueIds(scene.objects, 'object'), zoneIds = uniqueIds(scene.zones, 'zone');
  for (const object of scene.objects) {
    requireValue(text(object.name) && KINDS.has(object.kind), `Invalid object: ${object.id}`);
    requireValue(vector(object.position) && vector(object.rotation) && vector(object.dimensions, true), `Invalid transform: ${object.id}`);
    requireValue(object.color === undefined || /^#[a-f0-9]{6}$/i.test(object.color), `Invalid colour: ${object.id}`);
    requireValue(object.roofType === undefined || ROOFS.has(object.roofType), `Invalid roof: ${object.id}`);
    requireValue(object.zoneId === undefined || zoneIds.has(object.zoneId), `Unknown zone: ${object.id}`);
    requireValue(object.locked === undefined || typeof object.locked === 'boolean', `Invalid lock state: ${object.id}`);
    requireValue(object.visible === undefined || typeof object.visible === 'boolean', `Invalid visibility: ${object.id}`);
    if (object.points !== undefined) requireValue(Array.isArray(object.points) && object.points.length >= 3 && object.points.length <= 10000 && object.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 100000)), `Invalid footprint: ${object.id}`);
  }
  for (const zone of scene.zones) {
    requireValue(text(zone.name) && vector(zone.position) && Array.isArray(zone.objectIds) && zone.objectIds.every(id => objectIds.has(id)), `Invalid zone: ${zone.id}`);
  }
  for (const key of ['views', 'tour']) {
    uniqueIds(scene[key], 'camera');
    for (const camera of scene[key]) requireValue(text(camera.name) && vector(camera.position) && vector(camera.target) && (camera.duration === undefined || (Number.isFinite(camera.duration) && camera.duration > 0 && camera.duration <= 3600)), `Invalid camera: ${camera.id}`);
  }
  let serialized;
  try { serialized = JSON.stringify(scene); } catch { throw new EventLayoutError('Layout must contain serializable JSON'); }
  requireValue(new TextEncoder().encode(serialized).length <= MAX_LAYOUT_BYTES, 'Layout exceeds the 4 MB limit');
  return scene;
}

export function validateRevision(value) {
  requireValue(Number.isSafeInteger(value) && value >= 0, 'expectedRevision must be a non-negative integer');
  return value;
}

export function validateRevisionName(value) {
  if (value === undefined || value === null || value === '') return null;
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120, 'Version names must contain 1–120 characters');
  return value.trim();
}

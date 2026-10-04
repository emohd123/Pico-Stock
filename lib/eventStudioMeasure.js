// The ruler's arithmetic, kept free of three.js so the studio panel can use it without the renderer.
import { tentFootprint, scaledFootprint, standingHeight, worldGroundPoint } from './eventStudioLayout.js';

const TENT_DECK = .12; // the level of the tent floor the renderer draws

/** A, B, C … for the points of a run, then P27, P28 … */
export const pointName = index => (index < 26 ? String.fromCharCode(65 + index) : `P${index + 1}`);
export const formatLength = metres => `${metres.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
export const formatArea = squareMetres => `${squareMetres.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;

/**
 * Lengths along a run of measured points [x, y, z]. Each leg is measured flat, the way a plan is
 * read, with its rise kept apart; `closed` adds the leg back to the first point and the area inside.
 * `ground` turns plan metres into metres on the ground, per axis, from the site's georeference.
 */
export function measureSummary(points, closed = false, ground = null) {
  const count = points.length, shape = closed && count > 2, legs = [];
  const sx = ground?.x || 1, sz = ground?.z || 1;
  for (let i = 0; i < (shape ? count : Math.max(0, count - 1)); i += 1) {
    const a = points[i], b = points[(i + 1) % count], dx = b[0] - a[0], dz = b[2] - a[2];
    legs.push({ from: i, to: (i + 1) % count, length: Math.hypot(dx, dz), ground: Math.hypot(dx * sx, dz * sz), rise: b[1] - a[1] });
  }
  let area = null;
  if (shape) {
    let twice = 0;
    points.forEach((a, i) => { const b = points[(i + 1) % count]; twice += a[0] * b[2] - b[0] * a[2]; });
    area = Math.abs(twice) / 2;
  }
  const sum = key => legs.reduce((total, leg) => total + leg[key], 0);
  return { count, closed: shape, legs, total: sum('length'), groundTotal: sum('ground'), area };
}

/** The corners of every tent, stage and building, at the level you would stand on there, for the ruler to snap to. */
export function snapCorners(scene) {
  const corners = [];
  for (const o of scene?.objects || []) {
    if (o.visible === false || !['tent', 'stage', 'building'].includes(o.kind)) continue;
    const level = (o.position?.[1] || 0) + standingHeight(scene, o) + (o.kind === 'tent' ? TENT_DECK : 0);
    for (const [lx, lz] of o.kind === 'tent' ? tentFootprint(o) : scaledFootprint(o)) {
      const [x, z] = worldGroundPoint(o, lx, lz);
      corners.push({ point: [x, level, z], id: o.id, name: o.name });
    }
  }
  return corners;
}

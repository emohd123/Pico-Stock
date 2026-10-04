// Furnishing plans for a tent. A plan names arrangements (a lounge set, a dining round, a bar) and the
// catalogue pieces to build them from; this module sets them out on the tent's own floor. It never
// resizes the tent: whatever does not fit is left out and reported. Pure maths, shared by the server
// (which may ask Claude for the plan) and the studio (which previews and applies the result).
import { tentFootprint, rectInsideFootprint, rectsOverlap } from './eventStudioLayout.js';

/** Arrangements a plan may ask for, and the catalogue roles each one is built from. */
export const MOTIFS = {
  lounge: { label: 'Lounge set', roles: ['sofa', 'coffee-table', 'armchair', 'side-table', 'lamp'] },
  'lounge-pair': { label: 'Facing sofas', roles: ['sofa', 'coffee-table', 'side-table', 'lamp'] },
  conversation: { label: 'Armchair circle', roles: ['armchair', 'coffee-table'] },
  'dining-round': { label: 'Dining round', roles: ['table', 'chair', 'decor'] },
  'dining-long': { label: 'Long dining table', roles: ['table', 'chair', 'decor'] },
  meeting: { label: 'Meeting table', roles: ['table', 'chair'] },
  cocktail: { label: 'Cocktail table', roles: ['high-table', 'high-stool'] },
  majlis: { label: 'Majlis seating', roles: ['sofa', 'coffee-table', 'pouffe', 'lamp'] },
  theatre: { label: 'Theatre rows', roles: ['chair'] },
  bar: { label: 'Bar', roles: ['bar', 'high-stool'] },
  reception: { label: 'Reception desk', roles: ['console', 'office-chair'] },
};

const has = (text, ...words) => words.some(word => text.includes(word));

/**
 * The words that describe a piece. Catalogue names carry stock codes ("ID 4412 FSSOFADGREY [500]
 * Armchair Dark Grey H73*D64*W64cm"), and a code like FSSOFA... must not make an armchair a sofa.
 */
export function describe(asset) {
  return String(asset?.name || '')
    .replace(/^ID\s+[\d\s;]+/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b[A-Z]{2,}[A-Z0-9]*\d*\b(?=\s)/g, word => (/^[A-Z]+$/.test(word) && word.length < 5 ? word : ' '))
    .replace(/\bH\s*\d+\s*\*.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a catalogue piece is for, read from its name and size. */
export function furnitureRole(asset) {
  const name = describe(asset).toLowerCase(), [w = 0, h = 0, d = 0] = asset?.dimensions || [];
  if (asset?.category === 'accessories') return has(name, 'lamp') ? 'lamp' : has(name, 'vase', 'pot', 'bowl') ? 'decor' : has(name, 'cushion') ? 'cushion' : 'accessory';
  if (has(name, 'coffee bar', 'bar station')) return 'bar';
  if (has(name, 'umbrella')) return 'umbrella-table';
  if (has(name, 'lounge set')) return 'lounge-set';
  if (has(name, 'high stool')) return 'high-stool';
  if (has(name, 'low stool')) return 'pouffe';
  if (has(name, 'high table', 'cocktail table')) return 'high-table';
  if (has(name, 'sofa', 'bench', 'arabic chair')) return 'sofa';
  if (has(name, 'pouffe chair', 'armchair', 'cove chair')) return 'armchair';
  if (has(name, 'ottoman')) return w >= 1 ? 'ottoman' : 'pouffe';
  if (has(name, 'pouffe', 'bean bag')) return 'pouffe';
  if (has(name, 'executive chair', 'revolving chair')) return 'office-chair';
  if (has(name, 'chair')) return 'chair';
  if (has(name, 'console')) return 'console';
  if (has(name, 'side table')) return 'side-table';
  if (has(name, 'coffee table', 'low table')) return w <= .6 && d <= .6 ? 'side-table' : 'coffee-table';
  if (has(name, 'dining table', 'meeting table')) return h >= .85 ? 'high-table' : 'table';
  return 'other';
}

/** Round, square or oblong. "D80cm" with no width is a diameter, as the catalogue writes it. */
export function tableShape(asset) {
  const name = describe(asset).toLowerCase(), source = String(asset?.sourceDimensions || asset?.name || '');
  const [w, , d] = asset.dimensions;
  if (name.includes('round')) return 'round';
  if (Math.abs(w - d) < .02 && /\bD\s*\d/i.test(source) && !/\bW\s*\d/i.test(source)) return 'round';
  return Math.abs(w - d) < .02 ? 'square' : 'oblong';
}

/** How many people a piece seats. */
export function seatsOf(asset) {
  const role = furnitureRole(asset);
  if (['chair', 'armchair', 'office-chair', 'high-stool', 'pouffe'].includes(role)) return 1;
  if (role === 'sofa') return Math.max(2, Math.floor(asset.dimensions[0] / .62));
  if (role === 'ottoman') return Math.max(1, Math.floor(asset.dimensions[0] / .62));
  return 0;
}

export function polygonArea(points) {
  let area = 0;
  points.forEach((a, i) => { const b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; });
  return Math.abs(area) / 2;
}

/** The entrance is the edge facing the tent's local front (+z), as the renderer draws it. */
export function entranceEdge(points) {
  const edges = points.map((a, i) => { const b = points[(i + 1) % points.length]; return { a, b, x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  return [...edges].sort((p, q) => Math.abs(q.z - p.z) < .01 ? q.x - p.x : q.z - p.z)[0];
}

// --- arrangements -------------------------------------------------------------------------------
// Each builder lays its pieces out around its own centre, front towards +z, and reports its extent.
// A piece is { asset, x, z, angle, y } where y is the height it stands at (0 on the floor).
const piece = (asset, x, z, angle = 0, y = 0) => ({ asset, x, z, angle, y });
const facing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const size = asset => ({ w: asset.dimensions[0], h: asset.dimensions[1], d: asset.dimensions[2] });

function around(table, chair, count) {
  const t = size(table), c = size(chair), pieces = [];
  if (tableShape(table) === 'round') {
    const radius = t.w / 2 + c.d / 2 - .06;
    for (let i = 0; i < count; i += 1) {
      const a = Math.PI + i * 2 * Math.PI / count, x = radius * Math.sin(a), z = radius * Math.cos(a);
      pieces.push(piece(chair, x, z, facing(x, z, 0, 0)));
    }
    return pieces;
  }
  // Oblong and square tables: the long sides first, then the ends when the plan wants more. Chairs
  // sit square to the table edge, the way they are set at a real table, not turned towards its middle.
  const long = t.w >= t.d, length = long ? t.w : t.d, breadth = long ? t.d : t.w, pitch = Math.max(.58, c.w + .04);
  const perSide = Math.max(1, Math.floor((length - .05) / pitch));
  const seats = [];
  for (const side of [-1, 1]) for (let i = 0; i < perSide; i += 1) {
    const along = (i - (perSide - 1) / 2) * Math.max(pitch, Math.min(.62, length / perSide)), out = side * (breadth / 2 + c.d / 2 - .06);
    const [x, z] = long ? [along, out] : [out, along];
    seats.push([x, z, long ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2)]);
  }
  if (breadth >= .74) for (const side of [-1, 1]) {
    const reach = side * (length / 2 + c.d / 2 - .04), [x, z] = long ? [reach, 0] : [0, reach];
    seats.push([x, z, facing(x, z, 0, 0)]);
  }
  for (const [x, z, angle] of seats.slice(0, count)) pieces.push(piece(chair, x, z, angle));
  return pieces;
}

export function tableCapacity(table, ends = true) {
  const t = size(table);
  if (tableShape(table) === 'round') return Math.max(2, Math.min(12, Math.floor(Math.PI * (t.w + .1) / .6)));
  const long = Math.max(t.w, t.d), breadth = Math.min(t.w, t.d);
  return 2 * Math.max(1, Math.floor((long - .05) / .58)) + (ends && breadth >= .74 ? 2 : 0);
}

const BUILD = {
  lounge(p) {
    const gap = .45, t = size(p['coffee-table']), s = size(p.sofa), pieces = [piece(p['coffee-table'], 0, 0)];
    const sofaZ = -(t.d / 2 + gap + s.d / 2);
    pieces.push(piece(p.sofa, 0, sofaZ, 0));
    if (p.armchair) {
      const a = size(p.armchair), ax = t.w / 2 + gap + a.d / 2;
      pieces.push(piece(p.armchair, -ax, 0, Math.PI / 2), piece(p.armchair, ax, 0, -Math.PI / 2));
    }
    if (p['side-table']) {
      const st = size(p['side-table']), sx = s.w / 2 + .06 + st.w / 2;
      pieces.push(piece(p['side-table'], sx, sofaZ));
      if (p.lamp) pieces.push(piece(p.lamp, sx, sofaZ, 0, st.h));
    }
    return pieces;
  },
  'lounge-pair'(p) {
    const gap = .45, t = size(p['coffee-table']), s = size(p.sofa), z = t.d / 2 + gap + s.d / 2;
    const pieces = [piece(p['coffee-table'], 0, 0), piece(p.sofa, 0, -z, 0), piece(p.sofa, 0, z, Math.PI)];
    if (p['side-table']) {
      const st = size(p['side-table']), sx = s.w / 2 + .06 + st.w / 2;
      pieces.push(piece(p['side-table'], sx, -z));
      if (p.lamp) pieces.push(piece(p.lamp, sx, -z, 0, st.h));
    }
    return pieces;
  },
  conversation(p) {
    const gap = .4, t = size(p['coffee-table']), a = size(p.armchair), pieces = [piece(p['coffee-table'], 0, 0)];
    const dx = t.w / 2 + gap + a.d / 2, dz = t.d / 2 + gap + a.d / 2;
    pieces.push(piece(p.armchair, 0, -dz, 0), piece(p.armchair, 0, dz, Math.PI), piece(p.armchair, -dx, 0, Math.PI / 2), piece(p.armchair, dx, 0, -Math.PI / 2));
    return pieces;
  },
  'dining-round'(p, seats) {
    const pieces = [piece(p.table, 0, 0), ...around(p.table, p.chair, Math.min(seats || tableCapacity(p.table), tableCapacity(p.table)))];
    if (p.decor) pieces.push(piece(p.decor, 0, 0, 0, size(p.table).h));
    return pieces;
  },
  'dining-long'(p, seats) {
    const pieces = [piece(p.table, 0, 0), ...around(p.table, p.chair, Math.min(seats || tableCapacity(p.table), tableCapacity(p.table)))];
    if (p.decor) pieces.push(piece(p.decor, 0, 0, 0, size(p.table).h));
    return pieces;
  },
  meeting(p, seats) {
    return [piece(p.table, 0, 0), ...around(p.table, p.chair, Math.min(seats || tableCapacity(p.table, false), tableCapacity(p.table, false)))];
  },
  cocktail(p, seats) {
    const t = size(p['high-table']), pieces = [piece(p['high-table'], 0, 0)];
    if (p['high-stool']) {
      const st = size(p['high-stool']), count = Math.max(0, Math.min(seats ?? 3, 4)), radius = t.w / 2 + st.d / 2 + .08;
      for (let i = 0; i < count; i += 1) {
        const a = Math.PI + i * 2 * Math.PI / count, x = radius * Math.sin(a), z = radius * Math.cos(a);
        pieces.push(piece(p['high-stool'], x, z, facing(x, z, 0, 0)));
      }
    }
    return pieces;
  },
};

/** The rectangle a group of pieces covers, around the group's own centre. */
function extent(pieces) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pieces) {
    if (p.y) continue;
    const { w, d } = size(p.asset), c = Math.abs(Math.cos(p.angle)), s = Math.abs(Math.sin(p.angle));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw); minZ = Math.min(minZ, p.z - hd); maxZ = Math.max(maxZ, p.z + hd);
  }
  return { w: maxX - minX, d: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

const rectOf = p => ({ x: p.x, z: p.z, width: p.asset.dimensions[0], depth: p.asset.dimensions[2], angle: p.angle });

/** Place a group at (x, z), turned by `turn`, in the tent's frame. */
function placeGroup(pieces, x, z, turn, centre) {
  const c = Math.cos(turn), s = Math.sin(turn);
  return pieces.map(p => {
    const lx = p.x - centre.cx, lz = p.z - centre.cz;
    return { ...p, x: x + lx * c + lz * s, z: z - lx * s + lz * c, angle: p.angle + turn };
  });
}

const TABLES = new Set(['table', 'high-table']), SEATING = new Set(['chair', 'armchair', 'high-stool', 'office-chair']);
// A chair is pushed in under its own table, so the two may share floor; nothing else may.
const tucked = (p, q) => (TABLES.has(furnitureRole(p.asset)) && SEATING.has(furnitureRole(q.asset))) || (TABLES.has(furnitureRole(q.asset)) && SEATING.has(furnitureRole(p.asset)));

/** Floor pieces that sit inside the tent, clear of each other and of everything already there. */
function fits(pieces, footprint, occupied, wall = .12) {
  const floor = pieces.filter(p => !p.y);
  return floor.every((p, i) => rectInsideFootprint(footprint, p.x, p.z, p.asset.dimensions[0], p.asset.dimensions[2], p.angle, wall)
    && !occupied.some(o => rectsOverlap(rectOf(p), o, .02))
    && !floor.slice(i + 1).some(q => !tucked(p, q) && rectsOverlap(rectOf(p), rectOf(q), 0)));
}

/**
 * Repeat a group in a tidy grid, the way a planner would set out lounge sets or dining rounds:
 * aisles between groups, a margin to the walls, and the rows filled from the back towards the door.
 * Returns one entry per group placed.
 */
function grid({ pieces, count, footprint, occupied, aisle = 1.1, wall = .35 }) {
  const box = extent(pieces), xs = footprint.map(p => p[0]), zs = footprint.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  let best = [];
  for (const gap of [aisle, aisle * .82]) {
    for (const turn of [0, Math.PI / 2]) {
      const cw = turn ? box.d : box.w, cd = turn ? box.w : box.d;
      const cols = Math.max(1, Math.floor((maxX - minX - 2 * wall + gap) / (cw + gap)));
      const rows = Math.max(1, Math.floor((maxZ - minZ - 2 * wall + gap) / (cd + gap)));
      for (const [sx, sz] of [[0, 0], [.5, 0], [0, .5], [.5, .5]]) {
        const groups = [], taken = [...occupied], cells = [];
        for (let r = -1; r <= rows; r += 1) for (let c = -1; c <= cols; c += 1)
          cells.push([(minX + maxX) / 2 + (c - (cols - 1) / 2 + sx) * (cw + gap), (minZ + maxZ) / 2 + (r - (rows - 1) / 2 + sz) * (cd + gap)]);
        cells.sort((a, b) => a[1] - b[1] || Math.abs(a[0] - (minX + maxX) / 2) - Math.abs(b[0] - (minX + maxX) / 2));
        for (const [x, z] of cells) {
          if (groups.length >= count) break;
          if (!rectInsideFootprint(footprint, x, z, cw, cd, 0, wall)) continue;
          if (taken.some(o => rectsOverlap({ x, z, width: cw, depth: cd, angle: 0 }, o, o.clear ?? gap / 2))) continue;
          const placed = placeGroup(pieces, x, z, turn, box);
          if (!fits(placed, footprint, taken, .1)) continue;
          groups.push(placed);
          taken.push({ x, z, width: cw, depth: cd, angle: 0 });
        }
        if (groups.length > best.length) best = groups;
        if (best.length >= count) return best;
      }
    }
  }
  // The grid wants room for every group at once. When it cannot place them all, slide each missing
  // group across the floor in small steps, back to front, and take the first spot that is clear.
  if (best.length < count) {
    const taken = [...occupied, ...best.map(group => {
      const e = extent(group.map(p => ({ ...p, x: p.x, z: p.z }))); return { x: e.cx, z: e.cz, width: e.w, depth: e.d, angle: 0 };
    })];
    const step = .2;
    for (let z = minZ + wall; z <= maxZ - wall && best.length < count; z += step) {
      for (let x = minX + wall; x <= maxX - wall && best.length < count; x += step) {
        for (const turn of [0, Math.PI / 2]) {
          const cw = turn ? box.d : box.w, cd = turn ? box.w : box.d, cx = x + cw / 2, cz = z + cd / 2;
          if (!rectInsideFootprint(footprint, cx, cz, cw, cd, 0, wall * .5)) continue;
          if (taken.some(o => rectsOverlap({ x: cx, z: cz, width: cw, depth: cd, angle: 0 }, o, o.clear ?? Math.min(.6, aisle / 2)))) continue;
          const placed = placeGroup(pieces, cx, cz, turn, box);
          if (!fits(placed, footprint, taken, .08)) continue;
          best.push(placed); taken.push({ x: cx, z: cz, width: cw, depth: cd, angle: 0 });
          break;
        }
      }
    }
  }
  return best;
}

function polygonSign(points) {
  let area = 0;
  points.forEach((a, i) => { const b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; });
  return area > 0 ? 1 : -1;
}
const seatCount = pieces => pieces.reduce((t, p) => t + (p.y ? 0 : seatsOf(p.asset)), 0);

/** Seats back to the walls, facing in: a majlis. The entrance wall stays open. One entry per seat. */
function majlis({ p, seats, footprint, occupied, wall = .12 }) {
  const units = [], entrance = entranceEdge(footprint), s = size(p.sofa), area = [...occupied], sign = polygonSign(footprint);
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    if (Math.abs((a[0] + b[0]) / 2 - entrance.x) < 1e-6 && Math.abs((a[1] + b[1]) / 2 - entrance.z) < 1e-6) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
    const nx = -uz * sign, nz = ux * sign; // inward normal
    const count = Math.floor((length - 2 * (s.d + .1) + .06) / (s.w + .06));
    for (let k = 0; k < count; k += 1) {
      if (seatCount(units.flat()) >= seats) break;
      const along = (k - (count - 1) / 2) * (s.w + .06), mx = (a[0] + b[0]) / 2 + ux * along, mz = (a[1] + b[1]) / 2 + uz * along;
      const x = mx + nx * (wall + s.d / 2), z = mz + nz * (wall + s.d / 2), angle = Math.atan2(nx, nz);
      const group = [piece(p.sofa, x, z, angle)];
      if (p['coffee-table']) { const t = size(p['coffee-table']), off = s.d / 2 + .42 + t.d / 2; group.push(piece(p['coffee-table'], x + nx * off, z + nz * off, angle)); }
      if (fits(group, footprint, area, .04)) { units.push(group); area.push(...group.map(rectOf)); }
    }
  }
  // Pouffes fill the open middle for extra guests, if the plan wants them.
  if (p.pouffe && seatCount(units.flat()) < seats)
    units.push(...grid({ pieces: [piece(p.pouffe, 0, 0)], count: Math.min(12, seats - seatCount(units.flat())), footprint, occupied: area, aisle: .9, wall: s.d + 1.2 }));
  return units;
}

/** Rows of chairs facing the back wall, where a speaker or screen stands, with a centre aisle. */
function theatre({ p, seats, footprint, occupied, wall = .4 }) {
  const c = size(p.chair), zs = footprint.map(q => q[1]), xs = footprint.map(q => q[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const stage = Math.min(3, (maxZ - minZ) * .25), pitch = c.d + .5, across = c.w + .08, aisle = maxX - minX > 7 ? 1.2 : 0;
  const units = [], taken = [...occupied], centre = (minX + maxX) / 2, half = (maxX - minX) / 2 - wall;
  for (let z = minZ + wall + stage + c.d / 2; z < maxZ - 1.6 && units.length < seats; z += pitch) {
    const perSide = Math.floor((half - aisle / 2 + .08) / across);
    const columns = aisle ? [...Array(perSide)].flatMap((_, i) => [centre - aisle / 2 - across * (i + .5), centre + aisle / 2 + across * (i + .5)])
      : [...Array(Math.floor(2 * half / across))].map((_, i) => centre - half + across * (i + .5));
    columns.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
    for (const x of columns) {
      if (units.length >= seats) break;
      const chair = piece(p.chair, x, z, Math.PI);
      if (fits([chair], footprint, taken, .1)) { units.push([chair]); taken.push(rectOf(chair)); }
    }
  }
  return units;
}

/** A bar against the back wall, stools along its front. */
function bar({ p, footprint, occupied, wall = .4 }) {
  const b = size(p.bar), zs = footprint.map(q => q[1]), xs = footprint.map(q => q[0]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  for (let z = Math.min(...zs) + wall + b.d / 2; z < Math.max(...zs); z += .25) {
    const group = [piece(p.bar, x, z, 0)];
    if (p['high-stool']) {
      const st = size(p['high-stool']), count = Math.max(0, Math.floor(b.w / .62) - 1);
      for (let i = 0; i < count; i += 1) group.push(piece(p['high-stool'], x + (i - (count - 1) / 2) * .62, z + b.d / 2 + st.d / 2 + .25, Math.PI));
    }
    if (fits(group, footprint, occupied, .1)) return [group];
  }
  return [];
}

/** A desk just inside the door, to one side, with its chair behind it facing the visitors. */
function reception({ p, footprint, occupied, wall = .3 }) {
  const desk = size(p.console), xs = footprint.map(q => q[0]), zs = footprint.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), maxZ = Math.max(...zs);
  for (const side of [-1, 1]) for (let inset = .6; inset < 5; inset += .2) {
    const x = side < 0 ? minX + wall + desk.w / 2 : maxX - wall - desk.w / 2, z = maxZ - inset - desk.d / 2;
    const group = [piece(p.console, x, z, 0)];
    if (p['office-chair']) group.push(piece(p['office-chair'], x, z - desk.d / 2 - size(p['office-chair']).d / 2 - .2, 0));
    if (fits(group, footprint, occupied, .1)) return [group];
  }
  return [];
}

const ORDER = { reception: 0, bar: 1, majlis: 2 };
// What a group cannot do without; anything else is dropped from the group when stock runs out.
const ESSENTIAL = {
  lounge: ['sofa'], 'lounge-pair': ['sofa'], conversation: ['armchair'], 'dining-round': ['table', 'chair'], 'dining-long': ['table', 'chair'],
  meeting: ['table', 'chair'], cocktail: ['high-table'], majlis: ['sofa', 'pouffe'], theatre: ['chair'], bar: ['bar'], reception: ['console'],
};
const SINGLE = new Set(['majlis', 'theatre', 'bar', 'reception']);

/**
 * Lay a plan out on a tent. `plan.zones` lists { motif, count, seats, products }, where products maps
 * each role to a catalogue id. Anchors (reception, bar) go first, then wall seating, then repeated
 * arrangements; the door and a strip inside it stay clear. An arrangement is placed whole or not at
 * all, so stock running out never leaves a table without its chairs.
 */
export function layoutPlan({ tent, plan, assets, kept = [], usage = {} }) {
  const footprint = tentFootprint(tent), byId = new Map(assets.map(a => [String(a.productId), a]));
  const entrance = entranceEdge(footprint), notes = [];
  const area = polygonArea(footprint), small = area < 40;
  const doorway = { x: entrance.x, z: entrance.z - (small ? .6 : .9), width: Math.min(entrance.length, Math.max(1.4, entrance.length * .4)), depth: small ? 1.2 : 1.8, angle: 0, clear: .15 };
  const occupied = [...kept.map(k => ({ ...k, clear: .45 })), doorway], placed = [], arrangements = [], used = new Map();
  const spacing = { aisle: small ? .7 : 1.15, wall: small ? .2 : .35 };
  const left = id => {
    const stock = Number(byId.get(id)?.stock);
    return (Number.isFinite(stock) ? stock : Infinity) - (usage[id] || 0) - (used.get(id) || 0);
  };
  const zones = (plan.zones || []).map((zone, index) => ({ zone, index }))
    .sort((a, b) => (ORDER[a.zone.motif] ?? 3) - (ORDER[b.zone.motif] ?? 3) || a.index - b.index).map(z => z.zone);
  for (const zone of zones) {
    const motif = MOTIFS[zone.motif];
    if (!motif) { notes.push(`Unknown arrangement "${zone.motif}" skipped.`); continue; }
    let products = Object.fromEntries(Object.entries(zone.products || {})
      .map(([role, id]) => [role, byId.get(String(id))]).filter(([role, a]) => a && motif.roles.includes(role)));
    const want = Math.max(1, Math.min(60, Math.round(Number(zone.count) || 1))), seats = Number(zone.seats) || undefined;
    const build = p => {
      if (zone.motif === 'majlis') return p.sofa ? majlis({ p, seats: seats || 40, footprint, occupied }) : null;
      if (zone.motif === 'theatre') return p.chair ? theatre({ p, seats: seats || want, footprint, occupied }) : null;
      if (zone.motif === 'bar') return p.bar ? bar({ p, footprint, occupied }) : null;
      if (zone.motif === 'reception') return p.console ? reception({ p, footprint, occupied }) : null;
      if (!BUILD[zone.motif] || !motif.roles.slice(0, 2).every(role => p[role] || (zone.motif === 'cocktail' && role === 'high-stool'))) return null;
      return grid({ pieces: BUILD[zone.motif](p, seats), count: want, footprint, occupied, aisle: zone.motif === 'cocktail' ? Math.min(.95, spacing.aisle) : spacing.aisle, wall: spacing.wall });
    };
    let units = build(products);
    if (units === null) { notes.push(`${motif.label} skipped: the pieces it is built from were not chosen.`); continue; }
    // Too big for this floor: try the most compact pieces of the same kind that are in stock, as a
    // planner would swap a three-seat sofa for a two-seater, and leave the extras out.
    if (!units.length) {
      const compact = {};
      for (const [role, asset] of Object.entries(products)) {
        if (['side-table', 'lamp', 'decor'].includes(role)) continue;
        const kind = furnitureRole(asset), round = ['table', 'high-table'].includes(kind) ? tableShape(asset) === 'round' : null;
        const smaller = assets.filter(a => furnitureRole(a) === kind && left(String(a.productId)) > 0 && (round === null || (tableShape(a) === 'round') === round))
          .sort((a, b) => a.dimensions[0] * a.dimensions[2] - b.dimensions[0] * b.dimensions[2])[0];
        compact[role] = smaller || asset;
      }
      const retry = build(compact);
      if (retry?.length) {
        const swaps = Object.entries(compact).filter(([role, a]) => a !== products[role]).map(([role, a]) => `${describe(a)} instead of ${describe(products[role])}`);
        const dropped = Object.keys(products).filter(role => !compact[role]).map(role => describe(products[role]));
        notes.push(`To fit the ${motif.label.toLowerCase()}: ${[...swaps, ...(dropped.length ? [`no ${dropped.join(' or ')}`] : [])].join('; ')}.`);
        units = retry; products = compact;
      }
    }
    let accepted = 0, acceptedSeats = 0;
    const short = new Set();
    const essential = new Set(ESSENTIAL[zone.motif] || []), roleOf = Object.fromEntries(Object.entries(products).map(([role, a]) => [String(a.productId), role]));
    for (let unit of units) {
      const count = list => { const need = new Map(); for (const p of list) need.set(String(p.asset.productId), (need.get(String(p.asset.productId)) || 0) + 1); return need; };
      let need = count(unit), missing = [...need].filter(([id, n]) => n > left(id));
      if (missing.length && missing.every(([id]) => !essential.has(roleOf[id]))) {
        for (const [id] of missing) short.add(id);
        unit = unit.filter(p => !missing.some(([id]) => id === String(p.asset.productId)));
        need = count(unit); missing = [...need].filter(([id, n]) => n > left(id));
      }
      if (missing.length) { for (const [id] of missing) short.add(id); continue; }
      for (const [id, n] of need) used.set(id, (used.get(id) || 0) + n);
      placed.push(...unit); occupied.push(...unit.filter(p => !p.y).map(rectOf)); accepted += 1; acceptedSeats += seatCount(unit);
    }
    for (const id of short) notes.push(`Not enough ${describe(byId.get(id))} in stock for every ${motif.label.toLowerCase()}.`);
    const bySeat = ['majlis', 'theatre'].includes(zone.motif);
    const requested = bySeat ? (seats || want) : SINGLE.has(zone.motif) ? 1 : want;
    arrangements.push({ motif: zone.motif, label: motif.label, unit: bySeat ? 'seats' : 'groups', requested, placed: bySeat ? acceptedSeats : SINGLE.has(zone.motif) ? Math.min(1, accepted) : accepted });
    if (!accepted) notes.push(`${motif.label} does not fit on this floor with clear aisles.`);
    else if (!SINGLE.has(zone.motif) && accepted < want) notes.push(`${accepted} of ${want} ${motif.label.toLowerCase()}s fit with clear aisles.`);
  }
  const counts = [...used].map(([id, count]) => ({ productId: id, name: describe(byId.get(id)), count, stock: byId.get(id).stock ?? null }));
  return {
    placements: placed.map(p => ({ productId: String(p.asset.productId), x: +p.x.toFixed(3), z: +p.z.toFixed(3), angle: +p.angle.toFixed(4), y: +p.y.toFixed(3) })),
    seats: seatCount(placed), counts, arrangements, notes,
    floorArea: +polygonArea(footprint).toFixed(1),
  };
}

/** Check a finished layout the way a site manager would: inside the walls, nothing overlapping. */
export function auditLayout({ tent, placements, assets, kept = [] }) {
  const footprint = tentFootprint(tent), byId = new Map(assets.map(a => [String(a.productId), a])), problems = [];
  const floor = placements.filter(p => !p.y).map(p => ({ ...p, asset: byId.get(p.productId) }));
  floor.forEach((p, i) => {
    if (!p.asset) { problems.push(`unknown product ${p.productId}`); return; }
    if (!rectInsideFootprint(footprint, p.x, p.z, p.asset.dimensions[0], p.asset.dimensions[2], p.angle, 0)) problems.push(`${p.asset.name} crosses the tent wall`);
    for (const q of floor.slice(i + 1)) if (q.asset && !tucked(p, q) && rectsOverlap(rectOf(p), rectOf(q), 0)) problems.push(`${p.asset.name} overlaps ${q.asset.name}`);
    for (const k of kept) if (rectsOverlap(rectOf(p), k, 0)) problems.push(`${p.asset.name} overlaps existing furniture`);
  });
  return problems;
}

// --- the built-in planner -----------------------------------------------------------------------
// Used when no AI model is configured, or when the model does not answer in time. It reads the
// brief for a guest count and a style, then offers three contrasting layouts built from what is in
// stock, splitting a large order across matching pieces when one model runs short.

const PREFER = {
  sofa: ['wh-soft-frame-sofa', 'wh-soft-arch-sofa', 'wh-straight-off-white-sofa-short', 'wh-straight-off-white-sofa-long'],
  armchair: ['prod-1773061941304-2aleu', 'wh-cove-chair', 'prod-1514-fssofagry2', 'wh-leaf-pouffe-chair', 'prod-1773061941304-wa6zb'],
  'coffee-table': ['wh-sleek-gold-coffee-table', 'wh-oval-travertine-coffee-table', 'wh-rectangle-and-square-gold-x-glass-coffee-table-set', 'prod-1773061941304-nsl06'],
  'side-table': ['wh-gold-side-table', 'prod-1773061941304-181rc'],
  lamp: ['wh-silver-table-lamp', 'wh-crystal-table-lamp'],
  decor: ['wh-tall-classic-gold-vase', 'wh-glass-and-silver-bowl-stand', 'wh-classic-crystal-vase', 'wh-black-crystal-vase'],
  table: ['wh-round-marble-dining-table', 'wh-white-engraved-round-dining-table', 'wh-glass-top-dining-table', 'prod-1773061941304-bvjtw', 'prod-1548-fwstbl', 'prod-1773061941304-l2qbw'],
  chair: ['wh-white-rattan-back-chair', 'wh-wishbone-chair', 'wh-curve-back-chair', 'wh-banquet-chair', 'prod-1773061941304-lwd2x'],
  'high-table': ['prod-1773061941304-da7fb', 'prod-1773061941304-14xu6', 'wh-cocktail-table'],
  'high-stool': ['prod-1773061941304-wdnl7', 'prod-1773061941304-nmt20', 'prod-1435-fhswht04'],
  pouffe: ['wh-gold-lined-pouffe', 'wh-layered-pouffe', 'wh-linen-pouffe'],
  bar: ['wh-coffee-bar-station'],
  console: ['prod-1773061941304-2a65k', 'wh-arch-side-console-table'],
  'office-chair': ['prod-1773061941304-sye77', 'prod-1773061941304-8d54j'],
};

const stockOf = asset => { const stock = Number(asset?.stock); return Number.isFinite(stock) ? stock : 999; };

/** The preferred piece for a role that has the stock, else the best-stocked piece of that role. */
export function pickProduct(role, assets, { need = 1, usage = {}, filter = () => true, prefer = PREFER[role] || [] } = {}) {
  const candidates = assets.filter(a => furnitureRole(a) === role && filter(a));
  const left = a => stockOf(a) - (usage[String(a.productId)] || 0);
  const ranked = [...candidates].sort((a, b) => {
    const pa = prefer.indexOf(String(a.productId)), pb = prefer.indexOf(String(b.productId));
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || left(b) - left(a);
  });
  return ranked.find(a => left(a) >= need) || [...candidates].sort((a, b) => left(b) - left(a)).find(a => left(a) > 0) || null;
}

export function readBrief(brief = '') {
  const text = String(brief).toLowerCase();
  const number = text.match(/(\d{1,3})\s*(?:guests?|people|persons?|pax|seats?|covers?|delegates?|visitors?|vips?|members?)?/);
  const guests = number ? Math.min(400, Math.max(1, Number(number[1]))) : null;
  const style = has(text, 'majlis', 'arabic', 'traditional', 'sheikh', 'royal') ? 'majlis'
    : has(text, 'dinner', 'dining', 'lunch', 'gala', 'banquet', 'breakfast', 'meal', 'brunch') ? 'dining'
      : has(text, 'cocktail', 'standing', 'networking', 'drinks', 'mingle') ? 'cocktail'
        : has(text, 'presentation', 'theatre', 'theater', 'talk', 'seminar', 'screening', 'briefing', 'auction', 'press') ? 'theatre'
          : has(text, 'meeting', 'workshop', 'office', 'interview', 'sales', 'consult') ? 'meeting'
            : has(text, 'lounge', 'vip', 'relax', 'hospitality', 'chill', 'seating', 'sofa') ? 'lounge' : null;
  return {
    guests, style,
    bar: has(text, 'bar', 'coffee', 'drinks', 'beverage', 'refresh'),
    reception: has(text, 'reception', 'welcome', 'desk', 'registration', 'host', 'check-in', 'check in'),
  };
}

/** Stock already spoken for, so three alternatives each start from the same shelves. */
function shelf(assets, usage) {
  const planned = { ...usage }, byId = new Map(assets.map(a => [String(a.productId), a]));
  const left = id => stockOf(byId.get(String(id))) - (planned[String(id)] || 0);
  const take = (id, n) => { if (id) planned[String(id)] = (planned[String(id)] || 0) + n; };
  const pick = (role, need, filter) => pickProduct(role, assets, { need, usage: planned, filter })?.productId;
  return { planned, left, take, pick, byId };
}

/**
 * Arrangements of one kind, `groups` of them, split across matching pieces as each runs short.
 * `make(shelf, n)` returns { zone, per } where per maps product ids to pieces per group.
 */
function split(s, groups, make, limit = 4) {
  const zones = [];
  for (let remaining = groups; remaining > 0 && zones.length < limit;) {
    const trial = make(s, remaining);
    if (!trial) break;
    const fit = Math.min(remaining, ...Object.entries(trial.per).map(([id, n]) => Math.floor(s.left(id) / n)));
    if (fit < 1) break;
    const { zone, per } = make(s, fit) || trial;
    zone.count = fit;
    for (const [id, n] of Object.entries(per)) s.take(id, n * fit);
    zones.push(zone); remaining -= fit;
  }
  return zones;
}

export function plannerPlans({ brief, tent, assets, usage = {} }) {
  const footprint = tentFootprint(tent), area = polygonArea(footprint), read = readBrief(brief), small = area < 40;
  const round = a => tableShape(a) === 'round', oblong = a => tableShape(a) === 'oblong';
  const density = { lounge: 5.5, dining: 1.5, cocktail: 1.1, theatre: .9, meeting: 3, majlis: 3 };
  const guestsFor = style => read.guests || Math.max(4, Math.min(120, Math.round(area / (density[style] || 5))));

  const lounge = (s, groups, options = {}) => split(s, groups, (sh, n) => {
    const sofa = sh.pick('sofa', n, options.sofa), table = sh.pick('coffee-table', n, options.table);
    if (!sofa || !table) return null;
    const armchair = sh.pick('armchair', 2 * n, options.armchair);
    const side = options.compact ? null : sh.pick('side-table', n), lamp = side ? sh.pick('lamp', n) : null;
    const products = { sofa, 'coffee-table': table, ...(armchair ? { armchair } : {}), ...(side ? { 'side-table': side } : {}), ...(lamp ? { lamp } : {}) };
    const per = { [sofa]: 1, [table]: 1, ...(armchair ? { [armchair]: 2 } : {}), ...(side ? { [side]: 1 } : {}), ...(lamp ? { [lamp]: 1 } : {}) };
    return { zone: { motif: 'lounge', count: n, products }, per };
  });
  const dining = (s, seats, shape) => {
    const sample = pickProduct('table', assets, { usage: s.planned, filter: shape === 'round' ? round : oblong });
    const perTable = sample ? tableCapacity(sample) : 6;
    return split(s, Math.ceil(seats / perTable), (sh, n) => {
      const table = sh.pick('table', n, shape === 'round' ? round : oblong);
      if (!table) return null;
      const capacity = tableCapacity(sh.byId.get(table)), chair = sh.pick('chair', n * capacity), decor = sh.pick('decor', n);
      if (!chair) return null;
      return { zone: { motif: shape === 'round' ? 'dining-round' : 'dining-long', count: n, seats: capacity, products: { table, chair, ...(decor ? { decor } : {}) } }, per: { [table]: 1, [chair]: capacity, ...(decor ? { [decor]: 1 } : {}) } };
    });
  };
  const cocktail = (s, guests, stools = 3) => split(s, Math.ceil(guests / 4), (sh, n) => {
    const table = sh.pick('high-table', n), stool = stools ? sh.pick('high-stool', n * stools) : null;
    if (!table) return null;
    return { zone: { motif: 'cocktail', count: n, seats: stool ? stools : 0, products: { 'high-table': table, ...(stool ? { 'high-stool': stool } : {}) } }, per: { [table]: 1, ...(stool ? { [stool]: stools } : {}) } };
  });
  const meeting = (s, guests, seatsEach = 4, filter) => split(s, Math.ceil(guests / seatsEach), (sh, n) => {
    const table = sh.pick('table', n, filter), chair = sh.pick('chair', n * seatsEach);
    if (!table || !chair) return null;
    return { zone: { motif: 'meeting', count: n, seats: seatsEach, products: { table, chair } }, per: { [table]: 1, [chair]: seatsEach } };
  });
  const theatre = (s, seats) => split(s, seats, (sh, n) => {
    const chair = sh.pick('chair', n, a => furnitureRole(a) === 'chair' && a.dimensions[0] <= .6);
    return chair ? { zone: { motif: 'theatre', count: n, seats: n, products: { chair } }, per: { [chair]: 1 } } : null;
  }).map(zone => ({ ...zone, seats: zone.count }));
  // Wall seating needs a sofa that fits the walls it backs onto, with room to turn the corners.
  const entrance = entranceEdge(footprint);
  const walls = footprint.map((a, i) => [a, footprint[(i + 1) % footprint.length]]).filter(([a, b]) => Math.abs((a[0] + b[0]) / 2 - entrance.x) > 1e-6 || Math.abs((a[1] + b[1]) / 2 - entrance.z) > 1e-6);
  const longestWall = Math.max(...walls.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])));
  const majlis = (s, seats, withPouffes) => {
    const sofa = s.pick('sofa', 4, a => a.dimensions[0] >= 1.3 && a.dimensions[0] <= longestWall - 2 * (a.dimensions[2] + .1)), table = s.pick('coffee-table', 4), pouffe = withPouffes ? s.pick('pouffe', 6) : null;
    return sofa ? [{ motif: 'majlis', seats, products: { sofa, ...(table ? { 'coffee-table': table } : {}), ...(pouffe ? { pouffe } : {}) } }] : [];
  };
  const anchors = s => {
    const zones = [];
    if ((read.reception || small) && area >= 12) {
      const desk = s.pick('console', 1), chair = s.pick('office-chair', 1);
      if (desk) { s.take(desk, 1); s.take(chair, 1); zones.push({ motif: 'reception', count: 1, products: { console: desk, ...(chair ? { 'office-chair': chair } : {}) } }); }
    }
    if (read.bar && area >= 40) {
      const station = s.pick('bar', 1);
      if (station && s.left(station) > 0) { const stool = s.pick('high-stool', 4); s.take(station, 1); s.take(stool, 4); zones.push({ motif: 'bar', count: 1, products: { bar: station, ...(stool ? { 'high-stool': stool } : {}) } }); }
    }
    return zones;
  };
  const option = (title, summary, build, { desk = true } = {}) => { const s = shelf(assets, usage); return { title, summary, zones: [...(desk ? anchors(s) : []), ...build(s)] }; };

  if (small) return [
    option('Meeting corner', 'A meeting table for client conversations, with a reception desk at the door.', s => meeting(s, 3, 3, a => a.dimensions[0] <= 1)),
    option('Lounge corner', 'A sofa and armchairs around a coffee table: an easy place to sit and talk.', s => lounge(s, 1, { compact: true, sofa: a => a.dimensions[0] <= 1.5, table: a => a.dimensions[0] <= 1.2, armchair: a => a.dimensions[0] <= .85 }), { desk: false }),
    option('Standing display', 'Open floor for the display, a high table with stools and a reception desk.', s => cocktail(s, 3, 2)),
  ];
  const style = read.style || 'lounge', guests = guestsFor(style), sets = Math.max(1, Math.ceil(guests / 5));
  if (style === 'dining') return [
    option('Dining rounds', `Round tables for about ${guests}, the classic gala setting.`, s => dining(s, guests, 'round')),
    option('Long tables', `Long tables for about ${guests}, a convivial family-style dinner.`, s => dining(s, guests, 'oblong')),
    option('Dinner and lounge', 'Dining rounds, with a lounge set for coffee afterwards.', s => [...dining(s, Math.max(6, guests - 5), 'round'), ...lounge(s, 1)]),
  ];
  if (style === 'cocktail') return [
    option('Cocktail tables', `High tables with stools for about ${guests} standing guests.`, s => cocktail(s, guests)),
    option('Cocktail and lounge', 'High tables to mingle, lounge sets to sit down.', s => [...lounge(s, Math.max(1, Math.round(sets / 2))), ...cocktail(s, Math.ceil(guests / 2))]),
    option('Standing room', 'High tables without stools, for the most guests on the floor.', s => cocktail(s, guests, 0)),
  ];
  if (style === 'theatre') return [
    option('Theatre rows', `Rows of chairs for ${guests}, facing the back wall, with a centre aisle.`, s => theatre(s, guests)),
    option('Cabaret rounds', 'Round tables, so guests can eat and watch.', s => dining(s, guests, 'round')),
    option('Lounge audience', 'Sofas and armchairs for a relaxed talk or screening.', s => lounge(s, sets)),
  ];
  if (style === 'meeting') return [
    option('Meeting tables', 'Separate tables for private conversations.', s => meeting(s, guests)),
    option('Boardroom', 'Long tables for a working session.', s => dining(s, guests, 'oblong')),
    option('Lounge meetings', 'Informal lounge sets for relaxed meetings.', s => lounge(s, sets)),
  ];
  if (style === 'majlis') return [
    option('Majlis', 'Sofas along the walls facing in, coffee tables in front: the traditional Gulf majlis.', s => majlis(s, guests, true)),
    option('Majlis with centre lounge', 'Wall seating, with an armchair circle in the middle.', s => [...majlis(s, guests, false), ...split(s, 1, (sh, n) => {
      const armchair = sh.pick('armchair', 4 * n), table = sh.pick('coffee-table', n);
      return armchair && table ? { zone: { motif: 'conversation', count: n, products: { armchair, 'coffee-table': table } }, per: { [armchair]: 4, [table]: 1 } } : null;
    })]),
    option('Lounge sets', 'Separate lounge groups, each with its own coffee table.', s => lounge(s, sets)),
  ];
  return [
    option('Lounge sets', `Sofa groups with armchairs for about ${guests} guests.`, s => lounge(s, sets)),
    option('Majlis', 'Sofas along the walls facing in, the Gulf majlis way.', s => majlis(s, guests, false)),
    option('Lounge and cocktail', 'Lounge sets to sit, high tables to mingle.', s => [...lounge(s, Math.max(1, Math.round(sets / 2))), ...cocktail(s, Math.ceil(guests / 2))]),
  ];
}

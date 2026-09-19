// Floor-plan maths shared by the editor and the renderer. No three.js here, so the
// panel can reason about footprints and spacing without loading the 3D bundle.

/** Keep the traced perimeter, including non-rectangular buildings, when resized. */
export function scaledFootprint(object) {
  const [w, , d] = object.dimensions;
  if (!object.points?.length) return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
  const points = object.points.filter((p,i,a) => !i || Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]) > .001);
  if (points.length > 3 && Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1]) < .001) points.pop();
  const width = Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));
  const depth = Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]));
  return points.map(([x,z])=>[x*w/(width||w),z*d/(depth||d)]);
}

export function tentFootprint(object) {
  const [width, , depth] = object.dimensions;
  if (object.roofType !== 'hexagon') return scaledFootprint(object);
  if (object.points?.length >= 6) {
    const points = object.points.filter((point, index, source) => index === 0 || Math.hypot(point[0]-source[index-1][0], point[1]-source[index-1][1]) > .01).map(point => [...point]);
    if (points.length > 1 && Math.hypot(points[0][0]-points.at(-1)[0], points[0][1]-points.at(-1)[1]) < .01) points.pop();
    if (points.length >= 6) return scaledFootprint({...object,points});
  }
  return [[width/2,0],[width/4,depth/2],[-width/4,depth/2],[-width/2,0],[-width/4,-depth/2],[width/4,-depth/2]];
}

export function localGroundPoint(object, x, z) {
  const dx = x - object.position[0], dz = z - object.position[2], angle = object.rotation?.[1] || 0;
  return [dx * Math.cos(angle) - dz * Math.sin(angle), dx * Math.sin(angle) + dz * Math.cos(angle)];
}

/** The inverse of localGroundPoint: a point on a host's floor, expressed on the site. */
export function worldGroundPoint(object, x, z) {
  const angle = object.rotation?.[1] || 0, cos = Math.cos(angle), sin = Math.sin(angle);
  return [object.position[0] + x*cos + z*sin, object.position[2] - x*sin + z*cos];
}

export function polygonContains(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length-1; i < points.length; j = i++) {
    const [xi,zi] = points[i], [xj,zj] = points[j];
    if ((zi > z) !== (zj > z) && x < (xj-xi)*(z-zi)/(zj-zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToEdge(x, z, a, b) {
  const dx = b[0]-a[0], dz = b[1]-a[1], lengthSquared = dx*dx + dz*dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x-a[0])*dx + (z-a[1])*dz)/lengthSquared)) : 0;
  return Math.hypot(x - a[0] - t*dx, z - a[1] - t*dz);
}

/** Corners of a piece standing at (x,z), turned by angle, in its host's floor coordinates. */
export function rectCorners(x, z, width, depth, angle = 0) {
  const cos = Math.cos(angle), sin = Math.sin(angle), hw = Math.max(width,.01)/2, hd = Math.max(depth,.01)/2;
  return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]].map(([lx,lz]) => [x + lx*cos + lz*sin, z - lx*sin + lz*cos]);
}

function axes(corners) {
  return [[corners[1][0]-corners[0][0], corners[1][1]-corners[0][1]], [corners[3][0]-corners[0][0], corners[3][1]-corners[0][1]]];
}

/** Separating-axis test, so pieces turned at any angle still keep their distance. */
export function rectsOverlap(a, b, clearance = 0) {
  const grow = clearance;
  const first = rectCorners(a.x, a.z, a.width+grow, a.depth+grow, a.angle||0);
  const second = rectCorners(b.x, b.z, b.width+grow, b.depth+grow, b.angle||0);
  for (const corners of [first, second]) for (const [ax,az] of axes(corners)) {
    const length = Math.hypot(ax,az) || 1, nx = ax/length, nz = az/length;
    const project = list => list.map(([x,z]) => x*nx + z*nz);
    const one = project(first), two = project(second);
    if (Math.max(...one) < Math.min(...two) || Math.max(...two) < Math.min(...one)) return false;
  }
  return true;
}

/** True when the whole piece, plus its clearance, sits inside the floor outline. */
export function rectInsideFootprint(points, x, z, width, depth, angle = 0, clearance = 0) {
  if (!points?.length) return true;
  const corners = rectCorners(x, z, width, depth, angle);
  if (!corners.every(([cx,cz]) => polygonContains(points, cx, cz))) return false;
  if (!clearance) return true;
  return !corners.some(([cx,cz]) => points.some((a,i) => distanceToEdge(cx, cz, a, points[(i+1)%points.length]) < clearance));
}

/** Nudge a piece back onto its host's floor, keeping it as close as possible to where it was dropped. */
export function clampIntoFootprint(points, x, z, width, depth, angle = 0, clearance = .05) {
  if (rectInsideFootprint(points, x, z, width, depth, angle, clearance)) return [x, z];
  const centre = [points.reduce((sum,p)=>sum+p[0],0)/points.length, points.reduce((sum,p)=>sum+p[1],0)/points.length];
  let low = 0, high = 1, best = centre;
  // The centre always fits for the footprints we draw, so close in on the furthest point that still does.
  for (let step = 0; step < 24; step += 1) {
    const middle = (low+high)/2;
    const candidate = [centre[0] + (x-centre[0])*middle, centre[1] + (z-centre[1])*middle];
    if (rectInsideFootprint(points, candidate[0], candidate[1], width, depth, angle, clearance)) { best = candidate; low = middle; }
    else high = middle;
  }
  return [+best[0].toFixed(3), +best[1].toFixed(3)];
}

/**
 * First free spot for a piece of this size, on a lattice, working outwards from the
 * middle of the floor. Returns null when the floor is genuinely full.
 */
export function freeFloorSlot({ footprint, width, depth, angle = 0, occupied = [], lattice = .5, wallClearance = .25, itemClearance = .08 }) {
  if (!footprint?.length) return null;
  const xs = footprint.map(p=>p[0]), zs = footprint.map(p=>p[1]);
  const centre = [(Math.min(...xs)+Math.max(...xs))/2, (Math.min(...zs)+Math.max(...zs))/2];
  const halfSpanX = (Math.max(...xs)-Math.min(...xs))/2, halfSpanZ = (Math.max(...zs)-Math.min(...zs))/2;
  const steps = Math.ceil(Math.max(halfSpanX, halfSpanZ)/lattice) + 1;
  const snap = value => Math.round(value/lattice)*lattice;
  const candidates = [];
  for (let ix = -steps; ix <= steps; ix += 1) for (let iz = -steps; iz <= steps; iz += 1)
    candidates.push([snap(centre[0]) + ix*lattice, snap(centre[1]) + iz*lattice]);
  candidates.sort((a,b) => Math.hypot(a[0]-centre[0],a[1]-centre[1]) - Math.hypot(b[0]-centre[0],b[1]-centre[1]));
  for (const [x,z] of candidates) {
    if (!rectInsideFootprint(footprint, x, z, width, depth, angle, wallClearance)) continue;
    if (occupied.some(item => rectsOverlap({x,z,width,depth,angle}, item, itemClearance))) continue;
    return [+x.toFixed(3), +z.toFixed(3)];
  }
  return null;
}

/** Every piece already standing on this host's floor, in the host's own coordinates. */
export function occupantsOf(objects, host, exclude) {
  return objects.filter(o => o.kind === 'furniture' && o.id !== exclude && o.metadata?.parentTentId === host.id).map(o => {
    const [x,z] = localGroundPoint(host, o.position[0], o.position[2]);
    return { id: o.id, x, z, width: o.dimensions[0], depth: o.dimensions[2], angle: (o.rotation?.[1]||0) - (host.rotation?.[1]||0) };
  });
}

/** The tent a point on the site falls inside, if any. */
export function hostTentAt(objects, x, z) {
  for (const o of objects) {
    if (o.kind !== 'tent' || o.visible === false) continue;
    const [lx,lz] = localGroundPoint(o, x, z);
    if (polygonContains(tentFootprint(o), lx, lz)) return o;
  }
  return null;
}

// Applies the October 2026 venue survey to the site seed:
//  1. re-aligns the traced course to the plan using the real shoreline and two fixed paved circles,
//  2. adds the four driving-range mounds Pico marked on Google Earth, measured from satellite imagery,
//  3. gives every 5 x 5 m booth the frame, fascia and backwall from Pico's elevation drawing.
// Run once: node --experimental-default-type=module scripts/event-studio/apply-venue-survey.mjs
import fs from 'node:fs/promises';
import { validateEventLayout } from '../../lib/eventLayoutSchema.js';
import { scaledFootprint, worldGroundPoint, courseFeaturesUnder } from '../../lib/eventStudioLayout.js';

const SEED = 'private/event-studio/rbc/site-seed.json';
const scene = validateEventLayout(JSON.parse(await fs.readFile(SEED, 'utf8')));

// The September fit matched the plan's lake to the OpenStreetMap outline. Fitting it instead to the
// shoreline traced from Esri World Imagery (mean 0.7 m) moves the course 12.3 m along the site, and that
// fit lands two paved circles beside the Majlis within 0.2 m and 0.4 m without being told about them.
// This maps a point placed by the September fit to where the October fit puts it.
const ALIGN = { theta: -0.008507055715524391, scale: 0.9640966572053176, shift: [12.304348585626068, 0.014112197780477755] };
const align = ([x, z]) => {
  const c = Math.cos(ALIGN.theta), s = Math.sin(ALIGN.theta);
  return [ALIGN.scale * (c*x - s*z) + ALIGN.shift[0], ALIGN.scale * (s*x + c*z) + ALIGN.shift[1]];
};
const round = v => +v.toFixed(3);

if (scene.site.georeference?.version !== 2) {
  for (const o of scene.objects) {
    if (!o.id.startsWith('venue-')) continue;
    const outline = scaledFootprint(o).map(([x, z]) => align(worldGroundPoint(o, x, z)));
    const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
    const centre = [(Math.min(...xs)+Math.max(...xs))/2, (Math.min(...zs)+Math.max(...zs))/2];
    o.position = [round(centre[0]), o.position[1], round(centre[1])];
    o.rotation = [0, 0, 0];
    o.points = outline.map(([x, z]) => [round(x-centre[0]), round(z-centre[1])]);
    o.dimensions = [round(Math.max(...xs)-Math.min(...xs)), o.dimensions[1], round(Math.max(...zs)-Math.min(...zs))];
    o.metadata = { ...o.metadata, notes: 'Existing golf course feature, traced by OpenStreetMap contributors from satellite imagery and aligned to this plan by the real shoreline, checked against two fixed paved circles by the Majlis. Horizontal position is accurate to roughly 3 m; depth and profile are not surveyed.' };
  }
}

// The course was clipped to the event footprint when it was traced; the shift moves some edges past it,
// so clip again. Clipping an outline already inside the footprint leaves it unchanged.
function clipToBounds(outline, b) {
  const edges = [[p => p[0] >= b.minX, (p, q) => (b.minX-p[0])/(q[0]-p[0])], [p => p[0] <= b.maxX, (p, q) => (b.maxX-p[0])/(q[0]-p[0])],
    [p => p[1] >= b.minZ, (p, q) => (b.minZ-p[1])/(q[1]-p[1])], [p => p[1] <= b.maxZ, (p, q) => (b.maxZ-p[1])/(q[1]-p[1])]];
  let result = outline;
  for (const [inside, cut] of edges) {
    const input = result; result = [];
    input.forEach((p, i) => {
      const q = input[(i+1) % input.length], at = t => [p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t];
      if (inside(p)) { result.push(p); if (!inside(q)) result.push(at(cut(p, q))); }
      else if (inside(q)) result.push(at(cut(p, q)));
    });
    if (result.length < 3) return [];
  }
  return result;
}
const clipped = [];
scene.objects = scene.objects.filter(o => {
  if (!o.id.startsWith('venue-') || o.metadata?.surface === 'mound') return true;
  const b = scene.site.bounds, world = scaledFootprint(o).map(([x, z]) => worldGroundPoint(o, x, z));
  if (world.every(([x, z]) => x >= b.minX-.001 && x <= b.maxX+.001 && z >= b.minZ-.001 && z <= b.maxZ+.001)) return true;
  const outline = clipToBounds(world, b);
  if (outline.length < 3) { clipped.push(`${o.id} (outside, removed)`); return false; }
  const xs = outline.map(p => p[0]), zs = outline.map(p => p[1]);
  const centre = [(Math.min(...xs)+Math.max(...xs))/2, (Math.min(...zs)+Math.max(...zs))/2];
  const points = outline.map(([x, z]) => [round(x-centre[0]), round(z-centre[1])]);
  clipped.push(o.id);
  o.position = [round(centre[0]), o.position[1], round(centre[1])]; o.rotation = [0, 0, 0]; o.points = points;
  o.dimensions = [round(Math.max(...xs)-Math.min(...xs)), o.dimensions[1], round(Math.max(...zs)-Math.min(...zs))];
  return true;
});

// Positions from Esri World Imagery under the October fit; diameters from the imaged domes, to about 1 m.
// Pico's Google Earth overlay (28 Sep 2026) puts each one within 2.6-5.1 m of these.
const MOUNDS = [[-33.7, 29.1, 11.0], [15.5, 41.6, 10.5], [-6.3, 56.1, 11.0], [38.8, 56.5, 10.0]];
const MOUND_HEIGHT = 1.0;
scene.objects = scene.objects.filter(o => !o.id.startsWith('venue-mound-'));
MOUNDS.forEach(([x, z, diameter], index) => {
  const r = diameter/2, sides = 36;
  scene.objects.push({
    id: `venue-mound-${index+1}`, name: `Driving-range mound ${index+1}`, kind: 'ground',
    position: [x, 0, z], rotation: [0, 0, 0], dimensions: [diameter, MOUND_HEIGHT, diameter], color: '#527f37',
    points: Array.from({ length: sides }, (_, i) => [round(r*Math.cos(i*2*Math.PI/sides)), round(r*Math.sin(i*2*Math.PI/sides))]),
    locked: true,
    metadata: {
      surface: 'mound', relief: { height: MOUND_HEIGHT, profile: 'dome' },
      measurementStatus: 'mixed', footprintStatus: 'satellite-measured', heightStatus: 'estimated',
      notes: `Existing turf mound on the driving range, marked by Pico on Google Earth (28 Sep 2026) and measured on Esri World Imagery: about ${diameter} m across. Its ${MOUND_HEIGHT} m height is an estimate; driving-range target mounds usually rise 0.5-1.5 m and no level survey exists.`,
    },
  });
});

// Pico's 5 x 5 m booth elevation, 30 September 2026. The peak is read off the drawing's roof outline.
const BOOTH = {
  standard: 'RBC 2026 5 × 5 m exhibitor booth', source: 'Pico elevation "5X5m Tent Fascia & Backwall Graphic Size", 30 Sep 2026',
  eaveHeight: 3.5, peakHeight: 5.55, post: 0.4, opening: [4.2, 2.3],
  fascia: { width: 4.2, height: 1.0, bottom: 2.3, light: 'LED strip under the header' }, backwall: { width: 4.8, height: 2.4 },
  frameColor: '#de2826',
};
let booths = 0;
for (const o of scene.objects) {
  if (o.kind !== 'tent' || o.roofType !== 'pagoda' || Math.abs(o.dimensions[0]-5) > .3 || Math.abs(o.dimensions[2]-5) > .3) continue;
  o.dimensions = [o.dimensions[0], BOOTH.peakHeight, o.dimensions[2]];
  o.metadata = { ...o.metadata, eaveHeight: BOOTH.eaveHeight, heightStatus: 'supplier drawing', booth: { ...BOOTH, ...(o.metadata?.booth?.brand ? { brand: o.metadata.booth.brand } : {}) },
    notes: 'Position, turn and footprint from the source plan. Eave, peak, red frame, fascia and backwall graphic follow Pico’s 5 × 5 m booth elevation (30 Sep 2026); side walls and materials are estimates.' };
  booths += 1;
}

const site = scene.site;
site.georeference = {
  version: 2,
  origin: { lat: 26.0932677, lon: 50.5673768 },
  planXBearingDegrees: 0.49,
  metresOnGroundPerPlanMetre: { x: 1.0116, z: 1.0170 },
  method: 'The plan’s lake fitted to the shoreline traced from Esri World Imagery, rotation and scale free: mean misfit 0.7 m. The same fit puts the two paved circles beside the Majlis within 0.2 m and 0.4 m of the imagery, unprompted.',
  supersedes: 'The 20 September fit to the OpenStreetMap lake outline, which slid the plan about 12 m along its length.',
  note: 'The plan’s drawing of the existing venue is about 1.4% smaller than the ground. Course features and mounds are placed against the drawn venue, so they line up with the plan as drawn.',
};
site.terrain.orientation = { ...site.terrain.orientation, note: 'True north is plan +X to within half a degree (+X points 0.49° east of north), and east is plan +Z, from the shoreline fit. Object names containing north, south or east follow the source drawing sheet instead, which is turned from north (see sourceRotation), so "North toilets" sits on the west side of the site. Read the geometry, not the names.' };
site.terrain.notes = `${site.terrain.notes.replace(/ Driving-range mounds.*$/, '')} Driving-range mounds are the exception: four are modelled as domes from satellite imagery, with estimated heights.`;
site.assumptions = site.assumptions.map(text => {
  if (text.startsWith('Existing course features are traced')) return 'Existing course features are traced from OpenStreetMap and placed by fitting the plan lake to the real shoreline in satellite imagery (mean 0.7 m), confirmed on two fixed paved circles (0.2 and 0.4 m). They are locked, and show where the event stands on the playing surface.';
  if (text.startsWith('True north is plan +X')) return site.terrain.orientation.note;
  return text;
}).filter(text => !text.startsWith('Four driving-range mounds') && !text.startsWith('The 5 × 5 m booths'));
site.assumptions.push(
  'Four driving-range mounds are taken from Pico’s Google Earth overlay (28 Sep 2026) and measured on satellite imagery: 10-11 m across, placed to about 3 m. Their 1 m heights are estimates; Google Earth’s terrain cannot resolve them and no level survey exists.',
  'The 5 × 5 m booths follow Pico’s elevation of 30 Sep 2026: 3.5 m to the top of the frame, 400 mm red posts, a 4.2 × 1.0 m fascia graphic above a 2.3 m clear opening, and a 4.8 × 2.4 m backwall graphic. Side walls are estimates.',
);
const refs = site.references.filter(r => !['Satellite imagery (Esri World Imagery)', 'Google Earth view of the driving range'].includes(r.title));
refs.push(
  { title: 'Satellite imagery (Esri World Imagery)', url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9', kind: 'venue', notes: 'Shoreline, paved circles and driving-range mounds measured from this imagery at about 0.27 m per pixel.' },
  { title: 'Google Earth view of the driving range', url: 'https://earth.google.com/web/@26.0933,50.5678,40a,350d,35y,0h,0t,0r', kind: 'venue', notes: 'Imagery of 9 Aug 2025 shows the same four mounds. Its terrain reads in whole metres and does not resolve them.' },
);
site.references = refs;

validateEventLayout(scene);
await fs.writeFile(SEED, JSON.stringify(scene, null, 2));
const flagged = scene.objects.filter(o => courseFeaturesUnder(scene, o).length).map(o => `${o.id}: ${courseFeaturesUnder(scene, o).join(', ')}`);
console.log(JSON.stringify({ objects: scene.objects.length, booths, mounds: MOUNDS.length, clipped, flagged }, null, 2));

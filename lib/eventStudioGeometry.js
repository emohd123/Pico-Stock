import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { scaledFootprint } from './eventStudioLayout.js';

export function perimeterExtrusion(points, height) {
  const shape = new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
  geometry.rotateX(-Math.PI/2);
  return geometry;
}

export function pagodaGeometry(points, eave, height) {
  const rise = height-eave;
  const rings = [[1,eave],[.86,eave+rise*.075],[.65,eave+rise*.23],[.4,eave+rise*.49],[.15,eave+rise*.79],[0,height]];
  const vertices = [], indices = [], n = points.length;
  for (const [scale,y] of rings) for (const [x,z] of points) vertices.push(x*scale,y,z*scale);
  for(let j=0;j<rings.length-1;j++) for(let i=0;i<n;i++) {
    const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+i,d=(j+1)*n+(i+1)%n;
    indices.push(a,c,b,b,c,d);
  }
  const g = new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function gableGeometry(points,eave,height) {
  const low=Math.min(...points.map(p=>p[0])),high=Math.max(...points.map(p=>p[0])),ridge=(low+high)/2,half=(high-low)/2;
  const vertices=[],indices=[];
  for(const side of [-1,1]) {
    const clipped=[];
    points.forEach((a,i)=>{const b=points[(i+1)%points.length],insideA=(a[0]-ridge)*side>=0,insideB=(b[0]-ridge)*side>=0;if(insideA)clipped.push(a);if(insideA!==insideB){const t=(ridge-a[0])/(b[0]-a[0]);clipped.push([ridge,a[1]+(b[1]-a[1])*t]);}});
    const start=vertices.length/3;
    clipped.forEach(([x,z])=>vertices.push(x,eave+(height-eave)*(1-Math.abs(x-ridge)/half),z));
    for(const face of THREE.ShapeUtils.triangulateShape(clipped.map(p=>new THREE.Vector2(...p)),[]))indices.push(...face.toReversed().map(i=>i+start));
  }
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],segment=[a];
    if((a[0]-ridge)*(b[0]-ridge)<0){const t=(ridge-a[0])/(b[0]-a[0]);segment.push([ridge,a[1]+(b[1]-a[1])*t]);}
    segment.push(b);
    for(let j=0;j<segment.length-1;j++){const [x,z]=segment[j],[nx,nz]=segment[j+1],start=vertices.length/3;vertices.push(x,eave,z,nx,eave,nz,x,eave+(height-eave)*(1-Math.abs(x-ridge)/half),z,nx,eave+(height-eave)*(1-Math.abs(nx-ridge)/half),nz);indices.push(start,start+1,start+2,start+1,start+3,start+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function clubhouseRoofGeometry(points,height,axis=[1,0]) {
  const projections=points.map(([x,z])=>x*axis[0]+z*axis[1]),low=Math.min(...projections),range=Math.max(...projections)-low;
  const profile=[[0,.96],[.35,.99],[.65,1],[.78,.97],[.9,.87],[1,.72]];
  const top=([x,z])=>{const u=THREE.MathUtils.clamp((x*axis[0]+z*axis[1]-low)/range,0,1),i=Math.max(0,profile.findIndex(p=>p[0]>=u)-1),a=profile[i],b=profile[i+1];return height*(a[1]+(b[1]-a[1])*(u-a[0])/(b[0]-a[0]));};
  const vertices=[],indices=[];
  const clip=(polygon,boundary,side)=>{const out=[];polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],pa=a[0]*axis[0]+a[1]*axis[1]-boundary,pb=b[0]*axis[0]+b[1]*axis[1]-boundary,ia=pa*side>=-1e-7,ib=pb*side>=-1e-7;if(ia)out.push(a);if(ia!==ib){const t=pa/(pa-pb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}});return out;};
  for(let i=0;i<profile.length-1;i++) {
    const strip=clip(clip(points,low+profile[i][0]*range,1),low+profile[i+1][0]*range,-1),start=vertices.length/3;
    strip.forEach(p=>vertices.push(p[0],top(p),p[1]));
    for(const f of THREE.ShapeUtils.triangulateShape(strip.map(p=>new THREE.Vector2(...p)),[]))indices.push(...f.toReversed().map(i=>i+start));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return {geometry,top};
}

/** A box whose top face is smaller than its base, for a car's glasshouse. */
function taperedBox(baseWidth, baseLength, topWidth, topLength, height, topShift = 0) {
  const half = height/2, corners = (w,l,y,shift) => [[-w/2,y,-l/2+shift],[w/2,y,-l/2+shift],[w/2,y,l/2+shift],[-w/2,y,l/2+shift]];
  const low = corners(baseWidth,baseLength,-half,0), high = corners(topWidth,topLength,half,topShift);
  const vertices = [...low,...high].flat(), indices = [];
  for (let i = 0; i < 4; i += 1) { const j = (i+1)%4; indices.push(i,j,i+4,j,j+4,i+4); }
  indices.push(4,5,6,4,6,7,0,2,1,0,3,2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

/**
 * A generic display car. Every part is drawn in metres for a reference car and then divided by
 * that reference, because the renderer scales each instance by its own width, height and length:
 * a shape drawn in plain unit space would come out stretched more than three times along the car.
 * Shapes are editable estimates, not any exhibitor's car.
 */
const REFERENCE_CAR = [2.2, 1.5, 5.0];
const unit = (x, y, z) => [x / REFERENCE_CAR[0], y / REFERENCE_CAR[1], z / REFERENCE_CAR[2]];

export const CAR_STYLES = ['coupe', 'roadster'];

/**
 * A classic grand tourer of the kind shown at a concours: long bonnet, cabin set back, wheel arches
 * cut from a curved side profile with rounded edges. Two bodies: a coupé with a tinted glasshouse
 * and painted roof, and an open roadster with a raked windscreen, a cockpit, seats and a wheel.
 * Drawn in metres for the reference car, front towards +z, then divided by the reference size.
 */
export function carParts(style = 'coupe') {
  const parts = { body: [], glass: [], chrome: [], rubber: [], trim: [], lamp: [], tail: [] };
  // A side profile (u along the car, v up) extruded across the car and centred on it.
  const side = (draw, width, bevel = 0, segments = 2) => {
    const shape = new THREE.Shape(); draw(shape);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(.01, width - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segments, curveSegments: 9, steps: 1 });
    geometry.translate(0, 0, -(width - 2 * bevel) / 2);
    geometry.rotateY(-Math.PI / 2);
    return geometry;
  };
  const arch = (shape, z, r, y = .3) => { shape.lineTo(z + r, y); shape.absarc(z, y, r, 0, Math.PI, false); };
  // Bend a straight extrusion into a car: the sides lean in towards the top, nose and tail narrow in
  // plan, and the normals are rebuilt smooth so paint and glass read as pressed panels, not facets.
  const step = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const sculpt = (geometry, lean, low, high) => {
    geometry.deleteAttribute('normal'); geometry.deleteAttribute('uv');
    const smooth = mergeVertices(geometry, 1e-4), position = smooth.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i), z = position.getZ(i);
      position.setX(i, position.getX(i) * (1 - lean * step(low, high, y) - .13 * step(1.75, 2.62, z) - .1 * step(-1.9, -2.62, z)));
    }
    smooth.computeVertexNormals();
    return smooth.toNonIndexed();
  };
  const front = 1.5, rear = -1.55, arch_r = .43;
  // Body: bumper line to tail, over the deck and bonnet, and down the nose.
  parts.body.push(sculpt(side(s => {
    s.moveTo(2.36, .3);
    arch(s, front, arch_r); arch(s, rear, arch_r);
    s.lineTo(-2.36, .31); s.quadraticCurveTo(-2.5, .34, -2.5, .55); s.quadraticCurveTo(-2.49, .78, -2.22, .85);
    s.lineTo(-1.45, .9); s.lineTo(.6, .92); s.quadraticCurveTo(1.6, .91, 2.2, .8); s.quadraticCurveTo(2.48, .73, 2.49, .53);
    s.quadraticCurveTo(2.49, .32, 2.36, .3);
  }, 1.9, .085), .15, .6, 1.0));
  if (style === 'coupe') {
    // The glasshouse, tinted, leaning in towards a painted roof, with the pillars implied by its overhang.
    parts.glass.push(sculpt(side(s => {
      s.moveTo(.64, .88); s.quadraticCurveTo(.27, 1.16, -.04, 1.27); s.lineTo(-.86, 1.28); s.quadraticCurveTo(-1.48, 1.24, -1.86, .88); s.lineTo(.64, .88);
    }, 1.46, .06), .27, .92, 1.29));
    parts.body.push(sculpt(side(s => { s.moveTo(.02, 1.245); s.lineTo(-.9, 1.255); s.lineTo(-.92, 1.32); s.lineTo(.0, 1.31); s.lineTo(.02, 1.245); }, 1.42, .03, 2), .27, .92, 1.29));
  } else {
    // Open roadster: a raked screen in a chrome frame, a dark cockpit, two seats and the wheel (left-hand drive).
    parts.glass.push(side(s => { s.moveTo(.66, .93); s.lineTo(.43, 1.24); s.lineTo(.405, 1.24); s.lineTo(.635, .93); s.lineTo(.66, .93); }, 1.5, .012, 1));
    parts.chrome.push(side(s => { s.moveTo(.43, 1.235); s.lineTo(.4, 1.265); s.lineTo(.385, 1.255); s.lineTo(.415, 1.225); }, 1.54, .01, 1));
    const cockpit = new THREE.BoxGeometry(1.48, .02, 1.6); cockpit.translate(0, .955, -.32); parts.rubber.push(cockpit);
    for (const x of [-.38, .38]) {
      const back = new THREE.BoxGeometry(.5, .42, .12); back.rotateX(-.22); back.translate(x, 1.08, -.72); parts.trim.push(back);
      const cushion = new THREE.BoxGeometry(.5, .1, .5); cushion.translate(x, .97, -.45); parts.trim.push(cushion);
    }
    const wheel = new THREE.TorusGeometry(.19, .018, 5, 16); wheel.rotateX(-.4); wheel.translate(.38, 1.1, .15); parts.rubber.push(wheel);
  }
  // Wheels: tyres and chrome hubcaps.
  for (const x of [-.86, .86]) for (const z of [front, rear]) {
    const tyre = new THREE.CylinderGeometry(.34, .34, .22, 18, 1); tyre.rotateZ(Math.PI / 2); tyre.translate(x, .34, z); parts.rubber.push(tyre);
    const hub = new THREE.CylinderGeometry(.145, .17, .035, 14, 1); hub.rotateZ(Math.PI / 2); hub.translate(x + Math.sign(x) * .115, .34, z); parts.chrome.push(hub);
  }
  // Bumpers, grille and headlamp rims in chrome; lamps front and back.
  for (const z of [2.53, -2.55]) { const bar = new THREE.CapsuleGeometry(.055, 1.74, 2, 8); bar.rotateZ(Math.PI / 2); bar.translate(0, .38, z); parts.chrome.push(bar); }
  const grille = new THREE.BoxGeometry(.56, .2, .04); grille.translate(0, .52, 2.49); parts.chrome.push(grille);
  for (const x of [-.63, .63]) {
    const rim = new THREE.CylinderGeometry(.115, .115, .07, 14, 1); rim.rotateX(Math.PI / 2); rim.translate(x, .64, 2.45); parts.chrome.push(rim);
    const lens = new THREE.CircleGeometry(.095, 14); lens.translate(x, .64, 2.49); parts.lamp.push(lens);
    const tail = new THREE.BoxGeometry(.16, .07, .04); tail.translate(x * 1.1, .66, -2.5); parts.tail.push(tail);
  }
  // Rounded edges and bumpers add a few centimetres; the whole car is fitted to the reference length
  // so it matches the plan's car symbol exactly.
  const all = new THREE.Box3();
  for (const list of Object.values(parts)) for (const g of list) { g.computeBoundingBox(); all.union(g.boundingBox); }
  const fit = REFERENCE_CAR[2] / (all.max.z - all.min.z), mid = (all.max.z + all.min.z) / 2;
  const normalise = list => {
    if (!list.length) return null;
    const merged = mergeGeometries(list.map(g => { const plain = g.index ? g.toNonIndexed() : g; plain.deleteAttribute('uv'); return plain; }), false);
    merged.translate(0, 0, -mid); merged.scale(1, 1, fit);
    merged.scale(1 / REFERENCE_CAR[0], 1 / REFERENCE_CAR[1], 1 / REFERENCE_CAR[2]);
    return merged;
  };
  return [
    { geo: normalise(parts.body), color: '#ffffff', p: [0, 0, 0], tint: true, finish: 'paint' },
    { geo: normalise(parts.glass), color: '#1e2a31', p: [0, 0, 0], finish: 'glass' },
    { geo: normalise(parts.chrome), color: '#e3e3e1', p: [0, 0, 0], finish: 'chrome' },
    { geo: normalise(parts.rubber), color: '#151515', p: [0, 0, 0], finish: 'rubber' },
    { geo: normalise(parts.trim), color: '#8a5a3c', p: [0, 0, 0], finish: 'trim' },
    { geo: normalise(parts.tail), color: '#a3161b', p: [0, 0, 0], finish: 'tail' },
    { geo: normalise(parts.lamp), color: '#f4f1e6', p: [0, 0, 0], finish: 'lamp' },
  ].filter(part => part.geo);
}

function mergeParts(geometries) {
  const vertices = [], indices = [];
  for (const geometry of geometries) {
    const offset = vertices.length/3, position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) vertices.push(position.getX(i),position.getY(i),position.getZ(i));
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i)+offset);
    else for (let i = 0; i < position.count; i += 1) indices.push(i+offset);
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));merged.setIndex(indices);merged.computeVertexNormals();
  return merged;
}

/** Date-palm silhouette observed in official venue photos. Unit dimensions. */
/**
 * A date palm, the tree that lines the course: a ringed trunk with a slight lean, three tiers of
 * arching grey-green fronds with leaflets down each rib, and a skirt of dry fronds under the crown.
 * Unit space (the renderer scales by each palm's width, height and depth), crown at 0.8 of the height.
 */
export function palmParts() {
  const green = [], dry = [];
  const crown = .8, lean = .028;
  const frond = (list, angle, rise, reach, droop, leaf, leaflets) => {
    const cx = Math.cos(angle), cz = Math.sin(angle);
    const rib = t => [lean + cx * reach * t, crown + rise * t - droop * t * t, cz * reach * t];
    for (let k = 1; k <= leaflets; k += 1) {
      const t = k / (leaflets + 1), p = rib(t), q = rib(Math.min(1, t + .38 / (leaflets + 1)));
      const length = leaf * Math.sin(Math.PI * Math.min(.98, .15 + t * .85));
      for (const side of [-1, 1]) {
        // Leaflets angle forward and up from the rib in a shallow V, as on a date palm.
        const tip = [p[0] + (-cz * side * .82 + cx * .45) * length, p[1] + length * .5 - .012, p[2] + (cx * side * .82 + cz * .45) * length];
        list.push(...p, ...tip, ...q);
      }
    }
    // The rib itself, a thin ribbon so the frond reads from below.
    for (let k = 0; k < 5; k += 1) {
      const a = rib(k / 5), b = rib((k + 1) / 5), w = .006 * (1 - k / 5);
      list.push(a[0] - cz * w, a[1], a[2] + cx * w, b[0], b[1], b[2], a[0] + cz * w, a[1], a[2] - cx * w);
    }
  };
  // Three tiers: young fronds rise, mature ones spread, the oldest hang.
  for (let j = 0; j < 22; j += 1) {
    const tier = j % 3, angle = j * 2.39996 + tier * .3;   // golden-angle spacing round the crown
    const [rise, reach, droop] = [[.17, .3, .07], [.1, .44, .2], [.03, .46, .32]][tier];
    frond(green, angle, rise, reach * (.92 + (j % 5) * .03), droop, .09 + tier * .006, 15);
  }
  for (let j = 0; j < 8; j += 1) frond(dry, j * 2.39996 + .7, -.02, .22, .36, .05, 6);
  // Foliage is lit as a rounded crown: each vertex faces out and up from the crown centre, so the
  // fronds catch the sky instead of shading as hundreds of flat, edge-on triangles.
  const geometry = list => {
    const g = new THREE.BufferGeometry(), normals = [];
    for (let i = 0; i < list.length; i += 3) {
      const nx = list[i] - lean, ny = list[i + 1] - crown + .12, nz = list[i + 2], l = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / l, ny / l, nz / l);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return g;
  };
  // Ringed trunk: leaf-base "boots" every quarter metre or so, tapering, with a slight lean.
  const trunk = new THREE.CylinderGeometry(.021, .034, crown, 8, 28, true), position = trunk.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i) + crown / 2, ring = 1 + .14 * Math.pow(Math.abs(Math.sin(y * 95)), 3);
    position.setX(i, position.getX(i) * ring + lean * Math.pow(y / crown, 2)); position.setZ(i, position.getZ(i) * ring);
  }
  position.needsUpdate = true; trunk.computeVertexNormals();
  const core = new THREE.SphereGeometry(.038, 10, 8); core.scale(1, .7, 1); core.translate(lean, crown + .005, 0);
  return [
    { geo: trunk, color: '#b09c7c', p: [0, .4, 0], vary: true },
    { geo: core, color: '#6d6a45', p: [0, 0, 0], vary: true },
    { geo: geometry(green), color: '#6f8a52', p: [0, 0, 0], foliage: true, vary: true, ownColour: true },
    { geo: geometry(dry), color: '#9a8458', p: [0, 0, 0], foliage: true, vary: true },
  ];
}

/** A low stone edge follows the plan's exact lake boundary; section is estimated. */
export function lakeEdgeGeometry(points) {
  const vertices=[],indices=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.01)continue;
    const nx=-dz/length*.16,nz=dx/length*.16,start=vertices.length/3;
    for(const y of [.03,.24])vertices.push(a[0]-nx,y,a[1]-nz,b[0]-nx,y,b[1]-nz,b[0]+nx,y,b[1]+nz,a[0]+nx,y,a[1]+nz);
    for(const face of [[4,5,1,0],[5,6,2,1],[6,7,3,2],[7,4,0,3],[7,6,5,4]])indices.push(start+face[0],start+face[1],start+face[2],start+face[0],start+face[2],start+face[3]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** Procedural surface detail in metres, with no downloaded image dependencies. */
export function detailSurface(material, style) {
  material.customProgramCacheKey=()=>`venue-surface-v1-${style}`;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vVenuePosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvVenuePosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vVenuePosition;
float venueHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float venueNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(venueHash(i),venueHash(i+vec2(1,0)),f.x),mix(venueHash(i+vec2(0,1)),venueHash(i+vec2(1,1)),f.x),f.y);}
`);
    const detail=style==='water'?`float ripple=sin(vVenuePosition.x*3.8+sin(vVenuePosition.z*2.7))*sin(vVenuePosition.z*5.0)*.035;diffuseColor.rgb*=.94+ripple+venueNoise(vVenuePosition.xz*.3)*.12;`
      :style==='sand'?`float grain=venueNoise(vVenuePosition.xz*26.0);float rake=sin(vVenuePosition.x*1.7+vVenuePosition.z*.8)*.5+.5;diffuseColor.rgb*=.93+grain*.1+rake*.035;`
      :style==='stone'?`float grain=venueNoise(vVenuePosition.xz*15.0);float joint=step(.065,fract(vVenuePosition.x*2.7+floor(vVenuePosition.z*3.0)*.5))*step(.075,fract(vVenuePosition.z*3.0));diffuseColor.rgb*=mix(.53,.88+grain*.22,joint);`
      // The ground map: turf takes mowing stripes, sand takes a slow dune shading, both take grain.
      :style==='ground'?`float grain=mix(.5,venueNoise(vVenuePosition.xz*20.0),clamp(1.0-length(fwidth(vVenuePosition.xz))*8.0,0.0,1.0));float broad=venueNoise(vVenuePosition.xz*.045);float turfMask=smoothstep(.015,.07,diffuseColor.g-max(diffuseColor.r,diffuseColor.b));float stripe=sin((vVenuePosition.x+vVenuePosition.z*.42)*.55)*turfMask;float dune=(venueNoise(vVenuePosition.xz*.11)-.5)*(1.0-turfMask);diffuseColor.rgb*=.9+grain*.1+broad*.09+stripe*.045+dune*.1;`
      :`float grain=mix(.5,venueNoise(vVenuePosition.xz*20.0),clamp(1.0-length(fwidth(vVenuePosition.xz))*8.0,0.0,1.0));float broad=venueNoise(vVenuePosition.xz*.045);float stripe=sin((vVenuePosition.x+vVenuePosition.z*.42)*.55);diffuseColor.rgb*=.88+grain*.12+broad*.12+stripe*.05;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${detail}`);
    if(style==='water')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nvec3 venueWaveNormal=normalize(vec3(-cos(vVenuePosition.x*3.8+sin(vVenuePosition.z*2.7))*.04,1.0,-sin(vVenuePosition.z*5.0)*.025));normal=normalize((viewMatrix*vec4(venueWaveNormal,0.0)).xyz);');
  };
  return material;
}

// --- the neighbourhood ----------------------------------------------------------------------------
// Mapped footprints around the venue, extruded to estimated heights. Everything is built as plain
// triangles with position, normal and colour so the three kinds merge into a few draw calls.
function insideRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function triangles(positions, normals, colours, extra) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  if (extra) geometry.setAttribute(extra.name, new THREE.Float32BufferAttribute(extra.values, extra.size));
  return geometry;
}

/** Walls, sunk a metre so a sloping site never shows a gap; `facade` is metres along and up each wall. */
export function surroundingWalls(buildings) {
  const positions = [], normals = [], colours = [], facade = [];
  for (const { points, base, top, tint } of buildings) {
    let along = 0;
    for (let i = 0; i < points.length; i += 1) {
      let a = points[i], b = points[(i + 1) % points.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < .05) continue;
      // Outward normal: the side of the edge that is not inside the footprint.
      let nx = (b[1] - a[1]) / length, nz = -(b[0] - a[0]) / length;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (insideRing(points, mx + nx * .05, mz + nz * .05)) { nx = -nx; nz = -nz; }
      let s0 = along, s1 = along + length;
      // Wind the quad so its front face looks outward.
      if (-(b[1] - a[1]) * nx + (b[0] - a[0]) * nz < 0) { [a, b] = [b, a]; [s0, s1] = [s1, s0]; }
      const low = base - 1, h = top - base;
      const quad = [[a, low, s0, -1], [b, low, s1, -1], [b, top, s1, h], [a, low, s0, -1], [b, top, s1, h], [a, top, s0, h]];
      for (const [p, y, s, up] of quad) { positions.push(p[0], y, p[1]); normals.push(nx, 0, nz); colours.push(tint, tint, tint * .985); facade.push(s, up); }
      along += length;
    }
  }
  return positions.length ? triangles(positions, normals, colours, { name: 'facade', values: facade, size: 2 }) : null;
}

/** Flat roofs; a positive thickness also closes the underside, for open shelters. */
export function surroundingRoofs(buildings, thickness = 0) {
  const positions = [], normals = [], colours = [];
  for (const { points, top, tint } of buildings) {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch { continue; }
    for (const face of faces) {
      let [p, q, r] = face.map(i => points[i]);
      if ((q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) < 0) [q, r] = [r, q];
      for (const v of [p, q, r]) { positions.push(v[0], top, v[1]); normals.push(0, 1, 0); colours.push(tint, tint, tint); }
      if (thickness > 0) for (const v of [p, r, q]) { positions.push(v[0], top - thickness, v[1]); normals.push(0, -1, 0); colours.push(tint * .8, tint * .8, tint * .8); }
    }
  }
  return positions.length ? triangles(positions, normals, colours) : null;
}

/** Slim posts under each corner of an open shelter. */
export function surroundingPosts(buildings, size = .25) {
  const parts = [];
  for (const { points, base, top, tint } of buildings) for (const [x, z] of points) {
    const post = new THREE.BoxGeometry(size, top - base, size).toNonIndexed();
    post.translate(x, (top + base) / 2, z);
    post.deleteAttribute('uv');
    post.setAttribute('color', new THREE.Float32BufferAttribute(new Array(post.getAttribute('position').count * 3).fill(tint * .9), 3));
    parts.push(post);
  }
  if (!parts.length) return null;
  const vertices = [], normals = [], colours = [];
  for (const part of parts) {
    vertices.push(...part.getAttribute('position').array); normals.push(...part.getAttribute('normal').array); colours.push(...part.getAttribute('color').array);
    part.dispose();
  }
  return triangles(vertices, normals, colours);
}

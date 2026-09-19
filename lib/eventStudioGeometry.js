import * as THREE from 'three';

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
 * A generic display car, in units of its own bounding box, so each entry keeps the
 * footprint traced from the plan. Body panels take the car's own colour; glass,
 * tyres and brightwork are fixed. Shapes are editable estimates, not any exhibitor's car.
 */
export function carParts() {
  const wheel = new THREE.CylinderGeometry(.21,.21,.11,14);wheel.rotateZ(Math.PI/2);
  const wheels = [];
  for (const x of [-.4,.4]) for (const z of [-.3,.32]) { const part = wheel.clone(); part.translate(x,0,z); wheels.push(part); }
  const tyres = mergeParts(wheels);wheel.dispose();
  const arches = mergeParts([-.3,.32].flatMap(z => [-.41,.41].map(x => { const arch = new THREE.CylinderGeometry(.27,.27,.04,14,1,true,0,Math.PI);arch.rotateZ(Math.PI/2);arch.translate(x,0,z);return arch; })));
  return [
    { geo: tyres, color: '#171a1b', p: [0,.21,0] },
    { geo: arches, color: '#23282a', p: [0,.21,0], doubleSide: true },
    { geo: taperedBox(.93,1,.99,.92,.26), color: '#ffffff', p: [0,.36,0], tint: true },
    { geo: taperedBox(.99,.92,.92,.66,.12,-.02), color: '#ffffff', p: [0,.55,0], tint: true },
    { geo: taperedBox(.86,.52,.66,.34,.24,-.03), color: '#26343a', p: [0,.72,-.04] },
    { geo: new THREE.BoxGeometry(.97,.05,.16), color: '#c9ccc7', p: [0,.36,.47] },
    { geo: new THREE.BoxGeometry(.97,.05,.16), color: '#c9ccc7', p: [0,.36,-.47] },
  ];
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
export function palmParts() {
  const vertices=[],indices=[];
  const triangle=(a,b,c)=>{const start=vertices.length/3;vertices.push(...a,...b,...c);indices.push(start,start+1,start+2);};
  for(let j=0;j<13;j++) {
    const a=j*Math.PI*2/13, extent=.42+(j%3)*.025;
    const point=t=>[Math.cos(a)*extent*t,.79+Math.sin(t*Math.PI)*.16-t*t*.13,Math.sin(a)*extent*t];
    for(let k=1;k<12;k++) {
      const t=k/12,p=point(t),q=point(Math.min(1,t+.1)),length=.105*Math.sin(t*Math.PI)*(.8+(j%2)*.2);
      for(const side of [-1,1]) {
        const tip=[p[0]+Math.cos(a+side*1.1)*length,p[1]-.025,p[2]+Math.sin(a+side*1.1)*length];
        triangle(p,tip,q);
      }
      const r=point(Math.max(0,t-.09)),delta=.005;
      triangle([r[0]-Math.sin(a)*delta,r[1],r[2]+Math.cos(a)*delta],p,[r[0]+Math.sin(a)*delta,r[1],r[2]-Math.cos(a)*delta]);
    }
  }
  // Upright emerging fronds preserve the specified overall crown height.
  for(let j=0;j<5;j++){const a=j*Math.PI*2/5;triangle([0,.79,0],[Math.cos(a)*.055,1,Math.sin(a)*.055],[Math.cos(a+.7)*.02,.83,Math.sin(a+.7)*.02]);}
  const leaves=new THREE.BufferGeometry();leaves.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));leaves.setIndex(indices);leaves.computeVertexNormals();
  return [{geo:new THREE.CylinderGeometry(.024,.037,.8,9,5),color:'#766047',p:[0,.4,0]}, {geo:leaves,color:'#4d703e',p:[0,0,0],doubleSide:true}];
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
      :style==='stone'?`float grain=venueNoise(vVenuePosition.xz*15.0);float joint=step(.065,fract(vVenuePosition.x*2.7+floor(vVenuePosition.z*3.0)*.5))*step(.075,fract(vVenuePosition.z*3.0));diffuseColor.rgb*=mix(.53,.88+grain*.22,joint);`
      :`float grain=mix(.5,venueNoise(vVenuePosition.xz*20.0),clamp(1.0-length(fwidth(vVenuePosition.xz))*8.0,0.0,1.0));float broad=venueNoise(vVenuePosition.xz*.045);float stripe=sin((vVenuePosition.x+vVenuePosition.z*.42)*.55);diffuseColor.rgb*=.88+grain*.12+broad*.12+stripe*.05;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${detail}`);
    if(style==='water')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nvec3 venueWaveNormal=normalize(vec3(-cos(vVenuePosition.x*3.8+sin(vVenuePosition.z*2.7))*.04,1.0,-sin(vVenuePosition.z*5.0)*.025));normal=normalize((viewMatrix*vec4(venueWaveNormal,0.0)).xyz);');
  };
  return material;
}

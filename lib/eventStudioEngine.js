import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { scaledFootprint, localGroundPoint, tentFootprint, terrainHeight, standingHeight, groundHeight, reliefHeight, moundRise } from './eventStudioLayout.js';
import { supplierCanopy, supplierWalls } from './eventStudioTents.js';
import { MeasureOverlay } from './eventStudioMeasureOverlay.js';
import { measureSummary, snapCorners, formatLength } from './eventStudioMeasure.js';
export { localGroundPoint, tentFootprint };
import { perimeterExtrusion, carParts, CAR_STYLES, pagodaGeometry, gableGeometry, pyramidGeometry, roofMembers, clubhouseRoofGeometry, palmParts, lakeEdgeGeometry, detailSurface, surroundingWalls, surroundingRoofs, surroundingPosts } from './eventStudioGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
/** A settled pseudo-random number for an object id, so a repeated render matches exactly. */
const idNoise = id => { let hash = 2166136261; const text = String(id); for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return ((hash >>> 0) % 10000) / 10000; };
const clamp = THREE.MathUtils.clamp;
const pointInside = (x, z, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

export function tentWallSegments(object) {
  const supplier=supplierWalls(object);if(supplier)return supplier;
  const points = tentFootprint(object);
  const edges = points.map((a, i) => { const b = points[(i+1)%points.length]; return { a, b, x: (a[0]+b[0])/2, z: (a[1]+b[1])/2, length: Math.hypot(b[0]-a[0], b[1]-a[1]) }; });
  const entrance = [...edges].sort((a,b) => Math.abs(b.z-a.z) < .01 ? b.x-a.x : b.z-a.z)[0];
  // A specified booth opens the full width between its corner posts; the rest get a doorway.
  const booth = object.metadata?.booth;
  const opening = booth ? Math.max(.6, entrance.length - 2*(booth.post || .4)) : Math.min(3, entrance.length * .6);
  const segments = [];
  for (const edge of edges) {
    if (edge !== entrance) { segments.push([edge.a, edge.b]); continue; }
    const fraction = (edge.length-opening)/(2*edge.length), interpolate = t => [edge.a[0]+(edge.b[0]-edge.a[0])*t, edge.a[1]+(edge.b[1]-edge.a[1])*t];
    segments.push([edge.a, interpolate(fraction)], [interpolate(1-fraction), edge.b]);
  }
  return { points, segments, entrance: { center: [entrance.x, entrance.z], width: opening } };
}

function distanceToSegment(x, z, a, b) {
  const dx=b[0]-a[0], dz=b[1]-a[1], lengthSquared=dx*dx+dz*dz;
  const t=lengthSquared ? clamp(((x-a[0])*dx+(z-a[1])*dz)/lengthSquared,0,1) : 0;
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
function isVisible(object) { for(let current=object;current;current=current.parent) if(current.visible===false)return false; return true; }
function disposeModel(root) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of [].concat(object.material||[]))materials.add(material);});
  for(const material of materials)for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  geometries.forEach(value=>value.dispose());textures.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
}

export class EventStudioEngine {
  constructor(container, callbacks = {}) {
    this.container = container; this.callbacks = callbacks; this.disposed = false;
    this.world = new THREE.Scene(); this.world.background = new THREE.Color('#bdd7e8');
    this.world.fog = new THREE.Fog('#dcd9cc', 900, 2600);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false; this.shadowDirty = true;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D event layout. Select a tent or use the navigation controls.');
    container.appendChild(this.renderer.domElement);
    this.perspective = new THREE.PerspectiveCamera(46, 1, .25, 5000);
    this.perspective.position.set(230, 230, 290);
    this.orthographic = new THREE.OrthographicCamera(-300, 300, 200, -200, .1, 5000);
    this.camera = this.perspective;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .08;
    this.controls.maxPolarAngle = Math.PI * .495; this.controls.minDistance = 1; this.controls.maxDistance = 950;
    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    this.transform.setSize(.85); this.world.add(this.transform);
    this.transform.addEventListener('dragging-changed', e => {
      this.controls.enabled = !e.value && this.mode !== 'walk'; this.dragging = e.value;
      if (!e.value && this.transform.object && this.selectedId) {
        const o = this.transform.object;
        const original = this.data?.objects.find(x => x.id === this.selectedId);
        // A root is drawn at its stored elevation PLUS the ground beneath it, so the ground has to
        // come back off before the move is stored - and off the ground at the place it was dragged
        // TO, not where it started, or a piece would climb the slope a little on every drag.
        if (original && !original.locked && this.mode !== 'walk') {
          const moved = { ...original, position: [o.position.x, original.position[1], o.position.z] };
          const seat = standingHeight(this.data, moved);
          this.callbacks.onTransform?.(original.id, {
            position: [o.position.x, o.position.y - seat, o.position.z].map(v => +v.toFixed(3)),
            rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(v => +v.toFixed(5)),
          });
        }
      }
    });
    this.transform.addEventListener('objectChange', () => { this.updateSelectionBox(); this.updateFurnitureInstances(this.selectedId); this.shadowDirty = true; });
    // The ground light is an olive grey, the mix of turf, sand and paving, so undersides do not turn green.
    this.ambient = new THREE.HemisphereLight('#e4eefb', '#737a5e', 1.02); this.world.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#fff4de', 3.15);
    // The sun stands a long way off so the whole site sits in front of its shadow camera, and the
    // frustum reaches the far corners of a 572 x 281 m site, so it is sized from the diagonal rather
    // than the width. Shadows are redrawn only when the scene changes, so the larger map costs
    // nothing per frame; it steps down where the GPU cannot hold it. The frustum must be set before
    // setSunDirection, which is what commits it to the projection matrix.
    this.sunDistance = 620;
    const shadowReach = 340;
    Object.assign(this.sun.shadow.camera, { left: -shadowReach, right: shadowReach, top: shadowReach, bottom: -shadowReach, near: this.sunDistance - 380, far: this.sunDistance + 420 });
    const shadowSize = (this.renderer.capabilities.maxTextureSize || 2048) >= 8192 ? 4096 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize); this.sun.shadow.bias = -.00022; this.sun.shadow.normalBias = .06;
    this.setSunDirection(-90, 150, -65); this.sun.castShadow = true;
    this.world.add(this.sun, this.sun.target);
    this.buildSkyEnvironment(false);
    this.content = new THREE.Group(); this.world.add(this.content);
    // The neighbourhood around the venue: built once per source, never selectable or edited.
    this.surroundings = new THREE.Group(); this.surroundings.name = 'surroundings'; this.world.add(this.surroundings);
    this.skyDome = this.makeSkyDome(); this.world.add(this.skyDome); this.world.background = null;
    this.labels = new THREE.Group(); this.world.add(this.labels);
    this.floorGrid = new THREE.Group(); this.world.add(this.floorGrid);
    // The ruler: points clicked on the site, joined by a line that follows the mouse to the next one.
    this.measure = new MeasureOverlay(); this.world.add(this.measure.group);
    this.measuring = false; this.measurePoints = []; this.measureClosed = false; this.measureFinished = false; this.measureHover = null;
    this.box = new THREE.Box3Helper(new THREE.Box3(), '#d6a95b'); this.box.visible = false; this.world.add(this.box);
    this.modelCache = new Map(); this.modelTemplates = new Map(); this.materials = new Map(); this.boothMaterials = new Set(); this.backwallMaterials = new Map(); this.instanceMaterials = new Set(); this.roots = new Map(); this.loader = new GLTFLoader();
    this.keys = new Set(); this.joystick = [0, 0]; this.mode = 'orbit'; this.roofs = true; this.walls = true;
    this.showLabels = true; this.editing = false; this.generation = 0; this.pending = 0; this.failures = new Set();
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.clock = new THREE.Clock();
    this.cleanup = [];
    const listen = (target, name, fn, options) => { target.addEventListener(name, fn, options); this.cleanup.push(() => target.removeEventListener(name, fn, options)); };
    const canvas = this.renderer.domElement;
    listen(canvas, 'pointerdown', e => { this.down = { x: e.clientX, y: e.clientY, locked: document.pointerLockElement === canvas }; canvas.focus();
      // In walk mode a click hands the mouse to the view, so you can simply move it to look
      // around; Escape gives it back. Dragging still works for anyone who prefers holding on.
      if (this.mode === 'walk') { this.lookPointer = e.pointerId; if (e.pointerType !== 'touch' && document.pointerLockElement !== canvas) { try { const lock = canvas.requestPointerLock?.(); lock?.catch?.(() => {}); } catch {} } }
    });
    listen(window, 'pointerup', e => {
      if (this.lookPointer === e.pointerId) this.lookPointer = null;
      const click = e.target === canvas && this.down && !this.dragging && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5;
      // Measuring, a click places a point; in walk mode only once the mouse is captured, aiming from the middle.
      if (click && this.measuring) { if (this.mode !== 'walk' || this.down.locked) this.measureClick(e); }
      else if (click && this.mode !== 'walk') this.pick(e);
      this.down = null;
    });
    listen(canvas, 'pointerleave', () => { this.measureHover = null; });
    listen(canvas, 'pointermove', e => {
      if (this.measuring) this.measureHover = { x: e.clientX, y: e.clientY, free: e.altKey };
      if (this.mode !== 'walk' || (document.pointerLockElement !== canvas && this.lookPointer !== e.pointerId)) return;
      this.yaw -= (e.movementX || 0) * .003; this.pitch = clamp(this.pitch - (e.movementY || 0) * .003, -1.4, 1.4);
    });
    listen(canvas, 'wheel', e => {
      if (this.mode !== 'walk') return; // orbit and plan keep OrbitControls' own zoom
      e.preventDefault();
      this.walkTarget = null;
      const step = clamp(-e.deltaY * (e.deltaMode === 1 ? .6 : .025), -8, 8);
      this.walkBy(-Math.sin(this.yaw) * step, -Math.cos(this.yaw) * step);
    }, { passive: false });
    listen(canvas, 'dblclick', e => {
      if (this.measuring) { this.finishMeasure(); return; }
      // Double-click a spot you can see and you walk to it, so the site can be toured with the
      // mouse alone. Single click still hands the mouse to the view for looking around.
      if (this.mode !== 'walk') return;
      const point = this.groundPointAt(e);
      if (point) this.walkTarget = { x: point.x, z: point.z };
    });
    listen(document, 'pointerlockchange', () => this.callbacks.onPointerLock?.(document.pointerLockElement === canvas));
    listen(canvas, 'keydown', e => {
      // Escape clears the points; with none left it is passed on, and the studio closes the ruler.
      if (this.measuring && (['Enter', 'Backspace', 'Delete'].includes(e.key) || (e.key === 'Escape' && this.measurePoints.length))) { e.preventDefault(); if (e.key === 'Enter') this.finishMeasure(); else if (e.key === 'Escape') this.clearMeasure(); else this.undoMeasure(); return; }
      if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) { this.keys.add(e.code); if (this.mode === 'walk') e.preventDefault(); } });
    listen(window, 'keyup', e => this.keys.delete(e.code));
    listen(window, 'blur', () => { this.keys.clear(); this.joystick = [0, 0]; });
    listen(canvas, 'webglcontextlost', e => { e.preventDefault(); this.callbacks.onError?.('The graphics context was interrupted. Reload the studio to restore the view.'); });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize();
    this.animate = this.animate.bind(this); this.frame = requestAnimationFrame(this.animate);
  }

  mat(color = '#e7e2d4', extras = {}) {
    const key = JSON.stringify([color, extras]);
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .72, envMapIntensity:.15, ...extras }));
    return this.materials.get(key);
  }
  surfaceMat(color,style,extras={}) {
    const key=JSON.stringify(['surface',color,style,extras]);
    if(!this.materials.has(key))this.materials.set(key,detailSurface(new THREE.MeshStandardMaterial({color,roughness:.9,envMapIntensity:style==='water'?.45:.12,...extras}),style));
    return this.materials.get(key);
  }
  mesh(geo, mat, parent, position = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat); m.position.fromArray(position); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  boxMesh(w, h, d, mat, parent, p) { return this.mesh(new THREE.BoxGeometry(Math.max(.03,w), Math.max(.03,h), Math.max(.03,d)), mat, parent, p); }
  rod(a,b,r,mat,parent) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const mesh=this.mesh(new THREE.CylinderGeometry(r,r,direction.length(),5),mat,parent,start.add(end).multiplyScalar(.5).toArray());mesh.quaternion.setFromUnitVectors(UP,direction.normalize());return mesh;
  }
  /** A box-section member from a to b, hung with its depth upright as a rafter or beam is. */
  strut(a,b,width,depth,mat,parent) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),along=end.clone().sub(start),length=along.length();along.normalize();
    const side=new THREE.Vector3().crossVectors(along,UP);if(side.lengthSq()<1e-8)side.set(1,0,0);side.normalize();
    const mesh=this.mesh(new THREE.BoxGeometry(length,depth,width),mat,parent,start.add(end).multiplyScalar(.5).toArray());
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along,new THREE.Vector3().crossVectors(side,along),side));return mesh;
  }
  venueBuilding(o,root) {
    const [w,h,d]=o.dimensions,architecture=o.metadata?.architecture;
    const frame=this.mat(architecture==='royal-majlis'?'#657579':'#a7aaa3',{metalness:.65,roughness:.35});
    const glass=this.mat(architecture==='royal-majlis'?(o.color||'#8fb3b4'):(o.metadata?.glazingColor||'#7d989c'),{metalness:.4,roughness:.12,envMapIntensity:.85,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide});
    const concrete=this.mat(o.color||'#c3c0b3',{roughness:.85});
    if(architecture==='royal-majlis') {
      const shell=this.mesh(new THREE.CylinderGeometry(1,1,h,64,1,true),glass,root,[0,h/2,0]);shell.scale.set(w/2,1,d/2);
      // A shallow crowned roof, so the pavilion reads as a building rather than a disc from above.
      const roof=this.mesh(new THREE.ConeGeometry(1,.09,64,1),this.mat('#b9b2a0',{metalness:.3,roughness:.5}),root,[0,h+.04,0]);
      roof.scale.set(w/2*1.06,Math.max(1.4,w*.075)/.09,d/2*1.06);roof.userData.part='roof';
      const fascia=this.mesh(new THREE.CylinderGeometry(1,1,.34,64,1,true),frame,root,[0,h-.17,0]);fascia.scale.set(w/2*1.045,1,d/2*1.045);fascia.userData.part='roof';
      const base=this.mesh(new THREE.CylinderGeometry(1,1,.28,64),concrete,root,[0,.14,0]);base.scale.set(w/2*1.06,1,d/2*1.06);
      // Diameter and centre come from the PDF circle. Mullion spacing is a photographic estimate.
      const point=(a,y)=>[Math.cos(a)*(w/2+.02),y,Math.sin(a)*(d/2+.02)];
      for(let i=0;i<32;i++)this.rod(point(i*Math.PI/16,.28),point(i*Math.PI/16,h-.2),.045,frame,root);
      for(const level of [.34,.68])for(let i=0;i<32;i++)this.rod(point(i*Math.PI/16,h*level),point((i+1)*Math.PI/16,h*level),.035,frame,root);
      return;
    }
    const points=scaledFootprint(o),main=architecture==='royal-clubhouse-main';
    const profile=main?clubhouseRoofGeometry(points,h,o.metadata.roofAxis):null;
    const roof=main?this.mesh(profile.geometry,this.mat(o.color||'#bfc0b7',{side:THREE.DoubleSide,metalness:.25,roughness:.55}),root):this.shape(points,concrete,root,h);
    roof.userData.part='roof';
    this.mesh(perimeterExtrusion(points,.32),concrete,root);
    points.forEach((a,i)=>{
      const b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),bays=Math.max(1,Math.round(length/2.7));
      const interpolate=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      for(let j=0;j<bays;j++){
        const p=interpolate(j/bays),q=interpolate((j+1)/bays),hp=profile?profile.top(p):h,hq=profile?profile.top(q):h;
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([p[0],.3,p[1],q[0],.3,q[1],p[0],hp,p[1],q[0],hq,q[1]],3));geometry.setIndex([0,1,2,1,3,2]);geometry.computeVertexNormals();this.mesh(geometry,glass,root);
        this.rod([p[0],.3,p[1]],[p[0],hp,p[1]],.055,frame,root);
        this.rod([p[0],hp,p[1]],[q[0],hq,q[1]],.12,frame,root);
      }
      const angle=-Math.atan2(b[1]-a[1],b[0]-a[0]);
      for(const level of [0,.27,.53,.7]){const beam=this.boxMesh(length,.22,.22,concrete,root,[(a[0]+b[0])/2,h*level+.28,(a[1]+b[1])/2]);beam.rotation.y=angle;}
    });
  }
  batchObject(root) {
    const groups=new Map();
    for(const mesh of [...root.children])if(mesh.isMesh&&!Array.isArray(mesh.material)){
      // Only roofs and walls are switched on and off; everything else of one material merges together.
      const key=`${mesh.material.uuid}|${['roof','wall'].includes(mesh.userData.part)?mesh.userData.part:'fixed'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
    }
    for(const meshes of groups.values()){
      if(meshes.length<2)continue;const geometries=meshes.map(mesh=>{mesh.updateMatrix();let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(geometry.index){const expanded=geometry.toNonIndexed();geometry.dispose();geometry=expanded;}if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));return geometry;});let merged;
      try{merged=mergeGeometries(geometries,false);}catch{}geometries.forEach(geometry=>geometry.dispose());if(!merged)continue;
      const combined=this.mesh(merged,meshes[0].material,root);combined.userData.part=meshes[0].userData.part;combined.castShadow=meshes.some(mesh=>mesh.castShadow);combined.receiveShadow=meshes.some(mesh=>mesh.receiveShadow);
      for(const mesh of meshes){root.remove(mesh);mesh.geometry.dispose();}
    }
  }
  batchFurniture() {
    const groups=new Map();this.furnitureInstances=new Map();this.content.updateMatrixWorld(true);
    for(const object of this.data.objects){if(object.kind!=='furniture')continue;const root=this.roots.get(object.id);if(!root)continue;const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse(mesh=>{if(!mesh.isMesh||!mesh.userData.cachedModel||Array.isArray(mesh.material))return;const key=`${mesh.geometry.uuid}|${mesh.material.uuid}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id:object.id,root,mesh,local:inverse.clone().multiply(mesh.matrixWorld)});});
    }
    for(const entries of groups.values()){
      const first=entries[0].mesh,instances=new THREE.InstancedMesh(first.geometry,first.material,entries.length);instances.castShadow=first.castShadow;instances.receiveShadow=first.receiveShadow;instances.userData.cachedModel=true;instances.userData.instanceIds=entries.map(entry=>entry.id);instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      entries.forEach((entry,index)=>{instances.setMatrixAt(index,entry.mesh.matrixWorld);if(!this.furnitureInstances.has(entry.id))this.furnitureInstances.set(entry.id,[]);this.furnitureInstances.get(entry.id).push({mesh:instances,index,local:entry.local});entry.mesh.removeFromParent();});instances.instanceMatrix.needsUpdate=true;instances.computeBoundingSphere();this.content.add(instances);
    }
    this.shadowDirty=true;
  }
  updateFurnitureInstances(id) {
    const entries=this.furnitureInstances?.get(id),root=this.roots.get(id);if(!entries||!root)return;root.updateMatrixWorld(true);
    for(const entry of entries){entry.mesh.setMatrixAt(entry.index,new THREE.Matrix4().multiplyMatrices(root.matrixWorld,entry.local));entry.mesh.instanceMatrix.needsUpdate=true;entry.mesh.computeBoundingSphere();}
  }
  shape(points, material, parent, y = 0, drape = null) {
    if (!points || points.length < 3) return null;
    const s = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
    const geo = new THREE.ShapeGeometry(s); geo.rotateX(-Math.PI / 2);
    // A surface laid on the site follows the ground beneath it; a tent floor or a lake stays level.
    if (drape) {
      const position = geo.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) position.setY(i, position.getY(i) + drape(position.getX(i), position.getZ(i)));
      position.needsUpdate = true; geo.computeVertexNormals();
    }
    const mesh = this.mesh(geo, material, parent, [0,y,0]); mesh.castShadow = false; return mesh;
  }
  /** How much the ground rises across an object's own footprint, in that object's local frame. */
  groundDrape(o) {
    const fall = this.data?.site?.terrain?.northFallPerMetre || 0, cross = this.data?.site?.terrain?.crossFallPerMetre || 0;
    if (!fall && !cross) return null;
    const angle = o.rotation?.[1] || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    return (lx, lz) => fall * (lx*cos + lz*sin) + cross * (-lx*sin + lz*cos);
  }
  polygonRoof(w, d, eave, height, sides, mat, root) {
    const vertices = [], indices = [];
    if (sides === 4) {
      vertices.push(-w/2,eave,-d/2, w/2,eave,-d/2, w/2,eave,d/2, -w/2,eave,d/2, 0,height,0);
      indices.push(0,4,1,1,4,2,2,4,3,3,4,0);
    } else {
      for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;vertices.push(Math.cos(a)*w/2,eave,Math.sin(a)*d/2);}
      vertices.push(0,height,0); for(let i=0;i<sides;i++) indices.push(i,sides,(i+1)%sides);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geo.setIndex(indices); geo.computeVertexNormals();
    const roof = this.mesh(geo,mat,root); roof.userData.part='roof'; return roof;
  }
  supplierTent(o,root) {
    const [w,h,d]=o.dimensions,e=Math.min(h-.2,o.metadata.eaveHeight||2.8),mq=o.metadata.supplierTent==='mq40';
    const canvas=this.canvasMat(o.color||'#f5f3eb',.83);
    const frame=this.mat(mq?'#bdc0b9':'#292c29',mq?{metalness:.4,roughness:.38,envMapIntensity:.7}:{metalness:.6,roughness:.32});
    const tag=(mesh,part)=>{mesh.userData.part=part;return mesh;};
    tag(this.shape(tentFootprint(o),this.mat('#b6a78d'),root,.12),'floor');
    const {vertices,indices}=supplierCanopy(o),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();tag(this.mesh(geometry,canvas,root),'roof');
    const posts=mq?tentFootprint(o):[-w/2,-w/6,w/6,w/2].flatMap(x=>[[x,-d/2],[x,d/2]]);
    for(const [x,z] of posts)tag(this.rod([x,.12,z],[x,e,z],.055,frame,root),'frame');
    const points=tentFootprint(o),beamHeight=mq?Math.min(2.362,e-.1):e-.035;
    points.forEach((a,i)=>{const b=points[(i+1)%points.length];tag(this.rod([a[0],beamHeight,a[1]],[b[0],beamHeight,b[1]],.045,frame,root),'frame');});
    if(mq){
      tag(this.rod([0,beamHeight,0],[0,h-.06,0],.05,frame,root),'frame');
      for(const [x,z] of points)tag(this.rod([x,beamHeight,z],[0,beamHeight+.3,0],.035,frame,root),'frame');
    }else{
      const brass=this.mat('#bda36a',{metalness:.8,roughness:.27});
      for(const x of [-w/3,0,w/3]){
        tag(this.rod([x,h-.31,0],[x,h-.025,0],.025,brass,root),'roof');
        tag(this.mesh(new THREE.SphereGeometry(.065,10,8),brass,root,[x,h-.15,0]),'roof');
        tag(this.mesh(new THREE.ConeGeometry(.035,.07,10),brass,root,[x,h-.035,0]),'roof');
      }
      if(o.metadata.frontGlass){
        const clear=this.mat('#aac6c6',{transparent:true,opacity:.19,metalness:.15,roughness:.12,depthWrite:false,side:THREE.DoubleSide});
        for(let i=0;i<8;i++)tag(this.boxMesh(w/8-.04,e-.2,.025,clear,root,[-w/2+w/8*(i+.5),e/2+.02,d/2]),'wall');
        for(let i=0;i<=8;i++)tag(this.boxMesh(.035,e-.1,.05,frame,root,[-w/2+w*i/8,e/2+.04,d/2]),'wall');
        for(const y of [.13,e-.07])tag(this.boxMesh(w,.045,.06,frame,root,[0,y,d/2]),'wall');
      }
    }
  }
  tent(o, root) {
    if(o.metadata?.supplierTent){this.supplierTent(o,root);return;}
    const h = o.dimensions[1], eave = Math.min(h-.2, Number(o.metadata?.eaveHeight) || Math.min(3.2,h*.62));
    const ivory = this.canvasMat(o.color || '#f3eee4', .88);
    // Satin anodised aluminium: enough sky in it that the rafters read silver-grey indoors, not black.
    const frame = this.mat('#cdc9bd', { metalness: .4, roughness: .38, envMapIntensity: .7 });
    const {points,segments}=tentWallSegments(o);
    const floor=this.shape(points,this.mat('#b6a78d'),root,.12);floor.userData.part='floor';
    let roof;
    if(o.roofType==='flat')roof=this.shape(points,ivory,root,h);
    else if(o.roofType==='gable')roof=this.mesh(gableGeometry(points,eave,h,o.metadata?.ridge),ivory,root);
    else if(o.roofType==='hexagon')roof=this.mesh(pyramidGeometry(points,eave,h),ivory,root);
    else roof=this.mesh(pagodaGeometry(points,eave,h),ivory,root);
    roof.userData.part='roof';
    // The frame overhead, seen from inside. It goes with the roof so the plan view stays clear.
    const kind=['gable','hexagon','flat'].includes(o.roofType)?o.roofType:'pagoda';
    // Up there the members are lit mostly by the glowing fabric around them, not by the ground.
    const rafter=this.mat('#d3cfc4',{metalness:.35,roughness:.4,envMapIntensity:.6,emissive:'#a8a291',emissiveIntensity:.32});
    for(const {a,b,size} of roofMembers(kind,points,eave,h,o.metadata?.ridge)){const member=this.strut(a,b,size[0],size[1],rafter,root);member.userData.part='roof';member.castShadow=false;}
    // Marquee glazing is layered several panes deep from inside, so each pane stays faint.
    const clear = this.mat('#93aaa9',{transparent:true,opacity:.15,metalness:.1,roughness:.18,depthWrite:false,side:THREE.DoubleSide});
    const sideMat=o.metadata?.wallStyle==='solid'?ivory:clear,booth=o.metadata?.booth,front=o.dimensions[2]/2-.1;
    // A booth's backwall carries its graphic, so it is solid; the red posts fill the front either side of the opening.
    const back=booth&&segments.reduce((low,s)=>(s[0][1]+s[1][1])<(low[0][1]+low[1][1])?s:low);
    for(const [a,b] of segments){const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(booth&&(a[1]+b[1])/2>front&&length<=(booth.post||.4)+.05)continue;
      const wall=this.boxMesh(length,eave-.2,.055,booth&&back[0]===a&&back[1]===b?ivory:sideMat,root,[(a[0]+b[0])/2,eave/2,(a[1]+b[1])/2]);wall.rotation.y=-Math.atan2(dz,dx);wall.userData.part='wall';}
    points.forEach(([x,z],i)=>{
      const [nx,nz]=points[(i+1)%points.length],length=Math.hypot(nx-x,nz-z),angle=-Math.atan2(nz-z,nx-x);
      const bays=o.roofType==='hexagon'?1:Math.max(1,Math.round(length/5));
      for(let k=0;k<bays;k++){const post=this.boxMesh(.11,eave,.11,frame,root,[x+(nx-x)*k/bays,eave/2,z+(nz-z)*k/bays]);post.userData.part='frame';}
      const beam=this.boxMesh(length,.075,.075,frame,root,[(x+nx)/2,eave,(z+nz)/2]);beam.rotation.y=angle;beam.userData.part='beam';
      if(o.roofType==='pagoda'&&!(booth&&(z+nz)/2>front)){const valance=this.boxMesh(length,.18,.025,ivory,root,[(x+nx)/2,eave-.06,(z+nz)/2]);valance.rotation.y=angle;valance.userData.part='roof';}
    });
    if(booth)this.boothDressing(o,root,eave);
  }
  /**
   * Pico's 5 × 5 m booth elevation: red-clad corner posts and header, a lit fascia graphic over the
   * opening and a backwall graphic inside. Sizes come from the drawing via metadata.booth.
   */
  boothDressing(o,root,eave) {
    const spec=o.metadata.booth,[w,,d]=o.dimensions,post=spec.post||.4,{fascia,backwall}=spec;
    const red=this.mat(spec.frameColor||'#de2826',{roughness:.55});
    const tag=(mesh,part)=>{mesh.userData.part=part;return mesh;};
    for(const x of [-w/2+post/2,w/2-post/2])tag(this.boxMesh(post,eave,post,red,root,[x,eave/2,d/2-post/2]),'frame');
    const top=fascia.bottom+fascia.height,header=Math.max(.05,eave-top);
    tag(this.boxMesh(w,header,post,red,root,[0,eave-header/2,d/2-post/2]),'frame');
    tag(this.boxMesh(fascia.width,fascia.height,.05,this.mat('#f2f0ec',{roughness:.7}),root,[0,fascia.bottom+fascia.height/2,d/2-.06]),'frame');
    tag(this.mesh(new THREE.PlaneGeometry(fascia.width,fascia.height),this.fasciaMaterial(o),root,[0,fascia.bottom+fascia.height/2,d/2-.03]),'frame');
    // The LED strip sits under the header and washes the fascia; it glows rather than lights the scene.
    tag(this.boxMesh(fascia.width,.03,.05,this.mat('#fff8ea',{emissive:'#ffe9c4',emissiveIntensity:1.4,roughness:.4}),root,[0,top-.02,d/2-.02]),'frame');
    tag(this.mesh(new THREE.PlaneGeometry(backwall.width,backwall.height),this.backwallMaterial(backwall),root,[0,.07+backwall.height/2,-d/2+.06]),'wall');
  }
  /** A turf dome on the slope, built on the same profile the layout uses to seat cars and walkers on it. */
  mound(o,root,material,offset,drape) {
    const radius=o.dimensions[0]/2,height=o.metadata.relief.height||o.dimensions[1],rings=16,sides=48,vertices=[0,height,0],indices=[];
    for(let ring=1;ring<=rings;ring+=1){const r=radius*ring/rings,y=moundRise(r-1e-6,radius,height);
      for(let side=0;side<sides;side+=1){const a=side*2*Math.PI/sides;vertices.push(r*Math.cos(a),y,r*Math.sin(a));}}
    for(let side=0;side<sides;side+=1)indices.push(0,1+(side+1)%sides,1+side);
    for(let ring=0;ring<rings-1;ring+=1)for(let side=0;side<sides;side+=1){
      const a=1+ring*sides+side,b=1+ring*sides+(side+1)%sides,c=a+sides,d=b+sides;indices.push(a,d,c,a,b,d);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
    if(drape){const position=geometry.getAttribute('position');for(let i=0;i<position.count;i+=1)position.setY(i,position.getY(i)+drape(position.getX(i),position.getZ(i)));}
    geometry.computeVertexNormals();
    // Turf takes the shadows a low dome throws in the evening, which is what makes it read as a rise.
    const mesh=this.mesh(geometry,material,root,[0,offset,0]);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
  }
  /** One canvas per booth: the RBC mark, the exhibitor's name and a space for their logo, as on the elevation. */
  fasciaMaterial(o) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=122;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    const draw=()=>{const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
      const logo=this.rbcLogo?.complete&&this.rbcLogo.naturalWidth?this.rbcLogo:null;
      if(logo){const lh=H*.36,lw=lh*logo.naturalWidth/logo.naturalHeight;ctx.drawImage(logo,W*.02,H*.06,lw,lh);}
      ctx.fillStyle='#00263a';ctx.fillRect(W*.86,H*.08,W*.115,H*.2);
      ctx.fillStyle='#ffffff';ctx.font=`600 ${Math.round(H*.1)}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('LOGO',W*.917,H*.18);
      const name=(o.metadata.booth.brand||o.name||'').trim();let size=H*.36;
      ctx.font=`700 ${Math.round(size)}px Arial, sans-serif`;while(ctx.measureText(name).width>W*.62&&size>12){size-=2;ctx.font=`700 ${Math.round(size)}px Arial, sans-serif`;}
      ctx.fillStyle='#00263a';ctx.fillText(name,W/2,H*.54);
      ctx.fillStyle='#8a8d96';ctx.font=`500 ${Math.round(H*.075)}px Arial, sans-serif`;ctx.textAlign='right';ctx.fillText(`Fascia graphic ${Math.round(o.metadata.booth.fascia.width*1000)} × ${Math.round(o.metadata.booth.fascia.height*1000)} mm`,W*.975,H*.9);
      texture.needsUpdate=true;this.shadowDirty=true;};
    draw();
    if(!this.rbcLogo){this.rbcLogo=new Image();this.rbcLogo.src='/event-studio/rbc-logo-2026.png';this.logoWaiting=[];this.rbcLogo.onload=()=>{for(const redraw of this.logoWaiting)redraw();this.logoWaiting=[];};}
    if(!this.rbcLogo.complete)this.logoWaiting.push(draw);
    const material=new THREE.MeshStandardMaterial({map:texture,emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:this.evening?.62:0,roughness:.62,envMapIntensity:.15});
    this.boothMaterials.add(material);return material;
  }
  /** The exhibitor's artwork is not known yet, so the panel shows its print size in the event colours. */
  backwallMaterial(spec) {
    const key=`${spec.width}x${spec.height}`;
    if(!this.backwallMaterials.has(key)){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
      const gradient=ctx.createLinearGradient(0,0,512,256);gradient.addColorStop(0,'#00263a');gradient.addColorStop(1,'#0d3d57');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
      ctx.fillStyle='#de2826';ctx.beginPath();ctx.moveTo(40,256);ctx.lineTo(118,0);ctx.lineTo(148,0);ctx.lineTo(70,256);ctx.closePath();ctx.fill();
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 30px Arial, sans-serif';ctx.fillText('Backwall graphic',300,112);
      ctx.font='500 22px Arial, sans-serif';ctx.fillStyle='#c9d3da';ctx.fillText(`${Math.round(spec.width*1000)} × ${Math.round(spec.height*1000)} mm · exhibitor artwork`,300,150);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      this.backwallMaterials.set(key,new THREE.MeshStandardMaterial({map:texture,roughness:.7,envMapIntensity:.12}));
    }
    return this.backwallMaterials.get(key);
  }
  /**
   * A soft patch under each piece. Tent interiors sit in the roof's shadow, lit only by sky
   * light, so without this the furniture appears to float on an evenly lit floor.
   */
  contactShadow(o,root,width,depth) {
    if(!this.contactShadowGeometry){
      const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');
      const gradient=ctx.createRadialGradient(32,32,2,32,32,31);
      gradient.addColorStop(0,'rgba(0,0,0,.44)');gradient.addColorStop(.55,'rgba(0,0,0,.22)');gradient.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      const texture=new THREE.CanvasTexture(c);
      this.contactShadowGeometry=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
      this.contactShadowMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.85});
      this.materials.set('contact-shadow',this.contactShadowMaterial);
    }
    const patch=new THREE.Mesh(this.contactShadowGeometry,this.contactShadowMaterial);
    patch.scale.set(Math.max(.2,width*1.35),1,Math.max(.2,depth*1.35));patch.position.y=.008;
    patch.renderOrder=1;patch.userData.cachedModel=true; // shares geometry and material, so it instances with the rest
    root.add(patch);
  }
  label(o) {
    const text=o.name.length>27?o.name.slice(0,26)+'…':o.name;
    const c=document.createElement('canvas'),ctx=c.getContext('2d');
    const font='500 31px Arial';ctx.font=font;
    // The plate is cut to the name, so a short label never reads as a long black bar.
    c.width=Math.ceil(Math.min(512,ctx.measureText(text).width+56));c.height=100;
    const draw=c.getContext('2d');draw.font=font;
    draw.fillStyle='rgba(24,43,41,.82)';draw.beginPath();draw.roundRect(1,1,c.width-2,98,22);draw.fill();
    draw.fillStyle='#f7f4e9';draw.textAlign='center';draw.textBaseline='middle';draw.fillText(text,c.width/2,52,c.width-30);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,transparent:true}));
    sprite.position.set(o.position[0],o.position[1]+standingHeight(this.data,o)+o.dimensions[1]+2,o.position[2]);
    Object.assign(sprite.userData,{label:true,id:o.id,aspect:c.width/100,span:Math.max(o.dimensions[0],o.dimensions[2])});
    this.labels.add(sprite);
  }
  async model(asset) {
    const cacheKey=`${asset.id}|${asset.modelUrl}`;
    if(this.modelCache.has(cacheKey)) return this.modelCache.get(cacheKey);
    const promise=this.loader.loadAsync(asset.modelUrl).then(gltf=>{
      if(this.disposed){disposeModel(gltf.scene);throw new Error('Studio closed');}
      gltf.scene.updateMatrixWorld(true);const groups=new Map();
      gltf.scene.traverse(child=>{if(!child.isMesh)return; const geo=child.geometry.clone().applyMatrix4(child.matrixWorld); const mat=Array.isArray(child.material)?child.material[0]:child.material; const key=mat.uuid; if(!groups.has(key))groups.set(key,{mat,geos:[]});groups.get(key).geos.push(geo);});
      const root=new THREE.Group();
      for(const {mat,geos} of groups.values()) {
        mat.envMapIntensity=mat.metalness>.5?.3:.12;
        const normalized=geos.map(geometry=>geometry.index?geometry.toNonIndexed():geometry);let merged;
        try{merged=mergeGeometries(normalized,false);}catch{}
        if(merged){const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
        else for(const geometry of normalized){const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
        for(const geometry of new Set([...geos,...(merged?normalized:[])]))if(merged||!normalized.includes(geometry))geometry.dispose();
      }
      const sourceGeometries=new Set();gltf.scene.traverse(child=>{if(child.geometry)sourceGeometries.add(child.geometry);});sourceGeometries.forEach(geometry=>geometry.dispose());
      root.traverse(child=>{if(child.isMesh)child.userData.cachedModel=true;});this.modelTemplates.set(cacheKey,root);
      return root;
    }).catch(error=>{this.modelCache.delete(cacheKey);throw error;}); this.modelCache.set(cacheKey,promise); return promise;
  }
  async attachModel(o,root,generation) {
    const asset=this.assets.get(o.assetId)||[...this.assets.values()].find(a=>String(a.productId)===String(o.productId));
    if(!asset?.modelUrl) return;
    this.pending++; this.callbacks.onAssets?.({loading:this.pending,failed:this.failures.size});
    try { const template=await this.model(asset); if(this.disposed||generation!==this.generation)return;
      root.children.filter(c=>c.userData.placeholder).forEach(c=>{root.remove(c);c.geometry.dispose();});
      const clone=template.clone(true); const dims=asset.dimensions||o.dimensions;
      if(o.color && o.color.toLowerCase() !== (asset.color||'').toLowerCase()) {
        const overrides=new Map();this.instanceMaterials ||= new Set();
        const tint=material=>{if(!material?.color||material.transparent||material.opacity<.95||material.metalness>=.5)return material;if(!overrides.has(material)){const override=material.clone();override.color.set(o.color);overrides.set(material,override);this.instanceMaterials.add(override);}return overrides.get(material);};
        clone.traverse(child=>{if(child.isMesh)child.material=Array.isArray(child.material)?child.material.map(tint):tint(child.material);});
      }
      clone.scale.set(o.dimensions[0]/dims[0],o.dimensions[1]/dims[1],o.dimensions[2]/dims[2]); root.add(clone);this.failures.delete(asset.id);
    } catch {if(!this.disposed&&generation===this.generation){this.failures.add(asset.id);root.userData.modelFailed=true;}}
    finally {if(!this.disposed&&generation===this.generation){this.pending=Math.max(0,this.pending-1);if(this.pending===0)this.batchFurniture();this.callbacks.onAssets?.({loading:this.pending,failed:this.failures.size});}}
  }
  addObject(o,generation) {
    if(o.visible===false)return; const root=new THREE.Group();root.userData.objectId=o.id;root.position.fromArray(o.position);root.rotation.fromArray([...o.rotation,'XYZ']);
    // Everything stands on the measured ground; a piece inside a tent rides that tent's level floor.
    root.position.y+=standingHeight(this.data,o);
    this.roots.set(o.id,root);this.content.add(root);const [w,h,d]=o.dimensions; const mat=this.mat(o.color||'#d5c7a9');
    if(o.kind==='tent') this.tent(o,root);
    else if(['ground','path','water'].includes(o.kind)){
      const layer=this.surfaceLayers?.get(o.id)||0,offset={ground:.005,water:.018,path:.065}[o.kind]+layer*.001;
      const style=o.kind==='water'?'water':o.metadata?.surface==='bunker'?'sand':'grass';
      // Every stacked surface needs the same kind of depth bias, paths included, and it has to stay
      // small: the layer index now reaches 72, and -73 units of bias is metres of depth at this range.
      const bias={polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1-Math.min(layer,8)};
      const material=o.kind==='path'?this.mat(o.color||'#b9b4a6',{roughness:.92,...bias}):this.surfaceMat(o.color||(o.kind==='water'?'#466d70':'#5f853c'),style,{...(o.kind==='water'?{roughness:.2,metalness:.28}:{}),...bias});
      const points=scaledFootprint(o),drape=this.groundDrape(o);
      if(o.metadata?.relief)this.mound(o,root,material,offset,drape);
      else if(o.points?.length>2)this.shape(points,material,root,offset,drape);else this.boxMesh(w,Math.max(.02,h),d,material,root,[0,h/2+offset,0]);
      if(o.kind==='water'&&o.metadata?.stoneEdge){
        // The coping follows the same slope as the water it retains, or the two part company by
        // more than two metres across a 325 m lake.
        const geometry=lakeEdgeGeometry(points);
        if(drape){const position=geometry.getAttribute('position');
          for(let i=0;i<position.count;i+=1)position.setY(i,position.getY(i)+drape(position.getX(i),position.getZ(i)));
          position.needsUpdate=true;geometry.computeVertexNormals();}
        const edge=this.mesh(geometry,this.surfaceMat('#948975','stone'),root);edge.castShadow=false;}
    } else if(o.kind==='furniture') {
      const placeholder=this.boxMesh(w,h,d,this.mat(o.color||'#d1baa0',{wireframe:true}),root,[0,h/2,0]);placeholder.userData.placeholder=true;
      this.contactShadow(o,root,w,d);
      this.attachModel(o,root,generation);
    } else if(o.kind==='building') {
      if(o.metadata?.architecture?.startsWith('royal-'))this.venueBuilding(o,root);
      else{const points=scaledFootprint(o);this.mesh(perimeterExtrusion(points,h),mat,root);this.shape(points,this.mat('#9b9589'),root,h+.015);}
    } else if(o.kind==='stage') {
      // A riser with a boarded deck on top, rather than a flat plate lying on the grass.
      const points=scaledFootprint(o),rise=Math.max(.25,h);
      this.mesh(perimeterExtrusion(points,rise),this.mat(o.color||'#6d6961',{roughness:.88}),root);
      const deck=this.shape(points,this.mat('#9c927e',{roughness:.7}),root,rise+.012);if(deck)deck.userData.part='floor';
      // A dark nosing around the edge reads as a stage lip without flattening the whole deck.
      points.forEach((a,i)=>{const b=points[(i+1)%points.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        const trim=this.boxMesh(length,.09,.14,this.mat('#3b413e',{roughness:.6}),root,[(a[0]+b[0])/2,rise-.04,(a[1]+b[1])/2]);trim.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);});
    } else if(o.kind==='sign') {
      this.boxMesh(.12,Math.max(1,h-.7),.12,this.mat('#5b625b'),root,[0,h/2-.2,0]);this.boxMesh(w,.8,.15,mat,root,[0,h-.4,0]);
    } else this.boxMesh(w,h,d,mat,root,[0,h/2,0]);
    if(['tent','building','stage','sign'].includes(o.kind))this.batchObject(root);
    if(['tent','stage'].includes(o.kind))this.label(o);
  }
  instances(objects,kind) {
    if(!objects.length)return;
    if(kind==='car'){
      // Two bodies, a coupé and a roadster, picked per car (or set in its metadata) and built once.
      this.carGeometry=this.carGeometry||Object.fromEntries(CAR_STYLES.map(style=>[style,carParts(style)]));
      const groups=new Map();
      for(const o of objects){const style=CAR_STYLES.includes(o.metadata?.carStyle)?o.metadata.carStyle:idNoise(`${o.id}body`)<.62?'coupe':'roadster';if(!groups.has(style))groups.set(style,[]);groups.get(style).push(o);}
      for(const [style,list] of groups)this.instanceParts(list,this.carGeometry[style],kind,true);
      return;
    }
    this.palmGeometry=this.palmGeometry||palmParts();
    this.instanceParts(objects,this.palmGeometry,kind,true);
  }
  /**
   * Leaves seen from both sides, lit by the normals the geometry gives them. A double-sided material
   * normally turns the normal round on the underside, which leaves every frond seen from below black.
   */
  foliageMat(color) {
    const key=`foliage|${color}`;
    if(this.materials.has(key))return this.materials.get(key);
    const material=new THREE.MeshStandardMaterial({color,roughness:.82,side:THREE.DoubleSide,envMapIntensity:.35});
    material.customProgramCacheKey=()=>'foliage-v1';
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif');};
    this.materials.set(key,material);return material;
  }
  /**
   * Tent fabric. White PVC lets light through, so from inside a marquee the roof glows rather than
   * reading as a dark lid: a little from the sky, more where the sun falls on the outer face, so the
   * sunlit slope outshines the shaded one. At dusk the event lighting inside makes the marquee glow,
   * more faintly seen from outside. Front faces are the outside; the roof builders keep them so.
   */
  canvasMat(color,roughness=.88) {
    const key=`canvas|${color}|${roughness}`;
    if(this.materials.has(key))return this.materials.get(key);
    this.canvasLight=this.canvasLight||{daylight:{value:.2},sun:{value:.075},lamps:{value:new THREE.Color(0,0,0)}};
    const material=new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide,envMapIntensity:.15});
    material.customProgramCacheKey=()=>'tent-canvas-v2';
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{canvasDaylight:this.canvasLight.daylight,canvasSun:this.canvasLight.sun,canvasLamps:this.canvasLight.lamps});
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float canvasDaylight;\nuniform float canvasSun;\nuniform vec3 canvasLamps;')
        .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{
  vec3 through=vec3(canvasDaylight);
  #if NUM_DIR_LIGHTS > 0
    through+=canvasSun*directionalLights[0].color*max(0.,dot(-normal,directionalLights[0].direction));
  #endif
  totalEmissiveRadiance+=diffuseColor.rgb*(gl_FrontFacing?canvasLamps*.45:through+canvasLamps);
}`);
    };
    this.materials.set(key,material);return material;
  }
  /** Car finishes: clear-coated paint, tinted glass, polished chrome, rubber, leather and lamps. */
  finishMat(part) {
    const key=`finish|${part.finish}|${part.color}`;
    if(this.materials.has(key))return this.materials.get(key);
    const settings={
      paint:()=>new THREE.MeshPhysicalMaterial({color:part.color,metalness:.35,roughness:.32,clearcoat:1,clearcoatRoughness:.07,envMapIntensity:.95}),
      glass:()=>new THREE.MeshPhysicalMaterial({color:part.color,metalness:.2,roughness:.05,envMapIntensity:1.5}),
      chrome:()=>new THREE.MeshStandardMaterial({color:part.color,metalness:1,roughness:.12,envMapIntensity:1.4}),
      rubber:()=>new THREE.MeshStandardMaterial({color:part.color,roughness:.92,metalness:0,envMapIntensity:.2}),
      trim:()=>new THREE.MeshStandardMaterial({color:part.color,roughness:.6,envMapIntensity:.3}),
      tail:()=>new THREE.MeshStandardMaterial({color:part.color,roughness:.35,emissive:'#4d0707',envMapIntensity:.6}),
      lamp:()=>new THREE.MeshStandardMaterial({color:part.color,roughness:.15,emissive:'#fff4d6',emissiveIntensity:.25,envMapIntensity:1}),
    };
    const material=(settings[part.finish]||(()=>this.mat(part.color)))();
    this.materials.set(key,material);return material;
  }
  instanceParts(objects,parts,kind,cached) {
    const dummy=new THREE.Object3D(),paint=new THREE.Color();
    // Each entry's pose is worked out once. A car parked on a driving-range mound rests on its four
    // wheels and tilts with the dome, instead of hovering level over it.
    const poses=objects.map(o=>{
      const [x,,z]=o.position,yaw=o.rotation[1],rotation=new THREE.Euler(o.rotation[0],yaw,o.rotation[2],'YXZ');
      const relief=(lx,lz)=>reliefHeight(this.data,x+lx*Math.cos(yaw)+lz*Math.sin(yaw),z-lx*Math.sin(yaw)+lz*Math.cos(yaw));
      let y=terrainHeight(this.data?.site,x,z);
      if(kind==='car'){
        const halfTrack=o.dimensions[0]*.4,halfBase=o.dimensions[2]*.32;
        const fl=relief(-halfTrack,halfBase),fr=relief(halfTrack,halfBase),rl=relief(-halfTrack,-halfBase),rr=relief(halfTrack,-halfBase);
        if(fl||fr||rl||rr){y+=(fl+fr+rl+rr)/4;rotation.x=Math.atan2((rl+rr)-(fl+fr),4*halfBase);rotation.z=Math.atan2((fr+rr)-(fl+rl),4*halfTrack);}
      }
      return {y,matrix:new THREE.Matrix4().makeRotationFromEuler(rotation),rotation};
    });
    for(const part of parts) {const material=part.finish?this.finishMat(part):part.foliage?this.foliageMat(part.color):this.mat(part.color,{side:part.doubleSide?THREE.DoubleSide:THREE.FrontSide,...(part.tint?{metalness:.3,roughness:.38,envMapIntensity:.45}:{})});
      const inst=new THREE.InstancedMesh(part.geo,material,objects.length);inst.userData.instanceIds=objects.map(o=>o.id);inst.castShadow=true;inst.receiveShadow=true;if(cached)inst.userData.cachedModel=true;
      objects.forEach((o,i)=>{const pose=poses[i];const p=new THREE.Vector3(part.p[0]*o.dimensions[0],part.p[1]*o.dimensions[1],part.p[2]*o.dimensions[2]).applyMatrix4(pose.matrix);dummy.position.fromArray(o.position).add(p);dummy.position.y+=pose.y;dummy.rotation.copy(pose.rotation);dummy.scale.fromArray(o.dimensions);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
        // Painted panels carry each entry's own colour; glass, tyres and brightwork do not.
        if(part.tint)inst.setColorAt(i,paint.set(o.color||'#d8d2c4'));
        // A plantation of identical clones reads as a model, so each palm is shaded a little
        // differently. The shift is keyed to the object id, so a repeated render matches exactly.
        else if(part.vary){paint.set(part.ownColour?o.color||part.color:part.color).offsetHSL((idNoise(o.id)-.5)*.045,(idNoise(o.id+'s')-.5)*.14,(idNoise(o.id+'l')-.42)*.12);inst.setColorAt(i,paint);}});
      inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor)inst.instanceColor.needsUpdate=true;inst.computeBoundingSphere();this.content.add(inst);}
  }
  disposeContent() {
    this.transform.detach(); this.roots.clear();
    this.content.traverse(o=>{if(o.geometry&&!o.userData.cachedModel)o.geometry.dispose();if(o.isInstancedMesh)o.dispose();});this.furnitureInstances?.clear();
    for(const material of this.instanceMaterials||[])material.dispose();this.instanceMaterials?.clear();
    // Fascias are drawn per booth and per rebuild, so each rebuild hands back the last set.
    for(const material of this.boothMaterials||[]){material.map?.dispose();material.dispose();}this.boothMaterials?.clear();this.logoWaiting=[];
    this.content.clear();this.labels.traverse(o=>{o.material?.map?.dispose();o.material?.dispose();});this.labels.clear();
  }
  /**
   * The ground as it is: turf, sand, water and paving classified from satellite imagery, draped on the
   * measured slope. Desert carries on beyond the mapped square so its edge never meets the sky.
   */
  addGround(data) {
    const context=data.site.context,b=context.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
    const plane=(width,depth,drop)=>{const geometry=new THREE.PlaneGeometry(width,depth,1,1).rotateX(-Math.PI/2),position=geometry.getAttribute('position');
      for(let i=0;i<position.count;i+=1)position.setY(i,terrainHeight(data.site,position.getX(i)+cx,position.getZ(i)+cz)-drop);
      position.needsUpdate=true;geometry.computeVertexNormals();return geometry;};
    // Desert all round the mapped square, as a ring: two sheets one above the other would flicker
    // where depth precision runs out at a distance.
    const outer=new THREE.Shape([new THREE.Vector2(-3000,-3000),new THREE.Vector2(3000,-3000),new THREE.Vector2(3000,3000),new THREE.Vector2(-3000,3000)]);
    outer.holes.push(new THREE.Path([new THREE.Vector2(-w/2,-d/2),new THREE.Vector2(-w/2,d/2),new THREE.Vector2(w/2,d/2),new THREE.Vector2(w/2,-d/2)]));
    const ring=new THREE.ShapeGeometry(outer).rotateX(-Math.PI/2),ringPosition=ring.getAttribute('position');
    for(let i=0;i<ringPosition.count;i+=1)ringPosition.setY(i,terrainHeight(data.site,ringPosition.getX(i)+cx,ringPosition.getZ(i)+cz)-.05);
    ringPosition.needsUpdate=true;ring.computeVertexNormals();
    const desert=this.mesh(ring,this.surfaceMat('#d8c9a6','sand'),this.content,[cx,0,cz]);desert.castShadow=false;desert.userData.ground=true;
    if(this.groundSource!==context.ground){
      this.groundSource=context.ground;this.groundTexture?.dispose();this.groundTexture=null;
      this.groundMaterial=this.groundMaterial||detailSurface(new THREE.MeshStandardMaterial({color:'#a9b48a',roughness:.96,envMapIntensity:.12,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:4}),'ground');
      this.groundMaterial.map=null;this.groundMaterial.color.set('#a9b48a');this.groundMaterial.needsUpdate=true;
      new THREE.TextureLoader().load(context.ground,texture=>{
        if(this.disposed||this.groundSource!==context.ground){texture.dispose();return;}
        texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        this.groundTexture=texture;this.groundMaterial.map=texture;this.groundMaterial.color.set('#ffffff');this.groundMaterial.needsUpdate=true;this.shadowDirty=true;
      });
    }
    const ground=this.mesh(plane(w,d,.05),this.groundMaterial,this.content,[cx,0,cz]);ground.castShadow=false;ground.userData.ground=true;
  }
  /** Buildings around the venue, from mapped footprints, with estimated heights. Loaded once. */
  loadSurroundings(context) {
    const source=context?.features||null;
    if(source===this.surroundingsSource)return;
    this.surroundingsSource=source;
    for(const child of [...this.surroundings.children]){child.geometry?.dispose();this.surroundings.remove(child);}
    if(!source)return;
    fetch(source).then(response=>response.ok?response.json():Promise.reject(new Error(`${response.status}`))).then(features=>{
      if(this.disposed||this.surroundingsSource!==source)return;
      const site=this.data?.site,walls=[],roofs=[],canopies=[];
      for(const building of features.buildings||[]){
        const points=building.points;if(!points?.length||points.length<3)continue;
        const cx=points.reduce((t,p)=>t+p[0],0)/points.length,cz=points.reduce((t,p)=>t+p[1],0)/points.length;
        const base=terrainHeight(site,cx,cz),top=base+building.height,tint=.94+idNoise(`${cx.toFixed(1)}${cz.toFixed(1)}`)*.08;
        if(building.kind==='canopy'){canopies.push({points,base,top,tint});continue;}
        walls.push({points,base,top,tint});roofs.push({points,top,tint});
      }
      const wallGeometry=surroundingWalls(walls),roofGeometry=surroundingRoofs(roofs,.04),canopyGeometry=mergeGeometries([surroundingRoofs(canopies,.25),surroundingPosts(canopies)].filter(Boolean),false);
      const add=(geometry,material)=>{if(!geometry)return;const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;this.surroundings.add(mesh);};
      add(wallGeometry,this.villaWallMaterial());add(roofGeometry,this.mat('#d4cdbd',{vertexColors:true,roughness:.92}));add(canopyGeometry,this.mat('#e9e6df',{vertexColors:true,roughness:.8}));
      this.shadowDirty=true;
    }).catch(error=>{if(this.surroundingsSource===source)console.warn('Surroundings were not loaded:',error.message);});
  }
  /** Villa walls in warm off-white, with two storeys of windows drawn in the shader. */
  villaWallMaterial() {
    if(this.materials.has('villa-walls'))return this.materials.get('villa-walls');
    const material=new THREE.MeshStandardMaterial({color:'#efe9dc',roughness:.9,envMapIntensity:.15,vertexColors:true});
    material.customProgramCacheKey=()=>'villa-walls-v1';
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 facade;\nvarying vec2 vFacade;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFacade=facade;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vFacade;').replace('#include <color_fragment>',`#include <color_fragment>
        // vFacade.x runs along the wall in metres, vFacade.y up from the ground. Two storeys of 3.4 m.
        float storey=floor(vFacade.y/3.4), inStorey=mod(vFacade.y,3.4), bay=mod(vFacade.x,3.6);
        float glazed=step(.95,inStorey)*step(inStorey,2.45)*step(.7,bay)*step(bay,2.9)*step(storey,1.5)*step(.5,vFacade.y);
        float band=step(3.25,inStorey)*step(inStorey,3.4)*.12;
        diffuseColor.rgb=mix(diffuseColor.rgb*(1.0-band),vec3(.16,.2,.23),glazed*.88);`);
    };
    this.materials.set('villa-walls',material);return material;
  }
  setScene(data,assets=[]) {
    const generation=++this.generation;this.data=data;this.snapCache=null;this.assets=new Map(assets.map(a=>[a.id,a]));this.disposeContent();this.pending=0;this.failures.clear();this.walkBoundaries=new Map(data.objects.filter(o=>o.kind==='tent').map(o=>[o.id,tentWallSegments(o)]));this.surfaceLayers=new Map(data.objects.filter(o=>['ground','water','path'].includes(o.kind)).sort((a,b)=>a.id.localeCompare(b.id)).map((o,index)=>[o.id,index]));this.footprints=new Map(data.objects.filter(o=>['building','water'].includes(o.kind)).map(o=>[o.id,scaledFootprint(o)]));this.shadowDirty=true;this.callbacks.onAssets?.({loading:0,failed:0});
    const b=data.site.bounds;const width=b.maxX-b.minX,depth=b.maxZ-b.minZ;
    if(data.site.context?.ground&&data.site.context?.bounds)this.addGround(data);
    else{const base=this.boxMesh(width+60,.3,depth+60,this.surfaceMat(data.site.appearance?.turfColor||'#71924c','grass'),this.content,[(b.minX+b.maxX)/2,-.2,(b.minZ+b.maxZ)/2]);base.castShadow=false;
      base.rotation.z=Math.atan(data.site.terrain?.northFallPerMetre||0);base.rotation.x=-Math.atan(data.site.terrain?.crossFallPerMetre||0);}
    this.loadSurroundings(data.site.context);
    const cars=[],trees=[];
    for(const o of data.objects) {if(o.visible===false)continue;if(o.kind==='car')cars.push(o);else if(o.kind==='tree')trees.push(o);else this.addObject(o,generation);}
    this.instances(cars,'car');this.instances(trees,'tree');
    this.applyVisibility();if(this.selectedId)this.select(this.selectedId);this.updateFloorGrid();
    if(!this.initialized){this.initialized=true;const v=data.views?.[0];if(v)this.goTo(v,false);else this.home();}
  }
  // A plan is drawn through the tents, so the roof lifts off in the top view whatever the toggle says.
  applyVisibility() {this.content.traverse(o=>{if(o.userData.part==='roof')o.visible=this.roofs&&this.mode!=='top';if(o.userData.part==='wall')o.visible=this.walls;});this.labels.visible=this.showLabels&&this.mode!=='walk';}
  /**
   * Names stay a constant size on screen, and only appear once you are close enough to see
   * what they belong to. Otherwise a site of 97 tents reads as a wall of black plates.
   */
  updateLabels() {
    if(!this.labels.visible)return;
    const height=this.container.clientHeight||600,camera=this.camera,entries=[];
    for(const label of this.labels.children){
      const distance=camera.position.distanceTo(label.position);
      const worldPerPixel=camera.isOrthographicCamera?(camera.top-camera.bottom)/(height*camera.zoom):2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
      const textHeight=Math.min(3.2,26*worldPerPixel),aspect=label.userData.aspect||5.12;
      label.scale.set(textHeight*aspect,textHeight,1);
      entries.push({label,distance,hostPixels:(label.userData.span||10)/worldPerPixel});
    }
    entries.sort((one,two)=>one.distance-two.distance);
    let shown=0;
    for(const entry of entries){
      const selected=entry.label.userData.id===this.selectedId;
      const visible=selected||(entry.hostPixels>=64&&shown<16);
      if(visible&&!selected)shown+=1;
      entry.label.visible=visible;
      entry.label.material.opacity=selected?1:clamp((entry.hostPixels-64)/70+.4,0,1);
    }
  }
  setVisibility({roofs=this.roofs,walls=this.walls,labels=this.showLabels}){this.roofs=roofs;this.walls=walls;this.showLabels=labels;this.applyVisibility();}
  /**
   * The sky you look at and the sky that lights the scene are the same object here. It is baked
   * once into a small cube for the background and once through PMREM for the lighting, both from a
   * scene that has GROUND under the sky: without it the lower hemisphere is as bright as the sky,
   * which is why every material had to dial envMapIntensity down to almost nothing to avoid
   * washing out. With a ground in the bake the image-based light can carry the fill properly.
   */
  buildSkyEnvironment(evening) {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    Object.assign(sky.material.uniforms.turbidity, { value: evening ? 6.5 : 4.2 });
    Object.assign(sky.material.uniforms.rayleigh, { value: evening ? 2.4 : 1.35 });
    Object.assign(sky.material.uniforms.mieCoefficient, { value: .006 });
    Object.assign(sky.material.uniforms.mieDirectionalG, { value: .82 });
    sky.material.uniforms.sunPosition.value.copy(this.sun.position).normalize();
    const ground = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: evening ? '#2e3029' : '#747a58', side: THREE.BackSide }),
    );
    const bakeScene = new THREE.Scene();
    bakeScene.add(sky, ground);

    const previousEnvironment = this.environmentTarget;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(bakeScene, .02, .1, 6000);
    this.world.environment = this.environmentTarget.texture;
    pmrem.dispose();
    previousEnvironment?.dispose();

    // The sky is used for LIGHTING only. Drawing it as a visible dome as well needs a tone-mapping
    // exposure near 0.5, which none of the lights in this scene are tuned for: at the exposure of
    // 1.0 used here the sky shader's output clips to white and washes the whole image out. The
    // background stays a flat colour until that retune is done as a piece of work in its own right.
    sky.geometry.dispose(); sky.material.dispose();
    ground.geometry.dispose(); ground.material.dispose();
  }
  /** Point the sun from a direction, standing it far enough out to light the whole site. */
  setSunDirection(x, y, z) {
    const direction = new THREE.Vector3(x, y, z).normalize();
    this.sun.position.copy(direction).multiplyScalar(this.sunDistance);
    this.sun.shadow.camera.updateProjectionMatrix();
    return direction;
  }
  /**
   * A graded sky behind everything: deep blue overhead, pale at the horizon, and a warm haze below it
   * where the desert meets the sky. It is seen only; the lighting comes from buildSkyEnvironment.
   */
  makeSkyDome() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { zenith: { value: new THREE.Color('#5a8fc8') }, horizon: { value: new THREE.Color('#d6e4ec') }, haze: { value: new THREE.Color('#dcd9cc') } },
      vertexShader: 'varying vec3 vDirection; void main(){ vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze; varying vec3 vDirection; void main(){ float h = normalize(vDirection).y; vec3 sky = mix(horizon, zenith, smoothstep(-.02, .5, h)); sky = mix(sky, haze, smoothstep(.06, -.04, h)); gl_FragColor = vec4(sky, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), material);
    dome.renderOrder = -10; dome.frustumCulled = false; dome.userData.part = 'sky';
    dome.onBeforeRender = (renderer, scene, camera) => { if (dome.position.distanceToSquared(camera.position) > 1) { dome.position.copy(camera.position); dome.updateMatrixWorld(); } };
    return dome;
  }
  setLighting(evening) {
    this.shadowDirty=true;
    const sky=this.skyDome.material.uniforms;
    sky.zenith.value.set(evening?'#2a4a70':'#5a8fc8');sky.horizon.value.set(evening?'#efb37f':'#d6e4ec');sky.haze.value.set(evening?'#c99f80':'#dcd9cc');
    this.world.fog.color.copy(sky.haze.value);this.evening=evening;
    // At dusk the marquees are lit inside and the booth fascias glow from their LED strips.
    if(this.canvasLight){this.canvasLight.daylight.value=evening?.08:.2;this.canvasLight.lamps.value.set('#ffc98c').multiplyScalar(evening?.55:0);}
    for(const material of this.boothMaterials)material.emissiveIntensity=evening?.9:0;
    // Dusk: the sun about 12 degrees up in the west-south-west, where it sets in the cooler months,
    // under a dimmer, bluer sky, so the lit marquees stand out from the turf. By day it is early afternoon.
    this.ambient.color.set(evening?'#a9b8d6':'#e4eefb');this.ambient.groundColor.set(evening?'#3b3b31':'#737a5e');this.ambient.intensity=evening?.62:1.02;
    this.sun.intensity=evening?1.9:3.15;this.sun.color.set(evening?'#ffad6a':'#fff4de');
    if(evening)this.setSunDirection(-42,21,-91);else this.setSunDirection(-90,150,-65);
    this.renderer.toneMappingExposure=evening?1.15:1;
    this.buildSkyEnvironment(evening); // the sky you see and the sky that lights the scene stay the same one
  }
  select(id) {
    this.selectedId=id;const data=this.data?.objects.find(o=>o.id===id);this.transform.detach();
    if(!data){this.box.visible=false;return;}
    const root=this.roots.get(id);if(this.editing&&!this.measuring&&this.mode!=='walk'&&!data.locked&&root&& !['ground','water','path'].includes(data.kind))this.transform.attach(root);
    this.updateSelectionBox();this.updateFloorGrid();
  }
  /** The ruler on or off. While it is on a click places a point rather than selecting, and dragging still turns the view. */
  setMeasuring(on){
    this.measuring=Boolean(on);this.measure.group.visible=this.measuring;this.renderer.domElement.style.cursor=this.measuring?'crosshair':'';
    this.measureHover=null;this.measureHoverKey=null;
    if(this.measuring)this.transform.detach();else{this.clearMeasure();this.select(this.selectedId);}
  }
  /**
   * Where a point lands for a cursor position, or for the middle of the view when the mouse is
   * captured: on one of the run's own points or a tent, stage or building corner within 12 pixels,
   * unless Alt is held; otherwise on the surface under the cursor; failing that, at site level.
   */
  measureTarget(input){
    const rect=this.renderer.domElement.getBoundingClientRect();
    const sx=input.centre?rect.left+rect.width/2:input.x,sy=input.centre?rect.top+rect.height/2:input.y;
    if(!input.free){
      let best=null,reach=12;
      const consider=(point,snapped,index)=>{
        const v=new THREE.Vector3(...point).project(this.camera);if(Math.abs(v.z)>1)return;
        const distance=Math.hypot(rect.left+(v.x+1)/2*rect.width-sx,rect.top+(1-v.y)/2*rect.height-sy);
        if(distance<reach){reach=distance;best={point:[...point],snapped,index};}
      };
      const points=this.measurePoints;points.forEach((p,i)=>consider(p,i===0?'first':i===points.length-1?'last':'point',i));
      if(!best){this.snapCache=this.snapCache||snapCorners(this.data);for(const corner of this.snapCache)consider(corner.point,'corner');}
      if(best)return best;
    }
    this.pointer.set((sx-rect.left)/rect.width*2-1,-((sy-rect.top)/rect.height)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects([this.content,this.surroundings],true).find(candidate=>isVisible(candidate.object));
    if(hit)return {point:hit.point.toArray(),snapped:null};
    const level=new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(UP,-(this.data?.site.groundY||0)),level)?{point:level.toArray(),snapped:null}:null;
  }
  measureClick(e){
    // The second click of a double-click finishes the run; it must not start a new one.
    const now=performance.now(),last=this.lastMeasureClick,repeat=last&&now-last.time<450&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<6;
    this.lastMeasureClick={time:now,x:e.clientX,y:e.clientY};
    if(repeat){this.finishMeasure();return;}
    if(this.measureFinished){this.measurePoints=[];this.measureClosed=false;this.measureFinished=false;}
    const locked=document.pointerLockElement===this.renderer.domElement;
    const target=this.measureTarget(this.mode==='walk'&&locked?{centre:true}:{x:e.clientX,y:e.clientY,free:e.altKey});if(!target)return;
    const points=this.measurePoints;
    // Clicking the last point again finishes the run; clicking the first closes it into a shape.
    if(target.snapped==='last'){if(points.length>1)this.finishMeasure();return;}
    if(target.snapped==='first'&&points.length>2){this.measureClosed=true;this.finishMeasure();return;}
    points.push(target.point);this.measureChanged();
  }
  /** The leg to the cursor, redrawn only when the mouse, the view or the run has changed. */
  updateMeasureHover(){
    const locked=document.pointerLockElement===this.renderer.domElement;
    const input=this.measureFinished?null:this.mode==='walk'?(locked?{centre:true}:null):this.measureHover;
    const key=input?`${input.centre?'centre':`${input.x},${input.y},${input.free}`}|${this.camera.matrixWorld.elements.join()}|${this.measurePoints.length}`:'none';
    if(key===this.measureHoverKey)return;this.measureHoverKey=key;
    const target=input&&this.measureTarget(input);
    if(!target){this.measure.setLive(null,null);return;}
    const points=this.measurePoints,last=points[points.length-1];let text='';
    if(last){
      const leg=Math.hypot(target.point[0]-last[0],target.point[2]-last[2]);
      text=target.snapped==='first'&&points.length>2?`Close the shape · ${formatLength(leg)}`:points.length>1?`${formatLength(leg)} · total ${formatLength(measureSummary(points).total+leg)}`:formatLength(leg);
    }
    this.measure.setLive(last||null,target.point,text,Boolean(target.snapped));
  }
  finishMeasure(){if(this.measurePoints.length<2)return;this.measureFinished=true;this.measure.setLive(null,null);this.measureChanged();}
  undoMeasure(){if(this.measureClosed)this.measureClosed=false;else this.measurePoints.pop();this.measureFinished=false;this.measureChanged();}
  clearMeasure(){this.measurePoints=[];this.measureClosed=false;this.measureFinished=false;this.measure.setLive(null,null);this.measureChanged();}
  measureChanged(){
    const summary=measureSummary(this.measurePoints,this.measureClosed,this.data?.site.georeference?.metresOnGroundPerPlanMetre);
    this.measure.setRun(this.measurePoints,summary);this.measureHoverKey=null;
    this.callbacks.onMeasure?.({...summary,finished:this.measureFinished});
  }
  /** The tent being worked in: the selected tent, or the one holding the selected piece. */
  hostTent(){
    const selected=this.data?.objects.find(o=>o.id===this.selectedId);if(!selected)return null;
    if(selected.kind==='tent')return selected;
    return this.data.objects.find(o=>o.id===selected.metadata?.parentTentId)||null;
  }
  /** A one-metre setting-out grid on the floor of the tent being worked in. */
  updateFloorGrid(){
    const group=this.floorGrid;
    while(group.children.length){const line=group.children.pop();line.geometry?.dispose();line.material?.dispose();}
    const host=this.hostTent();group.visible=Boolean(host)&&this.mode!=='walk';
    if(!host||!group.visible)return;
    const points=tentFootprint(host),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),positions=[];
    // Where a setting-out line crosses the outline, so the grid stops at the tent walls.
    const crossings=(value,alongZ)=>{
      const hits=[];
      for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        const [a0,a1]=alongZ?[a[1],a[0]]:[a[0],a[1]],[b0,b1]=alongZ?[b[1],b[0]]:[b[0],b[1]];
        if((a0>value)===(b0>value))continue;
        hits.push(a1+(b1-a1)*(value-a0)/(b0-a0));
      }
      return hits.sort((one,two)=>one-two);
    };
    for(const alongZ of [false,true]){
      const values=alongZ?zs:xs;
      for(let line=Math.ceil(Math.min(...values));line<=Math.floor(Math.max(...values));line+=1){
        const hits=crossings(line,alongZ);
        for(let i=0;i+1<hits.length;i+=2){
          if(alongZ)positions.push(hits[i],0,line,hits[i+1],0,line);
          else positions.push(line,0,hits[i],line,0,hits[i+1]);
        }
      }
    }
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#5d6f68',transparent:true,opacity:.45,depthWrite:false}));
    lines.position.set(host.position[0],host.position[1]+standingHeight(this.data,host)+.155,host.position[2]);lines.rotation.y=host.rotation?.[1]||0;lines.renderOrder=2;
    group.add(lines);
  }
  updateSelectionBox(){const o=this.data?.objects.find(o=>o.id===this.selectedId);if(!o||this.mode==='walk'){this.box.visible=false;return;}const root=this.roots.get(o.id);const min=new THREE.Vector3(-o.dimensions[0]/2,0,-o.dimensions[2]/2),max=new THREE.Vector3(o.dimensions[0]/2,o.dimensions[1],o.dimensions[2]/2);this.box.box.set(min,max);const matrix=new THREE.Matrix4();if(root){root.updateMatrixWorld();matrix.copy(root.matrixWorld);}else matrix.compose(new THREE.Vector3(...o.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),new THREE.Vector3(1,1,1));this.box.box.applyMatrix4(matrix);this.box.visible=true;}
  setEditing(value){this.editing=value;this.select(this.selectedId);}
  setTransformMode(mode){this.transform.setMode(mode==='rotate'?'rotate':'translate');this.transform.showX=mode!=='rotate';this.transform.showY=true;this.transform.showZ=mode!=='rotate';}
  setSnap(value){this.transform.setTranslationSnap(value?.5:null);this.transform.setRotationSnap(value?Math.PI/12:null);}
  /** Step across the ground, refusing to pass through walls, water or buildings. */
  walkBy(dx,dz){
    const p=this.camera.position,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
    for(let step=0;step<steps;step++){
      if(this.canWalk(p.x+dx/steps,p.z))p.x+=dx/steps;
      if(this.canWalk(p.x,p.z+dz/steps))p.z+=dz/steps;
    }
    p.y=(this.data?.site.groundY||0)+groundHeight(this.data,p.x,p.z)+1.65;
  }
  /** Where on the site a screen point lands, for walking to a spot you can see. */
  groundPointAt(e){
    const rect=this.renderer.domElement.getBoundingClientRect();
    // With the mouse captured for looking there is no cursor, so aim from the middle of the view.
    const locked=document.pointerLockElement===this.renderer.domElement;
    const x=locked?rect.left+rect.width/2:e.clientX, y=locked?rect.top+rect.height/2:e.clientY;
    this.pointer.set((x-rect.left)/rect.width*2-1,-((y-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects(this.content.children,true).find(candidate=>isVisible(candidate.object));
    return hit?hit.point:null;
  }
  pick(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects(this.content.children,true);for(const hit of hits){let o=hit.object;if(!isVisible(o))continue;if(o.userData.instanceIds){this.callbacks.onSelect?.(o.userData.instanceIds[hit.instanceId]);return;}while(o&&!o.userData.objectId)o=o.parent;if(o?.userData.objectId){const data=this.data.objects.find(x=>x.id===o.userData.objectId);if(data&&!['ground','path','water'].includes(data.kind)){this.callbacks.onSelect?.(data.id);return;}}}}
  focus(id,inside=false){const o=this.data?.objects.find(o=>o.id===id)||this.data?.zones.find(z=>z.id===id);if(!o)return;const target=new THREE.Vector3(...o.position);const dim=o.dimensions||[12,5,12];if(inside){this.setMode('walk');const entry=o.kind==='tent'?tentWallSegments(o).entrance.center:[0,dim[2]/2];const offset=new THREE.Vector3(entry[0],0,entry[1]);offset.multiplyScalar(Math.max(0,(offset.length()-1)/Math.max(.01,offset.length())));offset.y=1.65+standingHeight(this.data,o);offset.applyAxisAngle(UP,o.rotation?.[1]||0);this.camera.position.copy(target).add(offset);this.yaw=(o.rotation?.[1]||0)+Math.atan2(entry[0],entry[1]);this.pitch=0;}else{target.y+=Math.min(2,dim[1]/2);const distance=Math.max(12,...dim)*1.9;this.goTo({position:[target.x+distance*.65,target.y+distance*.65,target.z+distance],target:target.toArray()});}}
  /** The plan frames the tent being worked in, or the whole site when nothing is selected. */
  topBounds(){
    const host=this.hostTent();if(!host)return this.data?.site.bounds||{minX:-250,maxX:250,minZ:-130,maxZ:130};
    const [width,,depth]=host.dimensions,reach=Math.max(width,depth)*.62;
    return {minX:host.position[0]-reach,maxX:host.position[0]+reach,minZ:host.position[2]-reach,maxZ:host.position[2]+reach};
  }
  /** Open the selected tent as a measured plan: top-down, roof off, one-metre grid. */
  planTent(id){
    // The panel owns the selection, so tell it rather than moving the gizmo out from under it.
    if(id&&id!==this.selectedId){this.select(id);this.callbacks.onSelect?.(id);}
    if(this.mode==='top'){const b=this.topBounds();this.topSpan=Math.max(b.maxX-b.minX,(b.maxZ-b.minZ)*this.container.clientWidth/this.container.clientHeight)*.58;this.camera.position.set((b.minX+b.maxX)/2,600,(b.minZ+b.maxZ)/2+.01);this.controls.target.set((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2);this.resize();this.controls.update();}
    else this.setMode('top');
  }
  home(){const b=this.data?.site.bounds;if(!b)return;const center=[(b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2];const width=b.maxX-b.minX;this.goTo({position:[center[0]+width*.32,width*.62,center[2]+width*.55],target:center});}
  setMode(mode){if(mode===this.mode)return;const previous=this.camera;this.transition=null;this.mode=mode;this.stopTour();this.camera=mode==='top'?this.orthographic:this.perspective;this.controls.object=this.camera;this.transform.camera=this.camera;
    if(mode!=='walk'&&document.pointerLockElement===this.renderer.domElement)document.exitPointerLock?.();
    if(mode==='walk'){this.editing=false;this.transform.detach();this.keys.clear();this.joystick=[0,0];}
    this.walkTarget=null;
    if(mode!=='walk'&&document.pointerLockElement===this.renderer.domElement)document.exitPointerLock?.();
    if(mode==='top'){const b=this.topBounds();this.topSpan=Math.max(b.maxX-b.minX,(b.maxZ-b.minZ)*this.container.clientWidth/this.container.clientHeight)*.58;this.camera.position.set((b.minX+b.maxX)/2,600,(b.minZ+b.maxZ)/2+.01);this.camera.up.set(0,0,-1);this.controls.target.set((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2);this.controls.enableRotate=false;this.resize();}
    else{this.controls.enableRotate=true;this.camera.up.copy(UP);if(mode==='walk'){const e=new THREE.Euler().setFromQuaternion(previous.quaternion,'YXZ');this.yaw=e.y;this.pitch=0;const target=this.controls.target;this.camera.position.set(target.x,groundHeight(this.data,target.x,target.z+8)+1.65,target.z+8);}else if(previous===this.orthographic)this.home();}
    this.controls.enabled=mode!=='walk';this.camera.updateProjectionMatrix();this.controls.update();this.applyVisibility();this.select(this.selectedId);this.callbacks.onMode?.(mode);
  }
  goTo(view,smooth=true){if(this.mode!=='orbit')this.setMode('orbit');this.stopTour();this.transition=null;if(smooth){this.transition={start:performance.now(),duration:950,from:this.camera.position.clone(),to:new THREE.Vector3(...view.position),targetFrom:this.controls.target.clone(),targetTo:new THREE.Vector3(...view.target)};}else{this.camera.position.fromArray(view.position);this.controls.target.fromArray(view.target);this.controls.update();}}
  getView(name='Saved view'){return {id:crypto.randomUUID(),name,position:this.camera.position.toArray(),target:this.mode==='walk'?this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10)).toArray():this.controls.target.toArray()};}
  playTour(){const frames=this.data?.tour?.length?this.data.tour:this.data?.views;if(!frames?.length)return;this.setMode('orbit');this.transition=null;this.tour={frames,index:0,start:performance.now()};this.camera.position.fromArray(frames[0].position);this.controls.target.fromArray(frames[0].target);this.callbacks.onTour?.(true);}
  stopTour(){if(this.tour){this.tour=null;this.callbacks.onTour?.(false);}}
  canWalk(x,z){const b=this.data?.site.bounds;if(!b)return true;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return false;for(const o of this.data.objects){if(o.visible===false||!['water','building','tent'].includes(o.kind))continue;const [lx,lz]=localGroundPoint(o,x,z);if(o.kind==='water'&&o.points?.length&&pointInside(lx,lz,this.footprints?.get(o.id)||scaledFootprint(o)))return false;if(o.kind==='building'){const points=this.footprints?.get(o.id)||scaledFootprint(o);if(pointInside(lx,lz,points)||points.some((a,i)=>distanceToSegment(lx,lz,a,points[(i+1)%points.length])<.25))return false;}if(o.kind==='tent'&&this.walls){const {segments}=this.walkBoundaries?.get(o.id)||tentWallSegments(o);if(segments.some(([a,b])=>distanceToSegment(lx,lz,a,b)<.25))return false;}}
    return true;
  }
  resize(){if(this.disposed)return;const w=this.container.clientWidth||800,h=this.container.clientHeight||600;this.renderer.setSize(w,h);this.perspective.aspect=w/h;this.perspective.updateProjectionMatrix();const span=this.topSpan||300;Object.assign(this.orthographic,{left:-span,right:span,top:span*h/w,bottom:-span*h/w});this.orthographic.updateProjectionMatrix();}
  /**
   * A still for sharing: ambient occlusion where tents meet the turf, under cars and furniture and in
   * corners, rendered at up to twice the screen resolution. The live view stays as it is; if anything
   * here fails, the plain frame is saved instead.
   */
  screenshot({quality='high'}={}){
    if(quality==='high'){try{return this.highQualityStill();}catch(error){console.warn('High-quality still unavailable, saving the plain frame:',error.message);}}
    this.renderer.render(this.world,this.camera);return this.renderer.domElement.toDataURL('image/png');
  }
  highQualityStill(){
    const renderer=this.renderer,ratio=renderer.getPixelRatio(),size=renderer.getSize(new THREE.Vector2());
    const scale=Math.max(1,Math.min(2,3840/Math.max(1,size.x*ratio)));
    renderer.setPixelRatio(ratio*scale);
    try{
      const width=Math.round(size.x*ratio*scale),height=Math.round(size.y*ratio*scale),camera=this.camera;
      if(!this.stillAo){
        const ao=new GTAOPass(this.world,camera,width,height);
        ao.updateGtaoMaterial({radius:.75,distanceExponent:1.6,thickness:1.2,scale:1.1,samples:16,distanceFallOff:1});
        ao.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:6,rings:2,samples:16});
        // The sky and the floating labels take no part in the occlusion; they are still in the picture.
        const hide=ao.overrideVisibility.bind(ao);ao.overrideVisibility=()=>{hide();this.skyDome.visible=false;this.labels.visible=false;this.measure.group.visible=false;};
        this.stillAo=ao;
      }
      const ao=this.stillAo;ao.camera=camera;ao.setSize(width,height);
      // The picture itself is drawn exactly as the live view draws it, shadows and all; only the
      // occlusion is computed separately and multiplied over it.
      renderer.setRenderTarget(null);renderer.render(this.world,camera);
      ao.overrideVisibility();ao.renderOverride(renderer,ao.normalMaterial,ao.normalRenderTarget,0x7777ff,1);ao.restoreVisibility();
      const uniforms=ao.gtaoMaterial.uniforms;
      uniforms.cameraNear.value=camera.near;uniforms.cameraFar.value=camera.far;
      uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);uniforms.cameraWorldMatrix.value.copy(camera.matrixWorld);
      ao.renderPass(renderer,ao.gtaoMaterial,ao.gtaoRenderTarget,0xffffff,1);
      ao.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      ao.renderPass(renderer,ao.pdMaterial,ao.pdRenderTarget,0xffffff,1);
      ao.blendMaterial.uniforms.intensity.value=.85;ao.blendMaterial.uniforms.tDiffuse.value=ao.pdRenderTarget.texture;
      ao.renderPass(renderer,ao.blendMaterial,null);
      return renderer.domElement.toDataURL('image/png');
    }finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.setRenderTarget(null);renderer.render(this.world,this.camera);}
  }
  animate(now){if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);const dt=Math.min(.05,this.clock.getDelta());
    if(this.shadowDirty&&this.pending===0&&(!this.dragging||now-(this.lastShadowUpdate||0)>150)){this.renderer.shadowMap.needsUpdate=true;this.shadowDirty=false;this.lastShadowUpdate=now;}
    if(this.mode==='walk'){const held=code=>this.keys.has(code)?1:0;const speed=(held('ShiftLeft')||held('ShiftRight')?12:3.2)*dt;
      const forward=held('KeyW')+held('ArrowUp')-held('KeyS')-held('ArrowDown')-this.joystick[1];
      // A and D turn you, the way a person walking turns, rather than sliding you sideways.
      // Sidestepping is still there on Q and E for anyone who wants it.
      const turn=held('KeyD')+held('ArrowRight')-held('KeyA')-held('ArrowLeft')+this.joystick[0];
      if(turn)this.yaw-=turn*1.5*dt;
      const side=held('KeyE')-held('KeyQ');const norm=Math.max(1,Math.hypot(forward,side));
      if(forward||side||turn)this.walkTarget=null; // taking the controls cancels a walk-to
      if(forward||side)this.walkBy((-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*speed/norm,(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*speed/norm);
      if(this.walkTarget){
        const p=this.camera.position,toX=this.walkTarget.x-p.x,toZ=this.walkTarget.z-p.z,away=Math.hypot(toX,toZ);
        if(away<.7)this.walkTarget=null;
        else{
          const step=Math.min(away,9*dt),fromX=p.x,fromZ=p.z;
          this.walkBy(toX/away*step,toZ/away*step);
          if(Math.hypot(p.x-fromX,p.z-fromZ)<step*.25)this.walkTarget=null; // something is in the way
        }
      }
      const p=this.camera.position;p.y=(this.data?.site.groundY||0)+groundHeight(this.data,p.x,p.z)+1.65;
      this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');}
    else if(this.transition){const t=clamp((now-this.transition.start)/this.transition.duration,0,1),ease=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,ease);this.controls.target.lerpVectors(this.transition.targetFrom,this.transition.targetTo,ease);if(t===1)this.transition=null;}
    else if(this.tour){const a=this.tour.frames[this.tour.index],b=this.tour.frames[(this.tour.index+1)%this.tour.frames.length],t=clamp((now-this.tour.start)/(Math.max(2,a.duration||8)*1000),0,1);const ease=t*t*(3-2*t);this.camera.position.lerpVectors(new THREE.Vector3(...a.position),new THREE.Vector3(...b.position),ease);this.controls.target.lerpVectors(new THREE.Vector3(...a.target),new THREE.Vector3(...b.target),ease);if(t===1){this.tour.index++;this.tour.start=now;if(this.tour.index>=this.tour.frames.length-1)this.stopTour();}}
    if(this.mode!=='walk')this.controls.update();
    this.updateLabels();
    if(this.measuring)this.updateMeasureHover();
    if(this.measure.group.visible)this.measure.update(this.camera,this.container.clientWidth||800,this.container.clientHeight||600);
    this.renderer.render(this.world,this.camera);
    this.frames=(this.frames||0)+1;if(!this.lastStat)this.lastStat=now;
    if(now-this.lastStat>1200){const fps=Math.round(this.frames*1000/(now-this.lastStat));this.callbacks.onStats?.({fps,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,camera:this.camera.position.toArray(),modelsLoading:this.pending,modelsFailed:this.failures.size});if(fps<25&&this.renderer.getPixelRatio()>1)this.renderer.setPixelRatio(1);this.frames=0;this.lastStat=now;}
  }
  dispose(){this.disposed=true;this.stillAo?.dispose();this.measure.dispose();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.cleanup.forEach(fn=>fn());for(const line of this.floorGrid.children){line.geometry?.dispose();line.material?.dispose();}this.floorGrid.clear();this.contactShadowGeometry?.dispose();this.contactShadowMaterial?.map?.dispose();this.sky?.material.dispose();this.transform.dispose();this.controls.dispose();this.disposeContent();for(const template of this.modelTemplates.values())disposeModel(template);this.modelTemplates.clear();this.modelCache.clear();for(const m of this.materials.values())m.dispose();for(const m of this.backwallMaterials.values()){m.map?.dispose();m.dispose();}this.backwallMaterials.clear();this.environmentTarget?.dispose();this.box.geometry.dispose();this.box.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}

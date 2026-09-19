import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scaledFootprint, localGroundPoint, tentFootprint, terrainHeight, standingHeight } from './eventStudioLayout.js';
export { localGroundPoint, tentFootprint };
import { perimeterExtrusion, carParts, pagodaGeometry, gableGeometry, clubhouseRoofGeometry, palmParts, lakeEdgeGeometry, detailSurface } from './eventStudioGeometry.js';

const UP = new THREE.Vector3(0, 1, 0);
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
  const points = tentFootprint(object);
  const edges = points.map((a, i) => { const b = points[(i+1)%points.length]; return { a, b, x: (a[0]+b[0])/2, z: (a[1]+b[1])/2, length: Math.hypot(b[0]-a[0], b[1]-a[1]) }; });
  const entrance = [...edges].sort((a,b) => Math.abs(b.z-a.z) < .01 ? b.x-a.x : b.z-a.z)[0];
  const opening = Math.min(3, entrance.length * .6);
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
    this.world.fog = new THREE.Fog('#bdd7e8', 650, 1300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false; this.shadowDirty = true;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D event layout. Select a tent or use the navigation controls.');
    container.appendChild(this.renderer.domElement);
    this.perspective = new THREE.PerspectiveCamera(46, 1, .1, 2500);
    this.perspective.position.set(230, 230, 290);
    this.orthographic = new THREE.OrthographicCamera(-300, 300, 200, -200, .1, 2500);
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
        if (original && !original.locked && this.mode !== 'walk') this.callbacks.onTransform?.(original.id, {
          position: o.position.toArray().map(v => +v.toFixed(3)),
          rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map(v => +v.toFixed(5)),
        });
      }
    });
    this.transform.addEventListener('objectChange', () => { this.updateSelectionBox(); this.updateFurnitureInstances(this.selectedId); this.shadowDirty = true; });
    this.ambient = new THREE.HemisphereLight('#e4eefb', '#6d7d55', 1.02); this.world.add(this.ambient);
    this.sun = new THREE.DirectionalLight('#fff4de', 3.15);
    this.sun.position.set(-90, 150, -65); this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 1, far: 600 });
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -.0003; this.sun.shadow.normalBias = .1;
    this.world.add(this.sun, this.sun.target);
    const sky=new Sky();sky.scale.setScalar(1000);sky.material.uniforms.turbidity.value=4;sky.material.uniforms.rayleigh.value=1.5;sky.material.uniforms.sunPosition.value.copy(this.sun.position).normalize();
    const environmentScene=new THREE.Scene();environmentScene.add(sky);const pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget=pmrem.fromScene(environmentScene,.025,.1,2000);this.world.environment=this.environmentTarget.texture;pmrem.dispose();sky.geometry.dispose();sky.material.dispose();
    this.content = new THREE.Group(); this.world.add(this.content);
    this.labels = new THREE.Group(); this.world.add(this.labels);
    this.floorGrid = new THREE.Group(); this.world.add(this.floorGrid);
    this.box = new THREE.Box3Helper(new THREE.Box3(), '#d6a95b'); this.box.visible = false; this.world.add(this.box);
    this.modelCache = new Map(); this.modelTemplates = new Map(); this.materials = new Map(); this.instanceMaterials = new Set(); this.roots = new Map(); this.loader = new GLTFLoader();
    this.keys = new Set(); this.joystick = [0, 0]; this.mode = 'orbit'; this.roofs = true; this.walls = true;
    this.showLabels = true; this.editing = false; this.generation = 0; this.pending = 0; this.failures = new Set();
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.clock = new THREE.Clock();
    this.cleanup = [];
    const listen = (target, name, fn, options) => { target.addEventListener(name, fn, options); this.cleanup.push(() => target.removeEventListener(name, fn, options)); };
    const canvas = this.renderer.domElement;
    listen(canvas, 'pointerdown', e => { this.down = { x: e.clientX, y: e.clientY }; canvas.focus(); if (this.mode === 'walk') this.lookPointer = e.pointerId; });
    listen(window, 'pointerup', e => {
      if (this.lookPointer === e.pointerId) this.lookPointer = null;
      if (e.target === canvas && this.down && !this.dragging && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5 && this.mode !== 'walk') this.pick(e);
      this.down = null;
    });
    listen(canvas, 'pointermove', e => {
      if (this.mode !== 'walk' || (document.pointerLockElement !== canvas && this.lookPointer !== e.pointerId)) return;
      this.yaw -= (e.movementX || 0) * .003; this.pitch = clamp(this.pitch - (e.movementY || 0) * .003, -1.4, 1.4);
    });
    listen(canvas, 'dblclick', () => { if (this.mode === 'walk') canvas.requestPointerLock?.(); });
    listen(canvas, 'keydown', e => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) { this.keys.add(e.code); if (this.mode === 'walk') e.preventDefault(); } });
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
      const key=`${mesh.material.uuid}|${mesh.userData.part||'structure'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
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
  tent(o, root) {
    const h = o.dimensions[1], eave = Math.min(h-.2, Number(o.metadata?.eaveHeight) || Math.min(3.2,h*.62));
    const ivory = this.mat(o.color || '#f3eee4', { side: THREE.DoubleSide, roughness: .88 });
    const frame = this.mat('#cdc9bd', { metalness: .65, roughness: .28 });
    const {points,segments}=tentWallSegments(o);
    const floor=this.shape(points,this.mat('#b6a78d'),root,.12);floor.userData.part='floor';
    let roof;
    if(o.roofType==='flat')roof=this.shape(points,ivory,root,h);
    else if(o.roofType==='gable')roof=this.mesh(gableGeometry(points,eave,h),ivory,root);
    else if(o.roofType==='hexagon'){
      const vertices=points.flatMap(([x,z])=>[x,eave,z]),indices=[];vertices.push(0,h,0);
      for(let i=0;i<points.length;i++)indices.push(i,points.length,(i+1)%points.length);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();roof=this.mesh(geometry,ivory,root);
    }else roof=this.mesh(pagodaGeometry(points,eave,h),ivory,root);
    roof.userData.part='roof';
    // Marquee glazing is layered several panes deep from inside, so each pane stays faint.
    const clear = this.mat('#93aaa9',{transparent:true,opacity:.15,metalness:.1,roughness:.18,depthWrite:false,side:THREE.DoubleSide});
    const sideMat=o.metadata?.wallStyle==='solid'?ivory:clear;
    for(const [a,b] of segments){const dx=b[0]-a[0],dz=b[1]-a[1],wall=this.boxMesh(Math.hypot(dx,dz),eave-.2,.055,sideMat,root,[(a[0]+b[0])/2,eave/2,(a[1]+b[1])/2]);wall.rotation.y=-Math.atan2(dz,dx);wall.userData.part='wall';}
    points.forEach(([x,z],i)=>{
      const [nx,nz]=points[(i+1)%points.length],length=Math.hypot(nx-x,nz-z),angle=-Math.atan2(nz-z,nx-x);
      const bays=o.roofType==='hexagon'?1:Math.max(1,Math.round(length/5));
      for(let k=0;k<bays;k++){const post=this.boxMesh(.11,eave,.11,frame,root,[x+(nx-x)*k/bays,eave/2,z+(nz-z)*k/bays]);post.userData.part='frame';}
      const beam=this.boxMesh(length,.075,.075,frame,root,[(x+nx)/2,eave,(z+nz)/2]);beam.rotation.y=angle;beam.userData.part='beam';
      if(o.roofType==='pagoda'){const valance=this.boxMesh(length,.18,.025,ivory,root,[(x+nx)/2,eave-.06,(z+nz)/2]);valance.rotation.y=angle;valance.userData.part='roof';}
    });
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
      const material=o.kind==='path'?this.mat(o.color||'#b9b4a6',{roughness:.92}):this.surfaceMat(o.color||(o.kind==='water'?'#466d70':'#5f853c'),style,{...(o.kind==='water'?{roughness:.2,metalness:.28}:{}),polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1-layer});
      const points=scaledFootprint(o),drape=this.groundDrape(o);
      if(o.points?.length>2)this.shape(points,material,root,offset,drape);else this.boxMesh(w,Math.max(.02,h),d,material,root,[0,h/2+offset,0]);
      if(o.kind==='water'&&o.metadata?.stoneEdge){const edge=this.mesh(lakeEdgeGeometry(points),this.surfaceMat('#948975','stone'),root);edge.castShadow=false;}
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
    const parts=kind==='car'?carParts():palmParts();
    const dummy=new THREE.Object3D(),paint=new THREE.Color();
    for(const part of parts) {const inst=new THREE.InstancedMesh(part.geo,this.mat(part.color,{side:part.doubleSide?THREE.DoubleSide:THREE.FrontSide,...(part.tint?{metalness:.3,roughness:.38,envMapIntensity:.45}:{})}),objects.length);inst.userData.instanceIds=objects.map(o=>o.id);inst.castShadow=true;inst.receiveShadow=true;
      objects.forEach((o,i)=>{const r=new THREE.Matrix4().makeRotationY(o.rotation[1]);const p=new THREE.Vector3(part.p[0]*o.dimensions[0],part.p[1]*o.dimensions[1],part.p[2]*o.dimensions[2]).applyMatrix4(r);dummy.position.fromArray(o.position).add(p);dummy.position.y+=terrainHeight(this.data?.site,o.position[0],o.position[2]);dummy.rotation.set(...o.rotation);dummy.scale.fromArray(o.dimensions);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);
        // Painted panels carry each entry's own colour; glass, tyres and brightwork do not.
        if(part.tint)inst.setColorAt(i,paint.set(o.color||'#d8d2c4'));});
      inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor)inst.instanceColor.needsUpdate=true;inst.computeBoundingSphere();this.content.add(inst);}
  }
  disposeContent() {
    this.transform.detach(); this.roots.clear();
    this.content.traverse(o=>{if(o.geometry&&!o.userData.cachedModel)o.geometry.dispose();if(o.isInstancedMesh)o.dispose();});this.furnitureInstances?.clear();
    for(const material of this.instanceMaterials||[])material.dispose();this.instanceMaterials?.clear();
    this.content.clear();this.labels.traverse(o=>{o.material?.map?.dispose();o.material?.dispose();});this.labels.clear();
  }
  setScene(data,assets=[]) {
    const generation=++this.generation;this.data=data;this.assets=new Map(assets.map(a=>[a.id,a]));this.disposeContent();this.pending=0;this.failures.clear();this.walkBoundaries=new Map(data.objects.filter(o=>o.kind==='tent').map(o=>[o.id,tentWallSegments(o)]));this.surfaceLayers=new Map(data.objects.filter(o=>['ground','water','path'].includes(o.kind)).sort((a,b)=>a.id.localeCompare(b.id)).map((o,index)=>[o.id,index]));this.footprints=new Map(data.objects.filter(o=>['building','water'].includes(o.kind)).map(o=>[o.id,scaledFootprint(o)]));this.shadowDirty=true;this.callbacks.onAssets?.({loading:0,failed:0});
    const b=data.site.bounds;const width=b.maxX-b.minX,depth=b.maxZ-b.minZ;
    const base=this.boxMesh(width+60,.3,depth+60,this.surfaceMat(data.site.appearance?.turfColor||'#71924c','grass'),this.content,[(b.minX+b.maxX)/2,-.2,(b.minZ+b.maxZ)/2]);base.castShadow=false;
    base.rotation.z=Math.atan(data.site.terrain?.northFallPerMetre||0);base.rotation.x=-Math.atan(data.site.terrain?.crossFallPerMetre||0);
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
  setLighting(evening) {
    this.shadowDirty=true;
    this.world.background.set(evening?'#293947':'#bdd7e8');this.world.fog.color.copy(this.world.background);
    this.ambient.intensity=evening?.82:1.02;this.sun.intensity=evening?1.7:3.15;this.sun.color.set(evening?'#ffc27e':'#fff4de');this.sun.position.set(-90,evening?38:150,-65);this.renderer.toneMappingExposure=evening?1.1:1;
  }
  select(id) {
    this.selectedId=id;const data=this.data?.objects.find(o=>o.id===id);this.transform.detach();
    if(!data){this.box.visible=false;return;}
    const root=this.roots.get(id);if(this.editing&&this.mode!=='walk'&&!data.locked&&root&& !['ground','water','path'].includes(data.kind))this.transform.attach(root);
    this.updateSelectionBox();this.updateFloorGrid();
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
    if(id&&id!==this.selectedId)this.select(id);
    if(this.mode==='top'){const b=this.topBounds();this.topSpan=Math.max(b.maxX-b.minX,(b.maxZ-b.minZ)*this.container.clientWidth/this.container.clientHeight)*.58;this.camera.position.set((b.minX+b.maxX)/2,600,(b.minZ+b.maxZ)/2+.01);this.controls.target.set((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2);this.resize();this.controls.update();}
    else this.setMode('top');
  }
  home(){const b=this.data?.site.bounds;if(!b)return;const center=[(b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2];const width=b.maxX-b.minX;this.goTo({position:[center[0]+width*.32,width*.62,center[2]+width*.55],target:center});}
  setMode(mode){if(mode===this.mode)return;const previous=this.camera;this.transition=null;this.mode=mode;this.stopTour();this.camera=mode==='top'?this.orthographic:this.perspective;this.controls.object=this.camera;this.transform.camera=this.camera;
    if(mode!=='walk'&&document.pointerLockElement===this.renderer.domElement)document.exitPointerLock?.();
    if(mode==='walk'){this.editing=false;this.transform.detach();this.keys.clear();this.joystick=[0,0];}
    if(mode==='top'){const b=this.topBounds();this.topSpan=Math.max(b.maxX-b.minX,(b.maxZ-b.minZ)*this.container.clientWidth/this.container.clientHeight)*.58;this.camera.position.set((b.minX+b.maxX)/2,600,(b.minZ+b.maxZ)/2+.01);this.camera.up.set(0,0,-1);this.controls.target.set((b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2);this.controls.enableRotate=false;this.resize();}
    else{this.controls.enableRotate=true;this.camera.up.copy(UP);if(mode==='walk'){const e=new THREE.Euler().setFromQuaternion(previous.quaternion,'YXZ');this.yaw=e.y;this.pitch=0;const target=this.controls.target;this.camera.position.set(target.x,terrainHeight(this.data?.site,target.x,target.z+8)+1.65,target.z+8);}else if(previous===this.orthographic)this.home();}
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
  screenshot(){this.renderer.render(this.world,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  animate(now){if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);const dt=Math.min(.05,this.clock.getDelta());
    if(this.shadowDirty&&this.pending===0&&(!this.dragging||now-(this.lastShadowUpdate||0)>150)){this.renderer.shadowMap.needsUpdate=true;this.shadowDirty=false;this.lastShadowUpdate=now;}
    if(this.mode==='walk'){const speed=(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?12:3.2)*dt;const forward=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-this.joystick[1];const side=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.joystick[0];const norm=Math.max(1,Math.hypot(forward,side));const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*speed/norm,dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*speed/norm;const p=this.camera.position,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));for(let step=0;step<steps;step++){if(this.canWalk(p.x+dx/steps,p.z))p.x+=dx/steps;if(this.canWalk(p.x,p.z+dz/steps))p.z+=dz/steps;}p.y=(this.data?.site.groundY||0)+terrainHeight(this.data?.site,p.x,p.z)+1.65;this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');}
    else if(this.transition){const t=clamp((now-this.transition.start)/this.transition.duration,0,1),ease=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,ease);this.controls.target.lerpVectors(this.transition.targetFrom,this.transition.targetTo,ease);if(t===1)this.transition=null;}
    else if(this.tour){const a=this.tour.frames[this.tour.index],b=this.tour.frames[(this.tour.index+1)%this.tour.frames.length],t=clamp((now-this.tour.start)/(Math.max(2,a.duration||8)*1000),0,1);const ease=t*t*(3-2*t);this.camera.position.lerpVectors(new THREE.Vector3(...a.position),new THREE.Vector3(...b.position),ease);this.controls.target.lerpVectors(new THREE.Vector3(...a.target),new THREE.Vector3(...b.target),ease);if(t===1){this.tour.index++;this.tour.start=now;if(this.tour.index>=this.tour.frames.length-1)this.stopTour();}}
    if(this.mode!=='walk')this.controls.update();
    this.updateLabels();
    this.renderer.render(this.world,this.camera);
    this.frames=(this.frames||0)+1;if(!this.lastStat)this.lastStat=now;
    if(now-this.lastStat>1200){const fps=Math.round(this.frames*1000/(now-this.lastStat));this.callbacks.onStats?.({fps,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,camera:this.camera.position.toArray(),modelsLoading:this.pending,modelsFailed:this.failures.size});if(fps<25&&this.renderer.getPixelRatio()>1)this.renderer.setPixelRatio(1);this.frames=0;this.lastStat=now;}
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.cleanup.forEach(fn=>fn());for(const line of this.floorGrid.children){line.geometry?.dispose();line.material?.dispose();}this.floorGrid.clear();this.contactShadowGeometry?.dispose();this.contactShadowMaterial?.map?.dispose();this.transform.dispose();this.controls.dispose();this.disposeContent();for(const template of this.modelTemplates.values())disposeModel(template);this.modelTemplates.clear();this.modelCache.clear();for(const m of this.materials.values())m.dispose();this.environmentTarget?.dispose();this.box.geometry.dispose();this.box.material.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}

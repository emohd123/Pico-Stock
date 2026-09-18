import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EventStudioEngine, localGroundPoint, tentFootprint, tentWallSegments } from '../lib/eventStudioEngine.js';

let tests=0;
async function test(name, fn){await fn();tests++;console.log(`PASS ${name}`);}
function engine(objects=[]){const value=Object.create(EventStudioEngine.prototype);Object.assign(value,{data:{site:{bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}},objects},walls:true,materials:new Map(),modelCache:new Map(),modelTemplates:new Map(),roots:new Map(),callbacks:{},failures:new Set(),pending:0,generation:1,content:new THREE.Group(),labels:new THREE.Group(),transform:{detach(){}},mode:'orbit'});return value;}
const rectangle={id:'rect',name:'Test tent',kind:'tent',position:[12,0,8],rotation:[0,Math.PI/4,0],dimensions:[12,5,12],color:'#ffffff'};
const hexagon={...rectangle,id:'hex',roofType:'hexagon',rotation:[0,Math.PI/3,0],points:[[0,-6],[-5,-3],[-5,3],[0,6],[5,3],[5,-3]],dimensions:[10,6,12]};
function world(object,x,z){return new THREE.Vector3(x,0,z).applyAxisAngle(new THREE.Vector3(0,1,0),object.rotation[1]).add(new THREE.Vector3(...object.position));}
await test('inverse yaw agrees with Three world transforms at multiple orientations',()=>{
  for(const angle of [0,Math.PI/4,Math.PI/2,-Math.PI/3,Math.PI]){const o={...rectangle,rotation:[0,angle,0]},p=world(o,2.5,5.8),local=localGroundPoint(o,p.x,p.z);assert.ok(Math.abs(local[0]-2.5)<1e-8&&Math.abs(local[1]-5.8)<1e-8);}
});
await test('rotated rectangular door is walkable while side/rear walls and building remain blocked',()=>{
  const e=engine([rectangle]);for(const [x,z,walkable] of [[0,6,true],[0,0,true],[5.9,0,false],[0,-5.9,false],[3,5.9,false]]){const p=world(rectangle,x,z);assert.equal(e.canWalk(p.x,p.z),walkable);}
  e.walls=false;const side=world(rectangle,5.9,0);assert.equal(e.canWalk(side.x,side.z),true);
  e.data.objects=[{...rectangle,kind:'building'}];assert.equal(e.canWalk(rectangle.position[0],rectangle.position[2]),false);
});
await test('source hexagon keeps its six vertices and opens the front edge, not a rectangular wall',()=>{
  assert.deepEqual(tentFootprint(hexagon),hexagon.points);const boundary=tentWallSegments(hexagon);assert.equal(boundary.segments.length,7);assert.ok(boundary.entrance.center[1]>0);
  const e=engine([hexagon]);const door=world(hexagon,...boundary.entrance.center);assert.equal(e.canWalk(door.x,door.z),true);
  const [a,b]=boundary.segments[0],wall=world(hexagon,(a[0]+b[0])/2,(a[1]+b[1])/2);assert.equal(e.canWalk(wall.x,wall.z),false);
  const openCorner=world(hexagon,4.8,5.8);assert.equal(e.canWalk(openCorner.x,openCorner.z),true);
});
await test('near-duplicate source vertices do not create extra hexagonal posts',()=>{
  const o={...hexagon,points:[[0,-6],[-5,-3],[-5,3],[0,6],[.002,6],[5,3],[5,-3],[.002,-6]]};assert.equal(tentFootprint(o).length,6);
  const e=engine(),root=new THREE.Group();e.tent(o,root);assert.equal(root.children.filter(c=>c.userData.part==='frame').length,6);assert.equal(root.children.filter(c=>c.userData.part==='wall').length,7);
  const floor=root.children.find(c=>c.userData.part==='floor');floor.geometry.computeBoundingBox();assert.ok(Math.abs(floor.geometry.boundingBox.getSize(new THREE.Vector3()).x-10)<.01);
});
await test('hidden roofs and hidden parent groups cannot intercept furniture selection',()=>{
  const e=engine([{id:'tent',kind:'tent'},{id:'chair',kind:'furniture'}]);let selected;
  e.callbacks.onSelect=id=>selected=id;e.renderer={domElement:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}};e.pointer=new THREE.Vector2();e.raycaster=new THREE.Raycaster();e.camera=new THREE.PerspectiveCamera(45,1,.1,100);e.camera.position.set(0,12,0);e.camera.up.set(0,0,-1);e.camera.lookAt(0,0,0);e.camera.updateMatrixWorld();
  const roofRoot=new THREE.Group();roofRoot.userData.objectId='tent';const roof=new THREE.Mesh(new THREE.BoxGeometry(8,.1,8),new THREE.MeshBasicMaterial());roof.position.y=6;roofRoot.add(roof);e.content.add(roofRoot);
  const chair=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());chair.userData.objectId='chair';chair.position.y=.5;e.content.add(chair);e.content.updateMatrixWorld(true);
  e.pick({clientX:50,clientY:50});assert.equal(selected,'tent');roof.visible=false;e.pick({clientX:50,clientY:50});assert.equal(selected,'chair');roof.visible=true;roofRoot.visible=false;e.pick({clientX:50,clientY:50});assert.equal(selected,'chair');
});
await test('failed model requests can retry and cached geometry survives scene rebuilds',async()=>{
  const e=engine();let attempts=0;const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));
  e.loader={loadAsync:async()=>{attempts++;if(attempts===1)throw new Error('temporary offline');return{scene};}};const asset={id:'chair',modelUrl:'/chair.glb'};
  await assert.rejects(e.model(asset));const template=await e.model(asset);assert.equal(attempts,2);assert.equal(await e.model(asset),template);assert.equal(attempts,2);
  let disposed=0;template.children[0].geometry.addEventListener('dispose',()=>disposed++);e.content.add(template.clone(true));e.disposeContent();assert.equal(disposed,0);assert.equal(template.children[0].userData.cachedModel,true);
});
await test('stale asset failures cannot overwrite a newer scene loading state',async()=>{
  const e=engine();let reject;e.assets=new Map([['chair',{id:'chair',modelUrl:'/chair.glb'}]]);e.model=()=>new Promise((_,r)=>{reject=r;});let reports=0;e.callbacks.onAssets=()=>reports++;
  const waiting=e.attachModel({assetId:'chair'},new THREE.Group(),1);e.generation=2;e.pending=0;reject(new Error('old request'));await waiting;assert.equal(e.failures.size,0);assert.equal(e.pending,0);assert.equal(reports,1);
});
await test('furniture colour override stays per instance and preserves metal and glass',async()=>{
  const e=engine(),template=new THREE.Group(),upholstery=new THREE.MeshStandardMaterial({color:'#ccbb99'}),metal=new THREE.MeshStandardMaterial({color:'#aaaaaa',metalness:.8}),glass=new THREE.MeshStandardMaterial({color:'#aaccdd',transparent:true,opacity:.3});
  for(const material of [upholstery,metal,glass]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);mesh.userData.cachedModel=true;template.add(mesh);}
  e.assets=new Map([['chair',{id:'chair',modelUrl:'/chair.glb',color:'#ccbb99',dimensions:[1,1,1]}]]);e.model=async()=>template;
  const root=new THREE.Group();e.content.add(root);await e.attachModel({assetId:'chair',color:'#ff0000',dimensions:[1,1,1]},root,1);
  const tinted=root.children[0].children;assert.notEqual(tinted[0].material,upholstery);assert.equal(tinted[0].material.color.getHexString(),'ff0000');assert.equal(upholstery.color.getHexString(),'ccbb99');assert.equal(tinted[1].material,metal);assert.equal(tinted[2].material,glass);
  let released=0;tinted[0].material.addEventListener('dispose',()=>released++);e.disposeContent();assert.equal(released,1);assert.equal(e.instanceMaterials.size,0);
});
await test('walk selection never attaches editable transform controls',()=>{
  const e=engine([rectangle]);let attached=0;e.editing=true;e.mode='walk';e.roots.set(rectangle.id,new THREE.Group());e.transform={detach(){},attach(){attached++;}};e.box=new THREE.Box3Helper(new THREE.Box3());e.select(rectangle.id);assert.equal(attached,0);e.mode='orbit';e.select(rectangle.id);assert.equal(attached,1);
});
await test('furniture instancing preserves per-item transforms, IDs and colour groups',()=>{
  const objects=['one','two','tinted'].map((id,i)=>({id,kind:'furniture',position:[i*3,0,0]})),e=engine(objects),geometry=new THREE.BoxGeometry(1,1,1),normal=new THREE.MeshStandardMaterial({color:'#eeeeee'}),tinted=new THREE.MeshStandardMaterial({color:'#ff0000'});
  for(const object of objects){const root=new THREE.Group();root.position.fromArray(object.position);const mesh=new THREE.Mesh(geometry,object.id==='tinted'?tinted:normal);mesh.userData.cachedModel=true;mesh.position.y=.5;root.add(mesh);e.roots.set(object.id,root);e.content.add(root);}
  e.batchFurniture();const batches=e.content.children.filter(child=>child.isInstancedMesh);assert.equal(batches.length,2);assert.equal(batches.find(mesh=>mesh.material===normal).count,2);assert.deepEqual(batches.find(mesh=>mesh.material===tinted).userData.instanceIds,['tinted']);
  e.roots.get('one').position.set(9,1,2);e.updateFurnitureInstances('one');const placement=e.furnitureInstances.get('one')[0],matrix=new THREE.Matrix4();placement.mesh.getMatrixAt(placement.index,matrix);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[9,1.5,2]);
});
await test('per-object tent batching keeps independent roof and wall visibility',()=>{
  const e=engine(),root=new THREE.Group();e.tent(rectangle,root);const before=root.children.length;e.batchObject(root);assert.ok(root.children.length<before);assert.ok(root.children.some(child=>child.userData.part==='roof'));assert.equal(root.children.filter(child=>child.userData.part==='wall').length,1);
});
console.log(JSON.stringify({ok:true,tests}));

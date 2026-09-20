import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EventStudioEngine, localGroundPoint, tentFootprint, tentWallSegments } from '../lib/eventStudioEngine.js';
import { scaledFootprint, perimeterExtrusion, pagodaGeometry, gableGeometry, clubhouseRoofGeometry } from '../lib/eventStudioGeometry.js';
import { freeFloorSlot, clampIntoFootprint, rectsOverlap, rectInsideFootprint, occupantsOf, worldGroundPoint, polygonContains, terrainHeight, standingHeight, courseFeaturesUnder } from '../lib/eventStudioLayout.js';
import { readFileSync } from 'node:fs';

let tests=0;
async function test(name, fn){await fn();tests++;console.log(`PASS ${name}`);}
function engine(objects=[]){const value=Object.create(EventStudioEngine.prototype);Object.assign(value,{data:{site:{bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}},objects},walls:true,materials:new Map(),modelCache:new Map(),modelTemplates:new Map(),roots:new Map(),callbacks:{},failures:new Set(),pending:0,generation:1,content:new THREE.Group(),labels:new THREE.Group(),floorGrid:new THREE.Group(),transform:{detach(){}},mode:'orbit'});return value;}
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
await test('irregular buildings retain their traced outline and do not block empty bounding-box corners',()=>{
  const o={...rectangle,id:'irregular',kind:'building',rotation:[0,0,0],points:[[-6,-6],[6,-6],[-6,6]]};
  const e=engine([o]);assert.equal(e.canWalk(o.position[0]+5,o.position[2]+5),true);assert.equal(e.canWalk(o.position[0]-3,o.position[2]-3),false);
  const geometry=perimeterExtrusion(scaledFootprint(o),5);geometry.computeBoundingBox();assert.equal(geometry.boundingBox.max.y,5);geometry.dispose();
});
await test('resizing a traced pavilion changes render and walking perimeter without altering source points',()=>{
  const original=JSON.stringify(hexagon.points),o={...hexagon,dimensions:[20,9,6]};const points=tentFootprint(o);
  assert.equal(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),20);assert.equal(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])),6);assert.equal(JSON.stringify(hexagon.points),original);
  for(const geometry of [pagodaGeometry(points,3,9),gableGeometry(points,3,9)]){geometry.computeBoundingBox();assert.equal(geometry.boundingBox.max.y,9);assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite));geometry.dispose();}
});
await test('curved clubhouse roof follows a rotated plan perimeter and its requested height',()=>{
  const points=[[-12,-10],[14,8],[10,14],[-16,-4]],{geometry,top}=clubhouseRoofGeometry(points,12,[.82,.57]);geometry.computeBoundingBox();assert.ok(Math.abs(geometry.boundingBox.max.y-12)<.001);assert.ok(points.every(p=>top(p)>=8.63&&top(p)<=12.01));geometry.dispose();
});
await test('photo-refined architecture batches without losing visibility or finite geometry',()=>{
  const e=engine();for(const architecture of ['royal-majlis','royal-clubhouse-main','royal-clubhouse-wing']){const root=new THREE.Group();e.venueBuilding({...rectangle,metadata:{architecture,roofAxis:[1,0]}},root);e.batchObject(root);assert.ok(root.children.length<=5);assert.ok(root.children.some(m=>m.userData.part==='roof'));root.traverse(m=>{if(m.geometry)assert.ok(Array.from(m.geometry.attributes.position.array).every(Number.isFinite));});}
});
await test('the plan grid sets out one-metre lines clipped to the tent floor',()=>{
  const e=engine([rectangle]);e.selectedId=rectangle.id;e.updateFloorGrid();
  const lines=e.floorGrid.children[0];assert.ok(lines,'a grid is drawn for the selected tent');
  const position=lines.geometry.getAttribute('position');
  assert.equal(position.count,48); // 12 lines each way across a 12 m floor, two ends apiece
  for(let i=0;i<position.count;i++){assert.ok(Math.abs(position.getX(i))<=6.001);assert.ok(Math.abs(position.getZ(i))<=6.001);}
  assert.equal(lines.rotation.y,rectangle.rotation[1]);
  assert.deepEqual(lines.position.toArray(),[rectangle.position[0],rectangle.position[1]+.155,rectangle.position[2]]);
  e.selectedId=null;e.updateFloorGrid();assert.equal(e.floorGrid.visible,false);
});
await test('the grid follows a hexagonal pavilion outline rather than its bounding box',()=>{
  const e=engine([hexagon]);e.selectedId=hexagon.id;e.updateFloorGrid();
  const position=e.floorGrid.children[0].geometry.getAttribute('position'),outline=tentFootprint(hexagon);
  for(let i=0;i<position.count;i+=2){
    const mx=(position.getX(i)+position.getX(i+1))/2,mz=(position.getZ(i)+position.getZ(i+1))/2;
    // Lines that run along a wall sit exactly on the outline, so test just inside it.
    assert.ok(polygonContains(outline,mx*.98,mz*.98),'every grid line lies on the pavilion floor');
  }
});
await test('placed pieces take a free spot inside the tent and keep their distance',()=>{
  const footprint=scaledFootprint(rectangle),placed=[];
  for(const size of [[2.2,.9],[1.6,.8],[3,1.1],[.6,.6]]){
    const slot=freeFloorSlot({footprint,width:size[0],depth:size[1],occupied:placed});
    assert.ok(slot,'a free spot is found');
    const piece={x:slot[0],z:slot[1],width:size[0],depth:size[1],angle:0};
    assert.ok(rectInsideFootprint(footprint,piece.x,piece.z,piece.width,piece.depth,0,.2),'the whole piece is inside the walls');
    for(const other of placed)assert.ok(!rectsOverlap(piece,other),'pieces do not overlap');
    assert.ok(Math.abs(slot[0]%.5)<1e-9&&Math.abs(slot[1]%.5)<1e-9,`the spot sits on the half-metre lattice: ${slot}`);
    placed.push(piece);
  }
});
await test('a piece dragged past the wall is brought back onto its own tent floor',()=>{
  const footprint=scaledFootprint(rectangle);
  const [x,z]=clampIntoFootprint(footprint,40,-25,1.8,.9,0);
  assert.ok(rectInsideFootprint(footprint,x,z,1.8,.9,0,.04),'the piece ends up inside');
  assert.ok(Math.hypot(x,z)>3,'and stays near the side it was dragged towards');
  const inside=clampIntoFootprint(footprint,1,2,1,1,0);assert.deepEqual(inside,[1,2]); // already inside, so untouched
});
await test('pieces in a turned tent map back to the site through the same yaw the renderer uses',()=>{
  const piece={id:'p',kind:'furniture',position:worldGroundPoint(rectangle,2,-1.5).flatMap((v,i)=>i?[v]:[v,0]).slice(0,3),dimensions:[1,1,1],rotation:[0,rectangle.rotation[1],0],metadata:{parentTentId:rectangle.id}};
  piece.position=[piece.position[0],0,piece.position[1]===0?piece.position[2]:piece.position[1]];
  const world=worldGroundPoint(rectangle,2,-1.5);
  const seated={...piece,position:[world[0],0,world[1]]};
  const [local]=occupantsOf([seated],rectangle);
  assert.ok(Math.abs(local.x-2)<1e-6&&Math.abs(local.z+1.5)<1e-6);
  assert.ok(Math.abs(local.angle)<1e-6);
});

await test('the measured ground falls towards the lake end and is level across the width',()=>{
  const site={terrain:{model:'plane',northFallPerMetre:-0.006685,crossFallPerMetre:0,referenceX:0}};
  assert.equal(terrainHeight(site,0,0),0);
  assert.ok(Math.abs(terrainHeight(site,286.2,0)+1.913)<0.002,'north end sits 1.91 m low');
  assert.ok(Math.abs(terrainHeight(site,-286.2,0)-1.913)<0.002,'south end sits 1.91 m high');
  assert.equal(terrainHeight(site,100,140),terrainHeight(site,100,-140),'no cross fall is claimed');
  assert.equal(terrainHeight({},10,10),0,'a site without a measured plane stays flat');
});
await test('a piece inside a tent rides that tent’s level floor, not the slope under itself',()=>{
  const site={terrain:{model:'plane',northFallPerMetre:-0.01,crossFallPerMetre:0,referenceX:0}};
  const tent={id:'T',kind:'tent',position:[100,0,0],dimensions:[20,5,40],rotation:[0,0,0]};
  const piece={id:'F',kind:'furniture',position:[112,.13,0],dimensions:[1,1,1],rotation:[0,0,0],metadata:{parentTentId:'T'}};
  const scene={site,objects:[tent,piece]};
  assert.equal(standingHeight(scene,piece),standingHeight(scene,tent),'it sits on the tent floor');
  assert.notEqual(standingHeight(scene,piece),terrainHeight(site,piece.position[0],piece.position[2]));
});
await test('a tent pitched over a bunker is reported',()=>{
  const bunker={id:'venue-bunker-99',name:'Bunker',kind:'ground',position:[0,0,0],rotation:[0,0,0],dimensions:[20,.02,20],
    points:[[-10,-10],[10,-10],[10,10],[-10,10]],metadata:{surface:'bunker'}};
  const over={id:'A',name:'Over it',kind:'tent',position:[4,0,4],rotation:[0,0,0],dimensions:[6,4,6]};
  const clear={id:'B',name:'Clear of it',kind:'tent',position:[60,0,60],rotation:[0,0,0],dimensions:[6,4,6]};
  const scene={site:{},objects:[bunker,over,clear]};
  assert.deepEqual(courseFeaturesUnder(scene,over),['a bunker']);
  assert.deepEqual(courseFeaturesUnder(scene,clear),[]);
});
await test('the everyday playing surface is not reported as a problem',()=>{
  // the whole event stands on the fairway and the practice ground, so flagging those buries the real cases
  const surface=kind=>({id:'venue-'+kind,name:kind,kind:'ground',position:[0,0,0],rotation:[0,0,0],dimensions:[40,.02,40],
    points:[[-20,-20],[20,-20],[20,20],[-20,20]],metadata:{surface:kind}});
  const tent={id:'T',name:'T',kind:'tent',position:[0,0,0],rotation:[0,0,0],dimensions:[6,4,6]};
  for(const benign of ['fairway','driving_range'])
    assert.deepEqual(courseFeaturesUnder({site:{},objects:[surface(benign),tent]},tent),[],`${benign} is not a build problem`);
  assert.deepEqual(courseFeaturesUnder({site:{},objects:[surface('cartpath'),tent]},tent),['a cart path']);
  const scene=JSON.parse(readFileSync('private/event-studio/rbc/site-seed.json','utf8'));
  const flagged=scene.objects.filter(o=>courseFeaturesUnder(scene,o).length);
  assert.equal(flagged.length,9,`the delivered layout has nine structures needing ground works, got ${flagged.length}`);
});
await test('dragging a piece across the slope does not make it climb',()=>{
  // the renderer draws a root at stored elevation PLUS the ground under it; the write-back has to
  // take the ground back off, using the ground where the piece was dropped
  const site={terrain:{model:'plane',northFallPerMetre:-0.006685,crossFallPerMetre:0,referenceX:0}};
  const tent={id:'T',kind:'tent',position:[200,0,0],dimensions:[10,4,10],rotation:[0,0,0]};
  const scene={site,objects:[tent]};
  const groundAt=(x,z)=>standingHeight(scene,{...tent,position:[x,0,z]});
  let stored=tent.position[1], x=200, z=0;
  for(const [nx,nz] of [[200,0],[-260,40],[0,-120],[286,140],[-286,-140]]){
    const worldY=stored+groundAt(x,z);        // where the gizmo picked it up
    stored=+(worldY-groundAt(nx,nz)).toFixed(3); // what the write-back stores after the move
    x=nx;z=nz;
    assert.ok(Math.abs(stored+groundAt(x,z)-worldY)<1.5e-3,'it is redrawn at the height the user left it, within the stored precision');
  }
  assert.ok(Math.abs(stored)<3.9,`stored elevation stays sane, got ${stored}`);
});
await test('the delivered site states which way north is, because the names do not',()=>{
  const scene=JSON.parse(readFileSync('private/event-studio/rbc/site-seed.json','utf8'));
  assert.equal(scene.site.terrain.orientation.northAxis,'+X');
  assert.equal(scene.site.terrain.orientation.eastAxis,'+Z');
  // the trap: objects named north sit at negative Z, which is west once the sheet is turned
  const north=scene.objects.find(o=>o.id==='toilet-north-a'),south=scene.objects.find(o=>o.id==='toilet-south');
  assert.ok(north.position[2]<south.position[2],'the names follow the drawing sheet, not the compass');
  assert.ok(scene.site.assumptions.some(a=>a.includes('Read the geometry, not the names')));
});
await test('the delivered site carries the measured ground and the traced course',()=>{
  const scene=JSON.parse(readFileSync('private/event-studio/rbc/site-seed.json','utf8'));
  const terrain=scene.site.terrain;
  assert.equal(terrain.model,'plane');
  assert.ok(terrain.northFallPerMetre<-0.006&&terrain.northFallPerMetre>-0.008,'the fall matches the measurement');
  assert.equal(terrain.crossFallPerMetre,0,'no cross fall is invented');
  assert.ok(terrain.notes.includes('cannot resolve'),'the limits of the source data travel with the model');
  const course=scene.objects.filter(o=>o.metadata?.surface);
  assert.ok(course.length>=40,`the course features are present: ${course.length}`);
  assert.ok(course.every(o=>o.locked),'course features are locked so they are not dragged by accident');
  const b=scene.site.bounds;
  for(const o of course) for(const [x,z] of o.points)
    assert.ok(o.position[0]+x>=b.minX-.5&&o.position[0]+x<=b.maxX+.5&&o.position[2]+z>=b.minZ-.5&&o.position[2]+z<=b.maxZ+.5,`${o.id} stays inside the event footprint`);
  assert.ok(scene.site.references.some(r=>r.notes?.includes('OpenStreetMap')),'the traced source is credited');
});

console.log(JSON.stringify({ok:true,tests}));

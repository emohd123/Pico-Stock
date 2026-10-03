import assert from 'node:assert/strict';
import * as THREE from 'three';
import { spawnSync } from 'node:child_process';
import { applyTentOption, supplierCanopy, supplierWalls, tentQuote, tentLayoutIssues } from '../lib/eventStudioTents.js';
import { EventStudioEngine } from '../lib/eventStudioEngine.js';
import { tentFootprint, worldGroundPoint } from '../lib/eventStudioLayout.js';
const base={id:'lounge-1',name:'Lounge',kind:'tent',dimensions:[11,6.5,12.65],position:[20,0,25],rotation:[0,.4,0],metadata:{}};
const e=Object.create(EventStudioEngine.prototype);Object.assign(e,{materials:new Map(),walls:true,data:{site:{bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}},objects:[]}});
for(const [id,glass,cost,wallCount] of [['mq40',false,2900,0],['arabesque',false,2400,0],['arabesque',true,4200,1]]){
 const o=applyTentOption(base,id,glass);assert.deepEqual(o.position,base.position);assert.deepEqual(o.rotation,base.rotation);assert.equal(tentQuote(o).total,cost);assert.equal(supplierWalls(o).segments.length,wallCount);
 e.data.objects=[o];e.walkCollisionCache=null;e.wallCache=null;
 for(const [x,z,expected] of [[0,-o.dimensions[2]/2,true],[0,o.dimensions[2]/2,!glass],[0,0,true]]){const p=worldGroundPoint(o,x,z);assert.equal(e.canWalk(...p),expected,`${id} glass ${glass} at ${x},${z}`);}
 const root=new THREE.Group();e.tent(o,root);const roof=root.children.find(m=>m.userData.part==='roof');roof.geometry.computeBoundingBox();const bounds=roof.geometry.boundingBox;assert.ok(Math.abs(bounds.max.x-bounds.min.x-o.dimensions[0])<1e-5);assert.ok(Math.abs(bounds.max.z-bounds.min.z-o.dimensions[2])<1e-5);assert.ok(Math.abs(bounds.max.y-(id==='mq40'?6.8:5.2))<1e-5);
 assert.equal(root.children.filter(m=>m.userData.part==='wall').length>0,glass);assert.equal(root.children.filter(m=>m.userData.part==='floor').length,1);
 const data=supplierCanopy(o);assert.ok(data.vertices.every(Number.isFinite));assert.ok(data.indices.every(i=>i>=0&&i<data.vertices.length/3));
 const python=spawnSync('python',['-c',"import sys,json;sys.path.insert(0,'scripts/event-studio');from supplier_tents import canopy;d=json.load(sys.stdin);v,f=canopy(d['object'],d['points']);print(json.dumps({'vertices':[c for p in v for c in p],'indices':[i for f0 in f for i in f0]}))"],{input:JSON.stringify({object:o,points:tentFootprint(o)}),encoding:'utf8'});assert.equal(python.status,0,python.stderr);const other=JSON.parse(python.stdout);assert.deepEqual(other.indices,data.indices);assert.equal(other.vertices.length,data.vertices.length);assert.ok(other.vertices.every((v,i)=>Math.abs(v-data.vertices[i])<1e-10),'browser and Blender canopy parity');
 console.log(`PASS ${id} glass=${glass}: price, preserved transforms, geometry bounds, wall collisions, Python parity`);
}
const a=applyTentOption(base,'arabesque'),b={...a,id:'neighbour',name:'Neighbour',position:[21,0,25]},f={id:'chair',kind:'furniture',dimensions:[1,1,1],position:[99,.13,99],rotation:[0,0,0],metadata:{parentTentId:a.id}};
assert.deepEqual(tentLayoutIssues({objects:[a,b,f]},a),{overlaps:['Neighbour'],outside:1});
const far={...b,position:[70,0,70]};assert.equal(tentLayoutIssues({objects:[a,far]},a).overlaps.length,0);
console.log('PASS overlap and out-of-footprint warnings; no furniture modifications');

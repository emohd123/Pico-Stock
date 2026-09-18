import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Box3,Vector3} from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const registry=JSON.parse(await readFile(path.join(root,'private/event-studio/rbc/furniture-assets.json'),'utf8'));
const namedColorChecks={'prod-1773061941304-2aleu':'#d9cbb1','wh-straight-off-white-sofa-long':'#e9e4d8','wh-cove-chair':'#e9e4d8'};
for(const [productId,expected] of Object.entries(namedColorChecks)){
  if(registry.items.find(i=>i.productId===productId)?.color!==expected)throw new Error(`Named catalogue body color regressed for ${productId}`);
}
const report=[];
for(const item of registry.items){
  const file=path.join(root,'public',item.modelUrl),buf=await readFile(file);
  const arrayBuffer=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(arrayBuffer,'',resolve,reject));
  gltf.scene.updateMatrixWorld(true);
  const box=new Box3().setFromObject(gltf.scene),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
  const actual=size.toArray(),errors=actual.map((v,i)=>Math.abs(v-item.dimensions[i]));
  let meshes=0,triangles=0;const bodyColors=new Set();
  gltf.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat.name.startsWith('Body '))bodyColors.add(`#${mat.color.getHexString()}`);}});
  const ok=errors.every(v=>v<.001)&&Math.abs(box.min.y)<.001&&Math.abs(center.x)<.001&&Math.abs(center.z)<.001&&meshes>0&&[...bodyColors].every(c=>c===item.color);
  const photo=await stat(path.join(root,'public',item.photoUrl));
  report.push({productId:item.productId,ok,dimensions:item.dimensions,actual:actual.map(v=>+v.toFixed(6)),maxDimensionError:Math.max(...errors),floorY:box.min.y,centerXZ:[center.x,center.z],meshes,triangles,bytes:buf.length,photoBytes:photo.size,bodyColors:[...bodyColors]});
  if(!ok) console.error('FAILED',report.at(-1));
}
const result={count:report.length,passed:report.filter(r=>r.ok).length,totalBytes:report.reduce((n,r)=>n+r.bytes,0),maxMeshes:Math.max(...report.map(r=>r.meshes)),maxTriangles:Math.max(...report.map(r=>r.triangles)),models:report};
await writeFile(path.join(root,'private/event-studio/rbc/furniture-verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,models:undefined}));
if(result.passed!==result.count)process.exitCode=1;

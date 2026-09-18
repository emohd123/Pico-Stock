import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EVENT_LAYOUT_ID } from '../lib/eventLayoutSchema.js';

const root=await realpath(path.join(process.cwd(),'private/event-studio/rbc'));
const requested=process.argv.slice(2);
if(!requested.length)throw new Error('Provide the explicit final delivery file paths relative to private/event-studio/rbc.');
const files=[];
for(const relative of requested){
  const resolved=await realpath(path.resolve(root,relative));
  if(!resolved.startsWith(`${root}${path.sep}`)||path.basename(resolved)==='delivery-manifest.json')throw new Error('Only final files inside the private event directory may be listed.');
  const bytes=await readFile(resolved),assetPath=path.relative(root,resolved).split(path.sep).join('/');
  files.push({path:assetPath,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:`/api/pico-ai/admin/event-layouts/${EVENT_LAYOUT_ID}/assets/${assetPath.split('/').map(encodeURIComponent).join('/')}`});
}
const seed=JSON.parse(await readFile(path.join(root,'site-seed.json'),'utf8'));
const manifest={schemaVersion:1,eventId:EVENT_LAYOUT_ID,generatedAt:new Date().toISOString(),units:'m',source:{name:seed.site.sourceName,objects:seed.objects.length,tents:seed.objects.filter(o=>o.kind==='tent').length,furniture:seed.objects.filter(o=>o.kind==='furniture').length},files};
await writeFile(path.join(root,'delivery-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({created:'private/event-studio/rbc/delivery-manifest.json',files:files.length,totalBytes:files.reduce((sum,file)=>sum+file.bytes,0)}));

import fs from 'node:fs/promises';import assert from 'node:assert/strict';import dotenv from 'dotenv';import sharp from 'sharp';import {createClient} from '@supabase/supabase-js';import {randomBytes,createHash} from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);const base='http://127.0.0.1:3100/api/pico-ai';
const hash=s=>createHash('sha256').update(s).digest('hex'),token=randomBytes(32).toString('hex');
const {data:event,error}=await db.from('pico_ai_events').insert({name:'Implementation verification — fictional samples',mode:'live',generation_limit:2,budget_usd:0.5}).select().single();assert.ifError(error);
const {data:device}=await db.from('pico_ai_devices').insert({event_id:event.id,name:'Automated verification',token_hash:hash(token)}).select().single();const h={'X-Device-Token':token,'Content-Type':'application/json'};
async function api(path,method='GET',data,headers=h){const r=await fetch(base+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
for(const outfit of ['abaya','thobe']){
 const s=await api('/sessions','POST',{outfit,language:'en',accepted:true});const sh={...h,Authorization:`Bearer ${s.secret}`};const j=await api(`/sessions/${s.id}/capture`,'POST',{attemptId:crypto.randomUUID()},sh);
 const bytes=await sharp(`../ai photo post/saudi-moment-app/public/assets/portraits/${outfit}-card.webp`).resize(768,1024).jpeg().toBuffer();
 const upload=await fetch(base+j.upload.replace('/api',''),{method:'POST',headers:{...sh,'Content-Type':'image/jpeg'},body:bytes});assert.equal(upload.status,200);
 await api(`/jobs/${j.id}/process`,'POST',null,sh);const result=await api(`/jobs/${j.id}`,'GET',null,sh);console.log(outfit,result.status,result.error||'');
 if(result.status==='ready'){const link=await api(`/jobs/${j.id}/image`,'GET',null,sh);await fs.writeFile(`output/pico-ai/live-${outfit}.jpg`,Buffer.from(await(await fetch(link.url)).arrayBuffer()));}
}
await db.from('pico_ai_events').update({paused:true}).eq('id',event.id);await db.from('pico_ai_devices').update({revoked:true,token_hash:null}).eq('id',device.id);
console.log('Pilot test event paused; maximum reserved spend $0.50.');

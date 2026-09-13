import { randomInt } from 'node:crypto';
import backgrounds from '@/lib/picoAi/backgrounds.json';
import landmarks from '@/lib/picoAi/landmarks.json';
import { LANDMARK_SCAN_CATALOG, findLandmarkScanItem } from '@/lib/picoAi/landmarkScanCatalog';
import { cookies } from 'next/headers';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/adminAuth';
import { bucket, db, checked, one, device, session, job, rate, publicJob, hash, secret, fail, signed, erase, responseError, siteUrl, putImage } from '@/lib/picoAi/core';
export const runtime='nodejs';
export const maxDuration=300;
export const dynamic='force-dynamic';
const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
async function body(r) { if(Number(r.headers.get('content-length'))>20000) fail('Request too large',413); return r.json(); }
async function cleanup() {
  const client=db();
  // Retention is enforced on reads as well; cleanup retries storage failures.
  const jobs=await checked(client.from('pico_ai_jobs').select('*').eq('purged',false).or(`expires_at.lt.${new Date().toISOString()},and(created_at.lt.${new Date(Date.now()-45*60000).toISOString()},status.neq.ready)`).limit(100));
  for(const j of jobs) {
    await erase([`${j.id}/capture.jpg`,`${j.id}/edit.jpg`,`${j.id}/poster.jpg`]);
    await checked(client.from('pico_ai_jobs').update({status:'expired',share_token:null,poster_path:null,purged:true}).eq('id',j.id));
  }
  await checked(client.from('pico_ai_rate_limits').delete().lt('expires_at',new Date().toISOString()));
  return jobs.length;
}
async function handler(r,{params}) {
 try {
  const p=params.path, method=r.method, client=db();
  if(p[0]==='admin') {
   if(!await verifyAdminSessionToken(cookies().get(getAdminCookieName())?.value || '')) fail('Unauthorized',401);
   if(method!=='GET' && r.headers.get('origin') && r.headers.get('origin')!==new URL(r.url).origin) fail('Invalid origin',403);
   if(p[1]==='overview' && method==='GET') {
    const active=await checked(client.from('pico_ai_events').select('id').order('created_at').limit(1).single());
    const [events,devices,jobs,sessions]=await Promise.all([
     checked(client.from('pico_ai_events').select('*').order('created_at')),
     checked(client.from('pico_ai_devices').select('id,event_id,name,revoked,last_seen,diagnostics').eq('event_id',active.id).order('created_at')),
     checked(client.from('pico_ai_jobs').select('id,session_id,event_id,mode,status,error,download_requests,reserved_usd,created_at,captured_at,completed_at').eq('event_id',active.id).order('created_at',{ascending:false}).limit(1000)),
     checked(client.from('pico_ai_sessions').select('id,event_id').eq('event_id',active.id).limit(10000))]);
    return json({events,devices,jobs,sessions:sessions.length,configured:{google:Boolean(process.env.GEMINI_API_KEY),email:Boolean(process.env.SMTP_USER&&process.env.SMTP_PASS),publicUrl:Boolean(process.env.PICO_AI_SITE_URL)}});
   }
   if(p[1]==='landmark-scans' && method==='GET') {
    const range=new URL(r.url).searchParams.get('range')||'30d';
    const days={ '7d':7, '30d':30, '90d':90, all:null }[range] ?? 30;
    let query=client.from('pico_ai_landmark_scans').select('landmark_id,visitor_hash,device_type,campaign,scanned_at').order('scanned_at',{ascending:false}).limit(20000);
    if(days) query=query.gte('scanned_at',new Date(Date.now()-days*86400000).toISOString());
    let {data:scans,error}=await query;
    let storageMode='scan-table';
    if(error&&(error.code==='42P01'||error.code==='PGRST205')) {
      const fallback=await client.from('pico_ai_internal').select('value').like('name','landmark_scan:%').limit(20000);
      if(fallback.error) fail('Scan report unavailable',503);
      scans=(fallback.data||[]).flatMap(row=>{try{return [JSON.parse(row.value)]}catch{return []}})
        .filter(scan=>!days||Date.parse(scan.scanned_at)>=Date.now()-days*86400000)
        .sort((a,b)=>Date.parse(b.scanned_at)-Date.parse(a.scanned_at));
      error=null;storageMode='compatible-store';
    }
    const installed=!error;
    if(error&&error.code!=='42P01'&&error.code!=='PGRST205') fail('Scan report unavailable',503);
    const rows=scans||[],byId=new Map(LANDMARK_SCAN_CATALOG.map(item=>[item.id,{...item,scans:0,visitors:new Set(),lastScan:null}]));
    const allVisitors=new Set(),deviceCounts={mobile:0,tablet:0,desktop:0,other:0},dailyMap=new Map();
    for(const scan of rows){const item=byId.get(scan.landmark_id);if(!item)continue;item.scans++;item.visitors.add(scan.visitor_hash);item.lastScan=item.lastScan||scan.scanned_at;allVisitors.add(scan.visitor_hash);deviceCounts[scan.device_type]=(deviceCounts[scan.device_type]||0)+1;const key=scan.scanned_at.slice(0,10);dailyMap.set(key,(dailyMap.get(key)||0)+1);}
    const landmarksReport=[...byId.values()].map(({visitors,...item})=>({...item,uniqueVisitors:visitors.size})).sort((a,b)=>b.scans-a.scans||a.reference.localeCompare(b.reference));
    const topLandmark=landmarksReport.find(item=>item.scans>0)||null;
    const trendDays=days||Math.max(30,Math.ceil((Date.now()-Date.parse(rows.at(-1)?.scanned_at||new Date().toISOString()))/86400000));
    const daily=Array.from({length:Math.min(trendDays,365)},(_,i)=>{const date=new Date(Date.now()-(Math.min(trendDays,365)-1-i)*86400000),key=date.toISOString().slice(0,10);return {date:key,label:date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}),scans:dailyMap.get(key)||0};});
    const devices=Object.entries(deviceCounts).map(([key,value])=>({key,label:key[0].toUpperCase()+key.slice(1),scans:value}));
    const scannedLandmarks=landmarksReport.filter(item=>item.scans>0).length;
    const insight=topLandmark?{title:`${topLandmark.name} is leading guest interest`,body:`It represents ${Math.round(topLandmark.scans/Math.max(rows.length,1)*100)}% of scans in this period. Keep its QR visible and compare nearby landmarks after more traveller traffic is recorded.`}:{title:'The report is ready for the first traveller scan',body:'Download any landmark QR below, scan it on a phone, and return here to see the visit recorded. The QR opens a mobile landmark page before the final content is approved.'};
    return json({installed,storageMode,range,summary:{totalScans:rows.length,uniqueVisitors:allVisitors.size,scannedLandmarks,totalLandmarks:LANDMARK_SCAN_CATALOG.length,topLandmark},daily,devices,landmarks:landmarksReport,insight});
   }
   if(p[1]==='landmark-qr' && method==='GET') {
    const landmark=findLandmarkScanItem(p[2]);if(!landmark)fail('Landmark not found',404);
    const QRCode=(await import('qrcode')).default;
    const trackingUrl=`${new URL(r.url).origin}/l/${landmark.reference.toLowerCase()}`;
    const svg=await QRCode.toString(trackingUrl,{type:'svg',errorCorrectionLevel:'H',margin:4,color:{dark:'#143f34',light:'#fffdf6'}});
    return new Response(svg,{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Content-Disposition':`attachment; filename="${landmark.reference}-${landmark.id}-QR.svg"`,'Cache-Control':'no-store','X-QR-Target':trackingUrl}});
   }
   if(p[1]==='events' && method==='PATCH') {
    const b=await body(r),old=await one('pico_ai_events','id',p[2]);
    const update={};
    if(b.background_id!==undefined){if(!backgrounds.some(x=>x.id===b.background_id)&&!landmarks.some(x=>x.id===b.background_id&&x.status==='approved'))fail('Choose an available portrait background');update.background_id=b.background_id;}
    if(b.name!==undefined) { if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100) fail('Event name is required'); update.name=b.name.trim(); }
    for(const key of ['paused','low_motion']) if(b[key]!==undefined) { if(typeof b[key]!=='boolean') fail('Invalid setting'); update[key]=b[key]; }
    if(b.mode!==undefined) { if(!['mock','live'].includes(b.mode)) fail('Invalid mode'); if(b.mode==='live') {siteUrl(); if(!process.env.GEMINI_API_KEY) fail('Google API key required');} update.mode=b.mode; }
    for(const key of ['generation_limit','budget_usd']) if(b[key]!==undefined) { if(!Number.isFinite(b[key])||b[key]<0||b[key]>10000||(key==='generation_limit'&&!Number.isInteger(b[key]))) fail('Invalid allowance'); update[key]=b[key]; }
    if(b.reset===true) update.reset_version=old.reset_version+1;
    return json(await checked(client.from('pico_ai_events').update(update).eq('id',old.id).select().single()));
   }
   if(p[1]==='devices' && method==='POST') {
    const b=await body(r);await one('pico_ai_events','id',b.eventId);
    if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80) fail('Screen name required');
    const code=String(randomInt(10000000,100000000));
    const d=await checked(client.from('pico_ai_devices').insert({name:b.name.trim(),event_id:b.eventId,pairing_hash:hash(code),pairing_expires:new Date(Date.now()+600000).toISOString()}).select('id,name').single());
    return json({...d,code,expiresIn:600});
   }
   if(p[1]==='devices' && method==='DELETE') {await checked(client.from('pico_ai_devices').update({revoked:true,token_hash:null,pairing_hash:null}).eq('id',p[2]));return json({ok:true});}
   if(p[1]==='jobs' && p[3]==='image' && method==='GET') {const j=await one('pico_ai_jobs','id',p[2]);if(j.status!=='ready'||Date.parse(j.expires_at)<Date.now()) fail('Photo expired',410);return Response.redirect(await signed(j.poster_path));}
   if(p[1]==='jobs' && method==='DELETE') {const j=await one('pico_ai_jobs','id',p[2]);await checked(client.from('pico_ai_jobs').update({status:'cancelled',share_token:null,poster_path:null}).eq('id',j.id));await erase([`${j.id}/capture.jpg`,`${j.id}/edit.jpg`,`${j.id}/poster.jpg`]);return json({ok:true});}
   if(p[1]==='cleanup' && method==='POST') return json({deleted:await cleanup()});
   fail('Not found',404);
  }
  if(p[0]==='cleanup') {
   if(!process.env.CRON_SECRET || r.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`) fail('Unauthorized',401);
   return json({deleted:await cleanup()});
  }
  if(p[0]==='pair' && method==='POST') {
   await rate(`pair:${r.headers.get('x-forwarded-for')||'local'}`,10,600);
   const b=await body(r);if(!/^\d{8}$/.test(b.code||'')) fail('Enter the eight-digit pairing code');
   const token=secret();
   const d=await checked(client.from('pico_ai_devices').update({token_hash:hash(token),pairing_hash:null,last_seen:new Date().toISOString()}).eq('pairing_hash',hash(b.code)).gt('pairing_expires',new Date().toISOString()).eq('revoked',false).select('id,event_id,name').maybeSingle());
   if(!d) fail('Pairing code expired or already used',401);return json({...d,token});
  }
  if(p[0]==='photo') {
   if(!/^[a-f0-9]{64}$/.test(p[1]||'')) fail('Photo link unavailable',404);
   const j=await one('pico_ai_jobs','share_token',p[1]);
   if(j.status!=='ready'||Date.parse(j.expires_at)<Date.now()) fail('This photo link has expired',410);
   if(p[2]==='download' && method==='GET') {await checked(client.rpc('pico_ai_download',{p_job:j.id}));return Response.redirect(await signed(j.poster_path,true));}
   if(p[2]==='email' && method==='POST') {
    const b=await body(r);if(typeof b.email!=='string'||b.email.length>254||!/^\S+@\S+\.\S+$/.test(b.email)||b.accepted!==true) fail('Enter your email and confirm delivery');
    if(!process.env.SMTP_USER||!process.env.SMTP_PASS) fail('Email is not available; please download your photo',503);
    await rate(`email:${j.id}`,3,3600);
    const claimed=await checked(client.from('pico_ai_jobs').update({email_claimed:true}).eq('id',j.id).eq('email_claimed',false).select('id'));
    if(!claimed.length) fail('Email has already been requested. Please use Download.',409);
    const nodemailer=(await import('nodemailer')).default;
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:15000,socketTimeout:20000});
    await transport.sendMail({from:process.env.EMAIL_FROM||process.env.SMTP_USER,to:b.email,subject:'Your Saudi Moment',text:`Your photo is ready: ${siteUrl()}/pico-ai/photo/${j.share_token}\nThis private link expires ${j.expires_at}.`});
    return json({ok:true});
   }
   if(method==='GET') return json({image:await signed(j.poster_path),expiresAt:j.expires_at,isSample:j.mode==='mock',email:Boolean(process.env.SMTP_USER&&process.env.SMTP_PASS)});
   fail('Not found',404);
  }
  const d=await device(r);
  if(p[0]==='bootstrap') return json({ok:true});
  if(p[0]==='event') {
   const e=await one('pico_ai_events','id',d.event_id);
   await checked(client.from('pico_ai_devices').update({last_seen:new Date().toISOString()}).eq('id',d.id));
   return json({mode:e.mode,eventName:e.name,sharing:true,email:Boolean(process.env.SMTP_USER&&process.env.SMTP_PASS),gallery:false,operator:'Pico',contact:'Ask the event team',settings:{backgroundId:e.background_id||'diriyah-arch',inactivitySeconds:90,paused:e.paused,lowMotion:e.low_motion,cameraId:'',mirror:true,scenario:'success',eventEndsAt:'',resetVersion:e.reset_version}});
  }
  if(p[0]==='diagnostics' && method==='POST') {const b=await body(r);await checked(client.from('pico_ai_devices').update({diagnostics:{android:String(b.android||'').slice(0,80),camera:String(b.camera||'').slice(0,200),appVersion:String(b.appVersion||'').slice(0,30)},last_seen:new Date().toISOString()}).eq('id',d.id));return json({ok:true});}
  if(p[0]==='sessions' && !p[1] && method==='POST') {
   await rate(`sessions:${d.id}`,20,60);const b=await body(r),e=await one('pico_ai_events','id',d.event_id);
   if(e.paused) fail('Event paused',409);
   if(b.accepted!==true || !['abaya','thobe'].includes(b.outfit) || !['ar','en'].includes(b.language)) fail('Please select an outfit and accept consent');
   const token=secret(),s=await checked(client.from('pico_ai_sessions').insert({device_id:d.id,event_id:d.event_id,secret_hash:hash(token),outfit:b.outfit,language:b.language,guardian:b.guardian===true,background_id:e.background_id||'diriyah-arch'}).select('id').single());
   return json({id:s.id,secret:token});
  }
  if(p[0]==='sessions' && p[2]==='capture' && method==='POST') {
   const {s}=await session(r,p[1]),b=await body(r);if(!/^[a-f0-9-]{36}$/i.test(b.attemptId||'')) fail('Invalid capture identifier');
   const previous=await checked(client.from('pico_ai_jobs').select('*').eq('session_id',s.id).eq('attempt_id',b.attemptId).maybeSingle());
   if(previous) return json({...publicJob(previous),upload:previous.status==='uploading'?await upload(previous.id):null});
   await rate(`capture:${s.id}`,4,3600);
   const e=await one('pico_ai_events','id',s.event_id);if(e.paused) fail('Event paused',409);
   const rows=await checked(client.from('pico_ai_jobs').upsert({session_id:s.id,event_id:s.event_id,attempt_id:b.attemptId,mode:e.mode},{onConflict:'session_id,attempt_id',ignoreDuplicates:true}).select('*'));
   const j=rows[0]||await checked(client.from('pico_ai_jobs').select('*').eq('session_id',s.id).eq('attempt_id',b.attemptId).single());
   return json({...publicJob(j),upload:j.status==='uploading'?await upload(j.id):null});
  }
  if(p[0]==='jobs') {
   const {j,s}=await job(r,p[1]);
   if(p[2]==='upload' && method==='POST') {
    if(j.status!=='uploading'||Date.parse(j.expires_at)<Date.now())fail('Capture is closed',409);
    if(Number(r.headers.get('content-length'))>2000000||r.headers.get('content-type')!=='image/jpeg')fail('Use a JPEG photo under 2 MB',413);
    const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2000000)fail('Photo is too large',413);
    const sharp=(await import('sharp')).default;const meta=await sharp(bytes,{limitInputPixels:24000000}).metadata();if(meta.format!=='jpeg')fail('Invalid photo');
    await putImage(`${j.id}/capture.jpg`,bytes);
    const latest=await one('pico_ai_jobs','id',j.id);if(latest.status!=='uploading'){await erase([`${j.id}/capture.jpg`]);fail('Capture is closed',409);}
    return json({ok:true});
   }
   if(p[2]==='process' && method==='POST') {
    await checked(client.from('pico_ai_jobs').update({status:'queued'}).eq('id',j.id).eq('status','uploading'));
    const {processJob}=await import('@/lib/picoAi/process');await processJob(j,s);return json({ok:true});
   }
   if(p[2]==='cancel' && method==='POST') {
    await checked(client.from('pico_ai_jobs').update({status:'cancelled',share_token:null,poster_path:null}).eq('id',j.id));
    await erase([`${j.id}/capture.jpg`,`${j.id}/edit.jpg`,`${j.id}/poster.jpg`]);return json({ok:true});
   }
   if(p[2]==='image' && method==='GET') {if(j.status!=='ready'||Date.parse(j.expires_at)<Date.now()) fail('Result expired',410);return json({url:await signed(j.poster_path)});}
   if(method==='GET') {
    if(['editing','compositing'].includes(j.status)&&Date.parse(j.started_at)<Date.now()-300000) {await checked(client.from('pico_ai_jobs').update({status:'failed',error:'Processing interrupted. Ask staff before another paid capture.'}).eq('id',j.id).in('status',['editing','compositing']));j.status='failed';j.error='Processing interrupted. Ask staff for help.';}
    return json(publicJob(j));
   }
  }
  fail('Not found',404);
 }catch(error){return responseError(error);}
}
async function upload(id) {return `/api/jobs/${id}/upload`;}
function cors(r){const origin=r.headers.get('origin');const allowed=['https://appassets.androidplatform.net',...(process.env.NODE_ENV!=='production'?['http://localhost:5173','http://127.0.0.1:5173']:[])];return origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type, X-Device-Token, Authorization, X-Kiosk-Request','Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Vary':'Origin'}:{};}
export async function OPTIONS(r){return new Response(null,{status:204,headers:cors(r)});}
async function serve(r,ctx){const result=await handler(r,ctx);for(const [key,value] of Object.entries(cors(r)))result.headers.set(key,value);return result;}
export {serve as GET,serve as POST,serve as PATCH,serve as DELETE};

import { cookies } from 'next/headers';
import { randomInt, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { getAdminCookieName, verifyAdminSessionToken } from '@/lib/adminAuth';
import { db, checked, hash, secret, fail, rate, bucket } from '@/lib/picoAi/core';
import { NAME_ART_DEFAULTS, NAME_ART_BACKGROUNDS, cleanGuestName } from '@/lib/nameArt/config';
import { renderNameArt } from '@/lib/nameArt/render';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const json = data => Response.json(data, { headers });
const table = () => db().from('pico_ai_internal');
async function read(key) { const row = await checked(table().select('value').eq('name', key).maybeSingle()); return row ? JSON.parse(row.value) : null; }
async function write(key, value) { await checked(table().upsert({ name: key, value: JSON.stringify(value) })); }
async function swap(key, previous, next) { return (await checked(table().update({ value: JSON.stringify(next) }).eq('name', key).eq('value', JSON.stringify(previous)).select('name'))).length > 0; }
async function list(prefix) { return (await checked(table().select('name,value').like('name', `${prefix}%`).limit(5000))).map(row => ({ key: row.name, ...JSON.parse(row.value) })); }
async function settings() { return { ...NAME_ART_DEFAULTS, ...await read('name-art:settings') }; }
async function body(request) {
  const text = await request.text(); if (text.length > 4096) fail('Request too large', 413);
  try { return JSON.parse(text); } catch { fail('Invalid request'); }
}
async function paired(request, role) {
  const token = request.headers.get('x-name-art-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) fail('Pair this device to continue', 401);
  const device = await read(`name-art:device:${hash(token)}`);
  if (!device || device.revoked || (role && device.role !== role)) fail('Device pairing is unavailable', 401);
  return device;
}
async function share(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail('Poster unavailable', 404);
  const link = await read(`name-art:share:${hash(token)}`);
  const job = link && await read(`name-art:job:${link.id}`);
  if (!job || !['queued', 'showing', 'displayed'].includes(job.status) || Date.parse(job.expiresAt) < Date.now()) fail('This poster link has expired', 410);
  return job;
}
function publicJob(job) { return { id: job.id, name: job.name, background: job.background, status: job.status, shareToken: job.shareToken, expiresAt: job.expiresAt, startedAt: job.startedAt, duration: job.duration }; }
async function cleanupExpired() {
  const expired = (await list('name-art:job:')).filter(job => Date.parse(job.expiresAt) < Date.now());
  for (const job of expired.slice(0, 100)) {
    const { error } = await db().storage.from(bucket).remove([`name-art/${job.id}.jpg`]);
    if (error) fail('Expired poster cleanup needs retry', 503);
    await checked(table().delete().in('name', [job.key, `name-art:share:${hash(job.shareToken)}`]));
  }
  return expired.length;
}
async function handler(request, { params }) {
  try {
    const p = params.path, method = request.method;
    if (method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) fail('Invalid origin', 403);
    if (p[0] === 'admin') {
      if (!await verifyAdminSessionToken(cookies().get(getAdminCookieName())?.value || '')) fail('Unauthorized', 401);
      if (p[1] === 'overview' && method === 'GET') {
        const [config, devices, jobs] = await Promise.all([settings(), list('name-art:device:'), list('name-art:job:')]);
        return json({ settings: config, devices: devices.map(({ id, role, label, revoked, createdAt }) => ({ id, role, label, revoked, createdAt })), jobs: jobs.filter(job => Date.parse(job.expiresAt) > Date.now()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(publicJob) });
      }
      if (p[1] === 'settings' && method === 'PATCH') {
        const b = await body(request), next = await settings();
        if (!NAME_ART_BACKGROUNDS.some(item => item.id === b.background) || !Number.isInteger(b.duration) || b.duration < 8 || b.duration > 60 || !['reveal','gentle','none'].includes(b.motion) || typeof b.drift !== 'boolean' || typeof b.paused !== 'boolean') fail('Choose valid display settings');
        Object.assign(next, { background:b.background, duration:b.duration, motion:b.motion, drift:b.drift, paused:b.paused });
        await write('name-art:settings', next); return json(next);
      }
      if (p[1] === 'pair' && method === 'POST') {
        const b = await body(request); if (!['tablet','screen'].includes(b.role)) fail('Choose iPad or poster screen');
        const code = String(randomInt(10000000,100000000));
        await write(`name-art:pair:${hash(code)}`, { role:b.role, label:String(b.label || b.role).slice(0,60), expiresAt:Date.now()+600000, used:false });
        return json({ code, expiresIn:600 });
      }
      if (p[1] === 'devices' && method === 'DELETE') {
        const found = (await list('name-art:device:')).find(device => device.id === p[2]);
        if (!found) fail('Device not found',404);
        const {key,...device} = found; await write(key,{...device,revoked:true}); return json({ok:true});
      }
      if (p[1] === 'cleanup' && method === 'POST') return json({ expired:await cleanupExpired() });
      fail('Not found',404);
    }
    if (p[0] === 'pair' && method === 'POST') {
      await rate(`name-art-pair:${request.headers.get('x-forwarded-for') || 'local'}`,10,600);
      const b = await body(request); if (!/^\d{8}$/.test(b.code || '')) fail('Enter the eight-digit code');
      const key = `name-art:pair:${hash(b.code)}`, pair = await read(key);
      if (!pair || pair.used || pair.expiresAt < Date.now()) fail('Pairing code expired or already used',401);
      if (b.role && b.role !== pair.role) fail('This code is for the other device. Use the matching iPad or screen code.',400);
      if (!await swap(key,pair,{...pair,used:true})) fail('Pairing code already used',409);
      const token = secret(), device = { id:randomUUID(), role:pair.role, label:pair.label, createdAt:new Date().toISOString(), revoked:false };
      await write(`name-art:device:${hash(token)}`,device); return json({...device,token});
    }
    if (p[0] === 'poster') {
      if (method !== 'GET') fail('Not found',404);
      const job = await share(p[1]);
      if (p[2] === 'image' || p[2] === 'download') {
        const {data,error} = await db().storage.from(bucket).download(`name-art/${job.id}.jpg`);
        if (error) fail('Poster unavailable',503);
        return new Response(await data.arrayBuffer(), { headers:{...headers,'Content-Type':'image/jpeg',...(p[2]==='download'?{'Content-Disposition':'attachment; filename="My-National-Day-Name.jpg"'}:{})} });
      }
      if (p[2] === 'qr') {
        const url = `${new URL(request.url).origin}/name-art/p/${p[1]}`;
        const svg = await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,color:{dark:'#123c2c',light:'#ffffff'}});
        return new Response(svg,{headers:{...headers,'Content-Type':'image/svg+xml','Content-Disposition':'inline; filename="My-poster-QR.svg"'}});
      }
      return json(publicJob(job));
    }
    const device = await paired(request);
    if (p[0] === 'bootstrap' && method === 'GET') return json({ device:{role:device.role,label:device.label},settings:await settings() });
    if (p[0] === 'jobs' && method === 'POST') {
      if (device.role !== 'tablet') fail('Use the paired iPad to enter a name',403);
      const b = await body(request), name = cleanGuestName(b.name);
      if (!name || b.accepted !== true || !/^[a-f0-9-]{36}$/i.test(b.requestId || '')) fail('Enter a name up to 30 letters and confirm it may appear on screen');
      const id = hash(`${device.id}:${b.requestId}`).slice(0,32), key = `name-art:job:${id}`, existing = await read(key);
      if (existing) { if (existing.status === 'rendering') fail('Poster is still being created. Please retry in a moment.',409); if(existing.status==='failed') fail('Creation failed; start a new poster',409); return json(publicJob(existing)); }
      await rate(`name-art-create:${device.id}`,12,60);
      const config = await settings(); if (config.paused) fail('The experience is paused. Please ask the event team.',409);
      const jobs = await list('name-art:job:');
      if (jobs.filter(job => ['rendering','queued'].includes(job.status) && Date.parse(job.expiresAt)>Date.now()).length >= 25) fail('The screen queue is full. Please try again shortly.',429);
      const now = Date.now(), shareToken = secret();
      const job = {id,deviceId:device.id,name,background:config.background,shareToken,status:'rendering',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+48*3600000).toISOString(),duration:config.duration};
      const inserted = await checked(table().upsert({name:key,value:JSON.stringify(job)},{onConflict:'name',ignoreDuplicates:true}).select('name'));
      if (!inserted.length) fail('Poster is already being created. Please retry shortly.',409);
      try {
        const bytes = await renderNameArt(name,config.background);
        const {error} = await db().storage.from(bucket).upload(`name-art/${id}.jpg`,bytes,{contentType:'image/jpeg',upsert:false});
        if(error) fail('Poster storage unavailable',503);
        await write(`name-art:share:${hash(shareToken)}`,{id});
        job.status='queued'; await write(key,job); return json(publicJob(job));
      } catch(error) { await write(key,{...job,status:'failed'}); throw error; }
    }
    if (p[0] === 'display' && method === 'GET') {
      if(device.role !== 'screen') fail('Use the paired poster screen',403);
      const config = await settings(); if(config.paused) return json({settings:config,job:null});
      const jobs=(await list('name-art:job:')).filter(job=>Date.parse(job.expiresAt)>Date.now()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      for(const record of jobs.filter(job=>job.status==='showing')) {
        const {key,...job}=record;
        if(Date.parse(job.startedAt)+job.duration*1000>Date.now()) return json({settings:config,job:publicJob(job)});
        await swap(key,job,{...job,status:'displayed'});
      }
      const queued=jobs.find(job=>job.status==='queued'&&Date.parse(job.createdAt)>Date.now()-3600000);
      if(!queued) return json({settings:config,job:null});
      const {key,...job}=queued, next={...job,status:'showing',startedAt:new Date().toISOString()};
      const claimed=await swap(key,job,next);
      return json({settings:config,job:publicJob(claimed?next:await read(key))});
    }
    fail('Not found',404);
  } catch(error) { console.error('Name Art:',error.status || 500,error.message); return Response.json({error:error.status?error.message:'Name Art is temporarily unavailable. Please ask the event team.'},{status:error.status||500,headers}); }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };

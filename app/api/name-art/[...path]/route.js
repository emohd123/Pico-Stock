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
async function list(prefix) {
  const rows = [];
  // PostgREST caps a response at 1,000 rows. Later guests must remain visible.
  for (let offset = 0; ; offset += 1000) {
    const page = await checked(table().select('name,value').like('name', `${prefix}%`).order('name').range(offset, offset + 999));
    rows.push(...page.map(row => ({ key: row.name, ...JSON.parse(row.value) })));
    if (page.length < 1000) return rows;
  }
}
async function settings() { return { ...NAME_ART_DEFAULTS, ...await read('name-art:settings') }; }
async function body(request) {
  const text = await request.text(); if (text.length > 4096) fail('Request too large', 413);
  try { return JSON.parse(text); } catch { fail('Invalid request'); }
}
/* The booth posts a rendered poster, which is megabytes rather than the few hundred bytes
   every other endpoint takes. It gets its own reader so the tight 4KB cap keeps protecting
   the rest; the ceiling here is set by the platform's own request limit, and the byte check
   on the decoded image is what actually bounds what gets stored. */
async function largeBody(request) {
  const text = await request.text(); if (text.length > 4400000) fail('Poster image too large', 413);
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
function publicJob(job) { return { id: job.id, name: job.name, background: job.background, status: job.status, shareToken: job.shareToken, expiresAt: job.expiresAt, startedAt: job.startedAt, duration: job.duration, finishAt: job.finishAt || null }; }
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
        if (!NAME_ART_BACKGROUNDS.some(item => item.id === b.background) || !Number.isInteger(b.duration) || b.duration < 8 || b.duration > 60 || !['reveal','gentle','none'].includes(b.motion) || typeof b.drift !== 'boolean' || typeof b.paused !== 'boolean' || !Number.isInteger(b.finishGrace) || b.finishGrace < 0 || b.finishGrace > 60) fail('Choose valid display settings');
        // An empty permanent code disables it and leaves only one-use codes.
        if (typeof b.pairingCode !== 'string' || !(b.pairingCode === '' || /^\d{8}$/.test(b.pairingCode))) fail('The permanent pairing code must be eight digits, or empty to switch it off');
        Object.assign(next, { background:b.background, duration:b.duration, motion:b.motion, drift:b.drift, paused:b.paused, finishGrace:b.finishGrace, pairingCode:b.pairingCode });
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
      // An unattended booth must be able to re-pair itself, so the permanent code is reusable and never expires.
      // The role comes from the page the device is on, because a permanent code cannot carry one.
      const config = await settings();
      if (config.pairingCode && b.code === config.pairingCode) {
        if (!['tablet','screen'].includes(b.role)) fail('Choose iPad or poster screen');
        const token = secret(), device = { id:randomUUID(), role:b.role, label:b.role==='tablet'?'Name Art iPad':'Name Art poster screen', createdAt:new Date().toISOString(), revoked:false };
        await write(`name-art:device:${hash(token)}`,device); return json({...device,token});
      }
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
    /* The offline booth publishes here.

       It posts the poster it already rendered rather than a name to render: the booth draws
       Arabic calligraphy and a chosen pair of faces that this server's renderer knows nothing
       about, so re-rendering here would put a different poster on the screen from the one in
       the guest's hands. The bytes are stored exactly as the tablet made them.

       It authenticates with the booth's permanent pairing code rather than a device token,
       because the booth is a kiosk that must recover on its own after a reboot with nobody
       there to pair it. */
    if (p[0] === 'booth' && method === 'POST') {
      const b = await largeBody(request);
      const config = await settings();
      if (!b.code || String(b.code) !== String(config.pairingCode)) fail('Not found', 404);
      if (config.paused) fail('The experience is paused', 409);
      const name = cleanGuestName(b.name);
      if (!name) fail('Enter a name up to 30 letters');
      if (!NAME_ART_BACKGROUNDS.some(item => item.id === b.background)) fail('Choose one of the National Day designs');
      if (!/^[a-f0-9-]{36}$/i.test(b.requestId || '')) fail('Missing request id');

      const jpeg = String(b.image || '');
      const comma = jpeg.indexOf(',');
      const bytes = Buffer.from(comma > -1 ? jpeg.slice(comma + 1) : jpeg, 'base64');
      // A poster is a few hundred KB; anything outside this is not one.
      if (bytes.length < 20000 || bytes.length > 3000000) fail('Poster image missing or too large');
      // Trust the extension for nothing: check it really is a JPEG.
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('Poster must be a JPEG');

      const id = hash(`booth:${b.requestId}`).slice(0, 32), key = `name-art:job:${id}`;
      const existing = await read(key);
      if (existing) return json(publicJob(existing));
      await rate('name-art-booth', 40, 60);

      const now = Date.now(), shareToken = secret();
      const job = { id, deviceId: 'booth', name, background: b.background, shareToken, status: 'rendering',
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 48 * 3600000).toISOString(),
        duration: config.duration, finishAt: null };
      const inserted = await checked(table().upsert({ name: key, value: JSON.stringify(job) }, { onConflict: 'name', ignoreDuplicates: true }).select('name'));
      if (!inserted.length) return json(publicJob(await read(key)));
      try {
        const { error } = await db().storage.from(bucket).upload(`name-art/${id}.jpg`, bytes, { contentType: 'image/jpeg', upsert: false });
        if (error) fail('Poster storage unavailable', 503);
        await write(`name-art:share:${hash(shareToken)}`, { id });
        job.status = 'queued'; await write(key, job);
        return json(publicJob(job));
      } catch (error) { await write(key, { ...job, status: 'failed' }); throw error; }
    }

    const device = await paired(request);
    if (p[0] === 'bootstrap' && method === 'GET') return json({ device:{role:device.role,label:device.label},settings:await settings() });
    if (p[0] === 'jobs' && method === 'POST') {
      if (device.role !== 'tablet') fail('Use the paired iPad to enter a name',403);
      const b = await body(request), name = cleanGuestName(b.name);
      if (!name || b.accepted !== true || !/^[a-f0-9-]{36}$/i.test(b.requestId || '')) fail('Enter a name up to 30 letters and confirm it may appear on screen');
      // The guest picks the backdrop; it is baked into the rendered poster, so it must be chosen before generating.
      if (!NAME_ART_BACKGROUNDS.some(item => item.id === b.background)) fail('Choose one of the National Day designs');
      const id = hash(`${device.id}:${b.requestId}`).slice(0,32), key = `name-art:job:${id}`, existing = await read(key);
      if (existing) { if (existing.status === 'rendering') fail('Poster is still being created. Please retry in a moment.',409); if(existing.status==='failed') fail('Creation failed; start a new poster',409); return json(publicJob(existing)); }
      await rate(`name-art-create:${device.id}`,12,60);
      const config = await settings(); if (config.paused) fail('The experience is paused. Please ask the event team.',409);
      const jobs = await list('name-art:job:');
      if (jobs.filter(job => Date.parse(job.expiresAt)>Date.now() && ((job.status==='queued' && Date.parse(job.createdAt)>Date.now()-3600000) || (job.status==='rendering' && Date.parse(job.createdAt)>Date.now()-120000))).length >= 25) fail('The screen queue is full. Please try again shortly.',429);
      const now = Date.now(), shareToken = secret();
      const job = {id,deviceId:device.id,name,background:b.background,shareToken,status:'rendering',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+48*3600000).toISOString(),duration:config.duration,finishAt:null};
      const inserted = await checked(table().upsert({name:key,value:JSON.stringify(job)},{onConflict:'name',ignoreDuplicates:true}).select('name'));
      if (!inserted.length) fail('Poster is already being created. Please retry shortly.',409);
      try {
        const bytes = await renderNameArt(name,b.background);
        const {error} = await db().storage.from(bucket).upload(`name-art/${id}.jpg`,bytes,{contentType:'image/jpeg',upsert:false});
        if(error) fail('Poster storage unavailable',503);
        await write(`name-art:share:${hash(shareToken)}`,{id});
        job.status='queued'; await write(key,job); return json(publicJob(job));
      } catch(error) { await write(key,{...job,status:'failed'}); throw error; }
    }
    if (p[0] === 'finish' && method === 'POST') {
      if (device.role !== 'tablet') fail('Use the paired iPad to finish a poster',403);
      const b = await body(request);
      if (!/^[a-f0-9]{32}$/.test(b.id || '')) fail('Poster not found',404);
      const key = `name-art:job:${b.id}`, job = await read(key);
      if (!job || job.deviceId !== device.id) fail('Poster not found',404);
      if (job.finishAt || !['queued','showing'].includes(job.status)) return json(publicJob(job));
      const config = await settings(), next = {...job,finishAt:new Date(Date.now()+config.finishGrace*1000).toISOString()};
      // Compare-and-swap: the screen may be claiming this same job on its own poll.
      if (!await swap(key,job,next)) return json(publicJob(await read(key)));
      return json(publicJob(next));
    }
    if (p[0] === 'display' && method === 'GET') {
      if(device.role !== 'screen') fail('Use the paired poster screen',403);
      const config = await settings(); if(config.paused) return json({settings:config,job:null});
      const jobs=(await list('name-art:job:')).filter(job=>Date.parse(job.expiresAt)>Date.now()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      for(const record of jobs.filter(job=>job.status==='showing')) {
        const {key,...job}=record;
        // Whichever comes first: the display timer running out, or the grace period after the guest tapped Finish.
        const until=Math.min(Date.parse(job.startedAt)+job.duration*1000, job.finishAt?Date.parse(job.finishAt):Infinity);
        if(until>Date.now()) return json({settings:config,job:publicJob(job)});
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

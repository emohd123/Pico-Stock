import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
export const bucket = 'pico-ai-private';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) fail('Cloud storage is not configured', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function checked(query) { const { data, error } = await query; if (error) { console.error('Pico AI database:', error.code, error.message); fail('Cloud service unavailable', 503); } return data; }
export async function one(table, column, value) { const data = await checked(db().from(table).select('*').eq(column, value).maybeSingle()); if (!data) fail('Not found',404); return data; }
export async function device(request) {
  const token = request.headers.get('x-device-token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) fail('Screen needs pairing',401);
  const d = await checked(db().from('pico_ai_devices').select('*').eq('token_hash',hash(token)).eq('revoked',false).maybeSingle());
  if (!d) fail('Screen pairing expired',401);
  return d;
}
export async function session(request, id) {
  const d = await device(request), s = await one('pico_ai_sessions','id',id);
  if (s.device_id !== d.id || s.secret_hash !== hash((request.headers.get('authorization') || '').replace(/^Bearer /,''))) fail('Unauthorized',401);
  if (Date.parse(s.expires_at) < Date.now()) fail('Session expired',410);
  return { d, s };
}
export async function job(request,id) { const j=await one('pico_ai_jobs','id',id); const auth=await session(request,j.session_id); return {...auth,j}; }
export async function rate(key, limit, seconds) { const ok=await checked(db().rpc('pico_ai_rate',{p_key:hash(key),p_limit:limit,p_seconds:seconds})); if (!ok) fail('Please wait before trying again',429); }
export function publicJob(j) { return { id:j.id,sessionId:j.session_id,attemptId:j.attempt_id,status:j.status,mode:j.mode,isSample:j.mode==='mock',error:j.error,shareToken:j.status==='ready'?j.share_token:undefined }; }
export async function readImage(path) { const {data,error}=await db().storage.from(bucket).download(path); if(error) fail('Photo unavailable',410); return Buffer.from(await data.arrayBuffer()); }
export async function putImage(path,bytes) { const {error}=await db().storage.from(bucket).upload(path,bytes,{contentType:'image/jpeg',upsert:true}); if(error) fail('Photo storage unavailable',503); }
export async function erase(paths) { if (!paths.length) return; const {error}=await db().storage.from(bucket).remove(paths.filter(Boolean)); if(error) fail('Photo deletion failed; retry required',503); }
export async function signed(path,download=false) { const {data,error}=await db().storage.from(bucket).createSignedUrl(path,60,download?{download:'Your-Saudi-Moment.jpg'}:{}); if(error) fail('Photo unavailable',410); return data.signedUrl; }
export function responseError(error) { console.error('Pico AI:',error.status || 500,error.message); return Response.json({error:error.status?error.message:'Processing failed. Please try again or ask a staff member.'},{status:error.status||500,headers:{'Cache-Control':'no-store'}}); }
export function siteUrl() { const url=process.env.PICO_AI_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL; if(!url || !/^https:\/\//.test(url)) fail('Public HTTPS photo link is not configured',503); return url.replace(/\/$/,''); }

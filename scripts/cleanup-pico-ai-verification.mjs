import dotenv from 'dotenv';import {createClient} from '@supabase/supabase-js';
dotenv.config({path:'.env.local',quiet:true});const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);
async function check(p){const {data,error}=await p;if(error)throw error;return data;}
const devices=await check(db.from('pico_ai_devices').select('id').in('name',['Verification screen','Automated verification']));
let removed=0;
for(const device of devices){const sessions=await check(db.from('pico_ai_sessions').select('id').eq('device_id',device.id));for(const session of sessions){const jobs=await check(db.from('pico_ai_jobs').select('id').eq('session_id',session.id));for(const job of jobs){await check(db.storage.from('pico-ai-private').remove([`${job.id}/capture.jpg`,`${job.id}/edit.jpg`,`${job.id}/poster.jpg`]));removed++;}await check(db.from('pico_ai_jobs').delete().eq('session_id',session.id));}await check(db.from('pico_ai_sessions').delete().eq('device_id',device.id));await check(db.from('pico_ai_devices').delete().eq('id',device.id));}
await check(db.from('pico_ai_events').delete().in('name',['Implementation verification — fictional samples','Reservation verification']));
console.log(`Removed ${removed} verification jobs and ${devices.length} verification devices. Main event preserved.`);

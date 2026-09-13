import {createClient} from 'npm:@supabase/supabase-js@2.99.0';
Deno.serve(async request=>{
 const key=request.headers.get('x-cleanup-key')||'';
 if(!/^[a-f0-9]{64}$/.test(key))return new Response('Unauthorized',{status:401});
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('');
 const {data:auth,error:authError}=await client.from('pico_ai_internal').select('value').eq('name','cleanup_hash').single();
 if(authError||auth?.value!==digest)return new Response('Unauthorized',{status:401});
 const now=new Date(),captureCutoff=new Date(Date.now()-45*60000).toISOString();
 const {data:jobs,error}=await client.from('pico_ai_jobs').select('*').eq('purged',false).or(`expires_at.lt.${now.toISOString()},and(created_at.lt.${captureCutoff},status.neq.ready)`).limit(500);
 if(error)return new Response('Cleanup query failed',{status:503});
 let count=0;
 for(const job of jobs||[]){
  const {error:removeError}=await client.storage.from('pico-ai-private').remove([`${job.id}/capture.jpg`,`${job.id}/edit.jpg`,`${job.id}/poster.jpg`]);
  if(removeError)continue;
  const {error:updateError}=await client.from('pico_ai_jobs').update({status:'expired',share_token:null,poster_path:null,purged:true}).eq('id',job.id);
  if(!updateError)count++;
 }
 await client.from('pico_ai_rate_limits').delete().lt('expires_at',now.toISOString());
 return Response.json({deleted:count});
});

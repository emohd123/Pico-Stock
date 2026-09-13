create or replace function public.pico_ai_claim(p_job uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare j pico_ai_jobs; e pico_ai_events;
begin
 select * into j from pico_ai_jobs where id=p_job for update;
 if not found or j.status<>'queued' or j.expires_at<now() then return false; end if;
 select * into e from pico_ai_events where id=j.event_id for update;
 if e.paused or e.mode<>j.mode then update pico_ai_jobs set status='failed',error='Event settings changed. Please begin again.' where id=p_job; return false; end if;
 if j.mode='live' then
  if e.generations>=e.generation_limit or e.reserved_usd+0.25>e.budget_usd then
   update pico_ai_jobs set status='failed',error='Event AI allowance reached' where id=p_job; return false;
  end if;
  update pico_ai_events set generations=generations+1,reserved_usd=reserved_usd+0.25 where id=e.id;
 end if;
 update pico_ai_jobs set status='editing',started_at=now(),reserved_usd=case when j.mode='live' then 0.25 else 0 end where id=p_job;
 return true;
end $$;
revoke all on function public.pico_ai_claim(uuid) from public,anon,authenticated;
grant execute on function public.pico_ai_claim(uuid) to service_role;

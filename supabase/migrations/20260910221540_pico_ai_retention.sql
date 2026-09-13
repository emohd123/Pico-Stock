alter table public.pico_ai_jobs add column captured_at timestamptz, add column completed_at timestamptz, add column purged boolean not null default false;
update public.pico_ai_jobs set captured_at=created_at, completed_at=finished_at where status='ready';
create table public.pico_ai_internal (name text primary key,value text not null);
alter table public.pico_ai_internal enable row level security;
revoke all on public.pico_ai_internal from public,anon,authenticated;
grant all on public.pico_ai_internal to service_role;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ declare token text=encode(extensions.gen_random_bytes(32),'hex');begin
 insert into public.pico_ai_internal(name,value) values('cleanup_hash',encode(extensions.digest(token,'sha256'),'hex'));
 perform cron.schedule('pico-ai-retention','*/15 * * * *',format($sql$select net.http_post(url := 'https://iclmzodwmqetoibgmrtz.supabase.co/functions/v1/pico-ai-cleanup',headers := jsonb_build_object('Content-Type','application/json','X-Cleanup-Key',%L),body := '{}'::jsonb);$sql$,token));
end $$;

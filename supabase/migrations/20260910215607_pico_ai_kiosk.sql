create table public.pico_ai_events (
 id uuid primary key default gen_random_uuid(), name text not null default 'Your Saudi Moment',
 mode text not null default 'mock' check(mode in ('mock','live')), paused boolean not null default false,
 generation_limit integer not null default 20 check(generation_limit between 0 and 10000),
 budget_usd numeric not null default 5 check(budget_usd between 0 and 10000),
 reserved_usd numeric not null default 0, generations integer not null default 0,
 low_motion boolean not null default false, reset_version integer not null default 0,
 created_at timestamptz not null default now()
);
insert into public.pico_ai_events(name) values('Your Saudi Moment');
create table public.pico_ai_devices (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.pico_ai_events(id),
 name text not null, token_hash text unique, pairing_hash text unique, pairing_expires timestamptz,
 revoked boolean not null default false, last_seen timestamptz, diagnostics jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.pico_ai_sessions (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.pico_ai_devices(id),
 event_id uuid not null references public.pico_ai_events(id), secret_hash text not null,
 outfit text not null check(outfit in ('abaya','thobe')), language text not null check(language in ('ar','en')),
 guardian boolean not null default false, consent_at timestamptz not null default now(), consent_version text not null default '2026-09-pico-ai-v1',
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 hour'
);
create table public.pico_ai_jobs (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.pico_ai_sessions(id),
 event_id uuid not null references public.pico_ai_events(id), attempt_id uuid not null,
 mode text not null check(mode in ('mock','live')), status text not null default 'uploading' check(status in ('uploading','queued','editing','compositing','ready','failed','cancelled','expired')),
 error text, poster_path text, share_token text unique, download_requests integer not null default 0,
 reserved_usd numeric not null default 0, email_claimed boolean not null default false,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 expires_at timestamptz not null default now()+interval '1 hour', unique(session_id,attempt_id)
);
create index pico_ai_jobs_event on public.pico_ai_jobs(event_id,created_at);
create index pico_ai_jobs_expiry on public.pico_ai_jobs(expires_at);
create table public.pico_ai_rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);
alter table public.pico_ai_events enable row level security;
alter table public.pico_ai_devices enable row level security;
alter table public.pico_ai_sessions enable row level security;
alter table public.pico_ai_jobs enable row level security;
alter table public.pico_ai_rate_limits enable row level security;
revoke all on public.pico_ai_events,public.pico_ai_devices,public.pico_ai_sessions,public.pico_ai_jobs,public.pico_ai_rate_limits from anon,authenticated;
grant all on public.pico_ai_events,public.pico_ai_devices,public.pico_ai_sessions,public.pico_ai_jobs,public.pico_ai_rate_limits to service_role;

create function public.pico_ai_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path=public as $$
declare count_hits integer;
begin
 insert into pico_ai_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when pico_ai_rate_limits.expires_at<now() then 1 else pico_ai_rate_limits.hits+1 end,
 expires_at=case when pico_ai_rate_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else pico_ai_rate_limits.expires_at end returning hits into count_hits;
 return count_hits<=p_limit;
end $$;
create function public.pico_ai_claim(p_job uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare j pico_ai_jobs; e pico_ai_events;
begin
 select * into j from pico_ai_jobs where id=p_job for update;
 if not found or j.status<>'queued' or j.expires_at<now() then return false; end if;
 select * into e from pico_ai_events where id=j.event_id for update;
 if e.paused then update pico_ai_jobs set status='failed',error='Event paused' where id=p_job; return false; end if;
 if j.mode='live' then
  if e.generations>=e.generation_limit or e.reserved_usd+0.25>e.budget_usd then
   update pico_ai_jobs set status='failed',error='Event AI allowance reached' where id=p_job; return false;
  end if;
  update pico_ai_events set generations=generations+1,reserved_usd=reserved_usd+0.25 where id=e.id;
 end if;
 update pico_ai_jobs set status='editing',started_at=now(),reserved_usd=case when j.mode='live' then 0.25 else 0 end where id=p_job;
 return true;
end $$;
create function public.pico_ai_download(p_job uuid) returns void language sql security invoker set search_path=public as $$
 update pico_ai_jobs set download_requests=download_requests+1 where id=p_job and status='ready' and expires_at>now();
$$;
revoke all on function public.pico_ai_rate(text,integer,integer),public.pico_ai_claim(uuid),public.pico_ai_download(uuid) from public,anon,authenticated;
grant execute on function public.pico_ai_rate(text,integer,integer),public.pico_ai_claim(uuid),public.pico_ai_download(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pico-ai-private','pico-ai-private',false,5242880,array['image/jpeg']) on conflict(id) do nothing;

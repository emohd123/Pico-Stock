-- Event Studio has its own persistence; kiosk events and stock reservations are unchanged.
create table if not exists public.event_layout_projects (
 id text primary key,
 scene jsonb not null,
 revision bigint not null default 0 check (revision >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (jsonb_typeof(scene) = 'object' and scene->>'id' = id and scene->>'units' = 'm' and scene->>'schemaVersion' = '1')
);
create table if not exists public.event_layout_revisions (
 project_id text not null references public.event_layout_projects(id) on delete cascade,
 revision bigint not null check (revision >= 0),
 scene jsonb not null,
 name text check (name is null or length(name) between 1 and 120),
 kind text not null check (kind in ('initial','autosave','named','restore')),
 restored_from bigint,
 created_at timestamptz not null default now(),
 primary key (project_id, revision)
);
create table if not exists public.event_layout_assets (
 project_id text not null references public.event_layout_projects(id) on delete cascade,
 asset_path text not null,
 storage_path text not null,
 filename text not null,
 content_type text not null,
 size_bytes bigint not null check (size_bytes >= 0),
 metadata jsonb not null default '{}',
 updated_at timestamptz not null default now(),
 primary key (project_id,asset_path)
);
alter table public.event_layout_projects enable row level security;
alter table public.event_layout_revisions enable row level security;
alter table public.event_layout_assets enable row level security;
revoke all on public.event_layout_projects,public.event_layout_revisions,public.event_layout_assets from public,anon,authenticated;
grant all on public.event_layout_projects,public.event_layout_revisions,public.event_layout_assets to service_role;

create or replace function public.event_layout_initialize(p_id text,p_scene jsonb)
returns public.event_layout_projects language plpgsql security invoker set search_path='' as $$
declare result public.event_layout_projects;
begin
 insert into public.event_layout_projects(id,scene) values(p_id,p_scene) on conflict(id) do nothing;
 select * into result from public.event_layout_projects where id=p_id for update;
 insert into public.event_layout_revisions(project_id,revision,scene,name,kind)
 values(result.id,result.revision,result.scene,'Original site layout','initial') on conflict(project_id,revision) do nothing;
 return result;
end $$;

create or replace function public.event_layout_save(p_id text,p_expected_revision bigint,p_scene jsonb,p_name text default null,p_restore_revision bigint default null)
returns public.event_layout_projects language plpgsql security invoker set search_path='' as $$
declare result public.event_layout_projects; next_scene jsonb;
begin
 select * into result from public.event_layout_projects where id=p_id for update;
 if not found then raise exception using errcode='P4040',message='Project not found'; end if;
 if result.revision <> p_expected_revision then
  raise exception using errcode='P4090',message='Layout revision conflict',detail=result.revision::text;
 end if;
 if p_restore_revision is not null then
  select scene into next_scene from public.event_layout_revisions where project_id=p_id and revision=p_restore_revision;
  if not found then raise exception using errcode='P4040',message='Version not found'; end if;
 else next_scene := p_scene;
 end if;
 if next_scene is null or octet_length(next_scene::text)>4500000 then raise exception 'Invalid layout document'; end if;
 update public.event_layout_projects set scene=next_scene,revision=revision+1,updated_at=now() where id=p_id returning * into result;
 insert into public.event_layout_revisions(project_id,revision,scene,name,kind,restored_from)
 values(p_id,result.revision,result.scene,p_name,case when p_restore_revision is not null then 'restore' when p_name is not null then 'named' else 'autosave' end,p_restore_revision);
 return result;
end $$;
revoke all on function public.event_layout_initialize(text,jsonb),public.event_layout_save(text,bigint,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.event_layout_initialize(text,jsonb),public.event_layout_save(text,bigint,jsonb,text,bigint) to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values('event-layout-private','event-layout-private',false,104857600) on conflict(id) do nothing;
notify pgrst, 'reload schema';

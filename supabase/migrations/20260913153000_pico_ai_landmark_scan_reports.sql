create table if not exists public.pico_ai_landmark_scans (
 id bigint generated always as identity primary key,
 landmark_id text not null check (landmark_id ~ '^[a-z0-9-]{3,100}$'),
 visitor_hash text not null check (length(visitor_hash) = 64),
 device_type text not null default 'other' check (device_type in ('mobile','tablet','desktop','other')),
 campaign text not null default 'bia-national-day' check (length(campaign) between 1 and 40),
 scanned_at timestamptz not null default now()
);
create index if not exists pico_ai_landmark_scans_time on public.pico_ai_landmark_scans(scanned_at desc);
create index if not exists pico_ai_landmark_scans_landmark on public.pico_ai_landmark_scans(landmark_id, scanned_at desc);
create index if not exists pico_ai_landmark_scans_visitor on public.pico_ai_landmark_scans(visitor_hash, scanned_at desc);
alter table public.pico_ai_landmark_scans enable row level security;
revoke all on public.pico_ai_landmark_scans from public, anon, authenticated;
grant all on public.pico_ai_landmark_scans to service_role;
comment on table public.pico_ai_landmark_scans is 'Privacy-minimised landmark QR scan events. No IP address or precise location is stored.';

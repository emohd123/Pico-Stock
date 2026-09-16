-- Event marketplaces: per-event client showcase pages (e.g. ROYAL BAHRAIN CONCOURS 2026)
-- and the requests clients submit from them.

create table if not exists public.event_marketplaces (
    id           text primary key,
    name         text not null,
    status       text not null default 'draft' check (status in ('draft','open','closed')),
    days         integer not null default 1 check (days between 1 and 60),
    config       jsonb not null default '{}'::jsonb,
    items        jsonb not null default '{}'::jsonb,
    custom_items jsonb not null default '[]'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table if not exists public.event_marketplace_requests (
    id          text primary key,
    event_id    text not null references public.event_marketplaces(id) on delete cascade,
    reference   text not null,
    company     text not null,
    contact     jsonb not null default '{}'::jsonb,
    items       jsonb not null default '[]'::jsonb,
    subtotal    numeric not null default 0,
    vat_percent numeric not null default 10,
    vat_amount  numeric not null default 0,
    total       numeric not null default 0,
    currency    text not null default 'BHD',
    status      text not null default 'new' check (status in ('new','contacted','quoted','confirmed','declined')),
    admin_notes text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists event_marketplace_requests_event_idx
    on public.event_marketplace_requests (event_id, created_at desc);
create unique index if not exists event_marketplace_requests_reference_idx
    on public.event_marketplace_requests (reference);

alter table public.event_marketplaces enable row level security;
alter table public.event_marketplace_requests enable row level security;

revoke all on public.event_marketplaces from public, anon, authenticated;
revoke all on public.event_marketplace_requests from public, anon, authenticated;
grant all on public.event_marketplaces to service_role;
grant all on public.event_marketplace_requests to service_role;

comment on table public.event_marketplaces is 'Per-event client marketplace configuration: showcased catalogue items, event pricing, VAT and payment terms.';
comment on table public.event_marketplace_requests is 'Client requests submitted from a public event marketplace page. Prices are resolved server-side.';

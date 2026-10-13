-- Additional electricity order form (Form B): one configurable form vendors fill
-- in from a public link, and the orders they submit. Orders follow the event
-- order flow: under review → approved, bank details emailed → receipt sent →
-- payment verified.
-- payment: { status: 'review' | 'awaiting' | 'submitted' | 'verified' | 'rejected',
--            proofPath, proofName, proofType, uploadedAt, approvedAt, verifiedAt, note }

create table if not exists public.electricity_forms (
    id         text primary key,
    status     text not null default 'draft' check (status in ('draft','open','closed')),
    config     jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.electricity_orders (
    id          text primary key,
    form_id     text not null,
    reference   text not null,
    order_key   text not null,
    vendor      jsonb not null default '{}'::jsonb,
    items       jsonb not null default '[]'::jsonb,
    total       numeric not null default 0,
    currency    text not null default 'BHD',
    status      text not null default 'new' check (status in ('new','confirmed','declined')),
    payment     jsonb not null default '{}'::jsonb,
    admin_notes text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists electricity_orders_form_idx on public.electricity_orders (form_id, created_at desc);
create unique index if not exists electricity_orders_reference_idx on public.electricity_orders (reference);
create unique index if not exists electricity_orders_order_key_idx on public.electricity_orders (order_key);

alter table public.electricity_forms enable row level security;
alter table public.electricity_orders enable row level security;

revoke all on public.electricity_forms from public, anon, authenticated;
revoke all on public.electricity_orders from public, anon, authenticated;
grant all on public.electricity_forms to service_role;
grant all on public.electricity_orders to service_role;

comment on table public.electricity_forms is 'Additional electricity order form (Form B): event details, power options and prices (VAT inclusive), terms.';
comment on table public.electricity_orders is 'Vendor orders for additional electricity. Prices are resolved server-side from the form.';

-- Required equipment list file for each additional electricity order.
-- equipment: { path, name, type, size, uploadedAt } in the private "electricity-equipment" bucket.
alter table public.electricity_orders
    add column if not exists equipment jsonb not null default '{}'::jsonb;
comment on column public.electricity_orders.equipment is 'Uploaded equipment list file: { path, name, type, size, uploadedAt } in the private electricity-equipment bucket.';

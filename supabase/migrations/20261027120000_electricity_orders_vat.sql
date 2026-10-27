-- VAT added on top of electricity orders: { percent, amount } (null for orders placed before VAT was added).
alter table public.electricity_orders add column if not exists vat jsonb;

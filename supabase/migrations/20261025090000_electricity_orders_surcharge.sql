-- Automatic late-order surcharge for electricity orders, set by the order date.
alter table public.electricity_orders
    add column if not exists subtotal numeric,
    add column if not exists surcharge jsonb;
comment on column public.electricity_orders.subtotal is 'Sum of the lines at normal prices, before any late surcharge.';
comment on column public.electricity_orders.surcharge is 'Late-order surcharge applied by order date: { percent, from, label, amount }, or null.';

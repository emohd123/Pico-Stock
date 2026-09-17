-- Pico's own (internal) price for a catalogue product.
-- The customer-facing products.price is derived from it with the standard
-- selling rule, cost / 0.70 (see SELLING_RULE_OPTIONS in lib/quotationCommercial.js).
alter table public.products add column if not exists cost_price numeric;

comment on column public.products.cost_price is 'Pico internal price. Customer price = cost_price / 0.70.';

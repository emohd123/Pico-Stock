-- Agreed discount on an additional electricity order: { percent, amount, note }.
-- Taken off the subtotal (plus any late surcharge) before VAT. Null = no discount.
alter table public.electricity_orders add column if not exists discount jsonb;

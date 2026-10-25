-- Late-order surcharge on event requests: % and amount fixed when the order is placed.
alter table public.event_marketplace_requests
    add column if not exists surcharge_percent numeric not null default 0,
    add column if not exists surcharge_amount numeric not null default 0,
    add column if not exists surcharge_label text not null default '';

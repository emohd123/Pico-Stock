-- Bank-transfer payments for event requests.
-- payment: { status: 'awaiting' | 'submitted' | 'verified' | 'rejected', proofPath, proofName,
--            proofType, uploadedAt, verifiedAt, note }
-- order_key: secret for the exhibitor's own order page (/o/<order_key>).
alter table public.event_marketplace_requests
    add column if not exists payment   jsonb not null default '{}'::jsonb,
    add column if not exists order_key text;

create unique index if not exists event_marketplace_requests_order_key_idx
    on public.event_marketplace_requests (order_key)
    where order_key is not null;

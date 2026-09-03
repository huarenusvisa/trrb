begin;

create table if not exists public.push_ticket_receipts (
  id bigint generated always as identity primary key,
  ticket_id text not null unique,
  push_token_id bigint not null references public.push_tokens(id) on delete cascade,
  delivery_log_id bigint references public.push_delivery_log(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error', 'expired')),
  error_code text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.push_ticket_receipts enable row level security;
-- No client policies: ticket IDs and delivery outcomes are server-only operational data.

create index if not exists push_ticket_receipts_pending_created_idx
  on public.push_ticket_receipts(created_at)
  where status = 'pending';

commit;

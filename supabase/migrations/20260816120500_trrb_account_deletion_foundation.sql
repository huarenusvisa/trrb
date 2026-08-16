begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','processing','completed','cancelled')),
  source text not null default 'app' check (source in ('ios','android','web','support','app')),
  reason text not null default '',
  requested_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  retention_notice text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_one_open_request
  on public.account_deletion_requests(user_id)
  where status in ('requested','processing');
create index if not exists account_deletion_status_requested_idx
  on public.account_deletion_requests(status, requested_at asc);

alter table public.account_deletion_requests enable row level security;

create policy "account deletion owner read"
  on public.account_deletion_requests for select
  using (auth.uid() = user_id);

create policy "account deletion owner request"
  on public.account_deletion_requests for insert
  with check (auth.uid() = user_id and status = 'requested');

-- Completion must be performed by a trusted server-side service role after
-- authenticated confirmation. Client roles intentionally cannot mark a request
-- completed or delete auth.users directly.

commit;

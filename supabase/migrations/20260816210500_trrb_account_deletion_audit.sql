begin;

create table if not exists public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  deleted_user_id uuid not null,
  source text not null check (source in ('ios','android','web','support','app')),
  completed_at timestamptz not null default now(),
  retention_reason text not null default 'Minimal proof that an authenticated account deletion completed.'
);

alter table public.account_deletion_audit enable row level security;
-- No client policies: only trusted service-role code may read/write this minimal audit table.

commit;

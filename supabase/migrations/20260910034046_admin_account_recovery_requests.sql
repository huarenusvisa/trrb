create table if not exists public.account_recovery_admin_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  login_identifier text not null,
  recovery_email text not null,
  verification_method text not null default 'manual_sms',
  verification_code_hash text not null,
  status text not null default 'processing',
  error_message text,
  created_at timestamptz not null default now(),
  reset_sent_at timestamptz,
  constraint account_recovery_admin_actions_method_check
    check (verification_method in ('manual_sms', 'manual_support')),
  constraint account_recovery_admin_actions_status_check
    check (status in ('processing', 'sent', 'failed'))
);

create index if not exists account_recovery_admin_actions_user_created_idx
  on public.account_recovery_admin_actions(user_id, created_at desc);

create index if not exists account_recovery_admin_actions_actor_created_idx
  on public.account_recovery_admin_actions(actor_user_id, created_at desc);

alter table public.account_recovery_admin_actions enable row level security;

revoke all on table public.account_recovery_admin_actions from anon, authenticated;
grant select, insert, update on table public.account_recovery_admin_actions to service_role;

comment on table public.account_recovery_admin_actions is
  'Server-only audit log for administrator-assisted account recovery. Verification codes are stored only as keyed hashes.';

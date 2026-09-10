begin;

create table if not exists public.account_login_identifiers (
  identifier_hash text primary key check (char_length(identifier_hash) = 64),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('phone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_recovery_channels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_email text not null,
  email_status text not null default 'pending' check (email_status in ('pending', 'verified')),
  email_requested_at timestamptz not null default now(),
  email_verified_at timestamptz,
  sms_status text not null default 'disabled' check (sms_status in ('disabled', 'pending', 'verified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_recovery_channels_email_ci_unique
  on public.account_recovery_channels (lower(recovery_email));
create index if not exists account_recovery_channels_status_idx
  on public.account_recovery_channels (email_status, updated_at desc);

alter table public.account_login_identifiers enable row level security;
alter table public.account_recovery_channels enable row level security;

revoke all on public.account_login_identifiers from anon, authenticated;
revoke all on public.account_recovery_channels from anon, authenticated;
grant all on public.account_login_identifiers to service_role;
grant all on public.account_recovery_channels to service_role;

comment on table public.account_login_identifiers is
  'Server-only mapping that preserves phone login after the underlying Auth email is replaced by a verified recovery email.';
comment on table public.account_recovery_channels is
  'Server-only account recovery destinations. SMS is deliberately disabled until phone ownership verification is available.';

commit;

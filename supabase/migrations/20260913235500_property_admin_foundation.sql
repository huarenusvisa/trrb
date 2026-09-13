-- Unified Tang Ren Daily property administration foundation.
create extension if not exists pgcrypto;
create table if not exists public.property_brokers (
 id uuid primary key default gen_random_uuid(), legal_name text not null, license_number text, state text not null default 'NY',
 contact_email text, contact_phone text, status text not null default 'pending' check (status in ('pending','verified','rejected','suspended')),
 review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.property_agents (
 id uuid primary key default gen_random_uuid(), source_user_id text, display_name text not null, email text, phone text, license_number text,
 license_state text not null default 'NY', broker_id uuid references public.property_brokers(id),
 status text not null default 'pending' check (status in ('unclaimed','pending','verified','rejected','suspended')),
 review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.property_listings (
 id uuid primary key default gen_random_uuid(), source_listing_id text, source_user_id text, agent_id uuid references public.property_agents(id),
 broker_id uuid references public.property_brokers(id), title text not null, address text not null, neighborhood text not null,
 listing_type text not null check (listing_type in ('sale','rent','commercial')), property_type text not null,
 price numeric(14,2) not null check (price > 0), bedrooms numeric(5,1), bathrooms numeric(5,1), square_feet integer, description text,
 submitter_name text, submitter_email text, authorization_confirmed boolean not null default false,
 status text not null default 'draft' check (status in ('draft','pending','needs_evidence','approved','published','rejected','withdrawn')),
 review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.property_claims (
 id uuid primary key default gen_random_uuid(), source_user_id text, claimant_name text not null, claimant_email text, claimant_phone text,
 agent_id uuid references public.property_agents(id), listing_id uuid references public.property_listings(id), relationship text not null,
 status text not null default 'pending' check (status in ('pending','needs_evidence','approved','rejected','cancelled')),
 review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.property_leads (
 id uuid primary key default gen_random_uuid(), source_user_id text, listing_id uuid references public.property_listings(id),
 assigned_agent_id uuid references public.property_agents(id), contact_name text, contact_email text, contact_phone text, message text not null,
 status text not null default 'new' check (status in ('new','assigned','contacted','closed','spam')),
 assigned_by uuid references auth.users(id), assigned_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.property_files (
 id uuid primary key default gen_random_uuid(), entity_type text not null check (entity_type in ('listing','agent','broker','claim')),
 entity_id uuid not null, category text not null check (category in ('photo','ownership','authorization','license','broker_proof','identity','other')),
 storage_path text not null unique, original_name text not null, mime_type text not null,
 size_bytes integer not null check (size_bytes > 0 and size_bytes <= 12582912), uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.property_admin_audit (
 id bigint generated always as identity primary key, actor_user_id uuid not null references auth.users(id), actor_email text,
 action text not null, entity_type text not null, entity_id text not null, detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists property_listings_status_created_idx on public.property_listings(status,created_at desc);
create index if not exists property_agents_status_created_idx on public.property_agents(status,created_at desc);
create index if not exists property_claims_status_created_idx on public.property_claims(status,created_at desc);
create index if not exists property_leads_assignee_status_idx on public.property_leads(assigned_agent_id,status,created_at desc);
create index if not exists property_files_entity_idx on public.property_files(entity_type,entity_id,created_at desc);
create index if not exists property_audit_entity_idx on public.property_admin_audit(entity_type,entity_id,created_at desc);
alter table public.property_brokers enable row level security;
alter table public.property_agents enable row level security;
alter table public.property_listings enable row level security;
alter table public.property_claims enable row level security;
alter table public.property_leads enable row level security;
alter table public.property_files enable row level security;
alter table public.property_admin_audit enable row level security;
revoke all on public.property_brokers,public.property_agents,public.property_listings,public.property_claims,public.property_leads,public.property_files,public.property_admin_audit from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-private','property-private',false,12582912,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

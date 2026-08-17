#!/usr/bin/env python3
from pathlib import Path
import re
import sys

migration = Path('supabase/migrations/20260817051000_jobs_r1_node1_foundation.sql')
identity = Path('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql')

errors = []
if not migration.exists():
    errors.append('missing JOBS-R1-N1 migration')
if not identity.exists():
    errors.append('missing unified identity migration')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

sql = migration.read_text(encoding='utf-8')
identity_sql = identity.read_text(encoding='utf-8')

checks = {
    'reuse unified profiles': 'references public.profiles(id)' in sql and 'create table if not exists public.profiles' in identity_sql,
    'separate product roles': 'create table if not exists public.job_user_roles' in sql and "active_role text check (active_role in ('employer','job_seeker'))" in sql,
    'job table': 'create table if not exists public.job_postings' in sql,
    'seeker table': 'create table if not exists public.job_seeker_listings' in sql,
    'US-only jobs': "country_code text not null default 'US' check (country_code='US')" in sql,
    'US-only RLS': sql.count("country_code='US'") >= 5,
    'job lifecycle': "('draft','recruiting','filled','paused','delisted','deleted')" in sql,
    'seeker lifecycle': "('draft','seeking','found','paused','delisted','deleted')" in sql,
    'soft-delete timestamps': sql.count('deleted_at timestamptz') >= 2,
    'stable UUID ids': len(re.findall(r'id uuid primary key default gen_random_uuid\(\)', sql)) >= 2,
    'RLS enabled': all(f'alter table public.{t} enable row level security;' in sql for t in ('job_user_roles','job_postings','job_seeker_listings')),
    'owner-bound writes': 'auth.uid()=employer_user_id' in sql and 'auth.uid()=user_id' in sql,
    'normalized geo hierarchy': all(x in sql for x in ('state_code text','city text','county_or_borough text','neighborhood text','latitude double precision','longitude double precision')),
    'no sensitive identity fields': not re.search(r'\b(ssn|social_security|a_number|alien_number|bank_account|routing_number|passport_number)\b', sql, re.I),
    'admin role untouched': 'alter table public.profiles' not in sql and 'profiles.role' not in sql,
}

for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
    if not ok:
        errors.append(name)

if errors:
    print(f'JOBS-R1-N1: FAIL ({len(errors)} checks failed)')
    sys.exit(1)
print('JOBS-R1-N1: PASS')

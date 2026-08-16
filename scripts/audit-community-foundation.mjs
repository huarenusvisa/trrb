import fs from 'node:fs';

const foundation = fs.readFileSync('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql', 'utf8');
const deletion = fs.readFileSync('supabase/migrations/20260816120500_trrb_account_deletion_foundation.sql', 'utf8');
const guard = fs.readFileSync('supabase/migrations/20260816121000_trrb_profile_field_guard.sql', 'utf8');
const doc = fs.readFileSync('docs/TRRB-UNIFIED-IDENTITY-AND-COMMUNITY-V1.md', 'utf8');

const requiredTables = [
  'profiles',
  'comments',
  'comment_likes',
  'comment_reports',
  'favorites',
  'reading_history',
  'notification_preferences',
  'user_blocks',
  'moderation_actions'
];

const userRefChecks = [
  'user_id uuid not null references public.profiles(id)',
  'reporter_user_id uuid not null references public.profiles(id)',
  'blocker_user_id uuid not null references public.profiles(id)',
  'blocked_user_id uuid not null references public.profiles(id)'
];

const checks = [
  ['all core tables', requiredTables.every((t) => foundation.includes(`public.${t}`))],
  ['profiles anchored to auth.users', foundation.includes('id uuid primary key references auth.users(id) on delete cascade')],
  ['community rows use unified profile identity', userRefChecks.every((needle) => foundation.includes(needle))],
  ['auth user trigger creates profile', foundation.includes('on_auth_user_created_trrb') && foundation.includes('auth.users') && foundation.includes('handle_new_trrb_user()')],
  ['random nickname function exists', foundation.includes('random_trrb_name()')],
  ['random avatar function exists', foundation.includes('random_trrb_avatar_key()') && foundation.includes('avatar_')],
  ['profile customization flags exist', foundation.includes('is_custom_name') && foundation.includes('is_custom_avatar')],
  ['comment replies use self reference', foundation.includes('parent_id uuid references public.comments')],
  ['comment governance states exist', ['published', 'pending', 'hidden', 'deleted'].every((x) => foundation.includes(`'${x}'`))],
  ['RLS enabled on all core tables', requiredTables.every((t) => foundation.includes(`alter table public.${t} enable row level security`))],
  ['owner-row profile update boundary exists', foundation.includes('profiles owner update') && foundation.includes('auth.uid()=id')],
  ['server-managed profile fields guarded', guard.includes('guard_profile_server_fields') && guard.includes('new.role := old.role') && guard.includes('new.status := old.status')],
  ['account deletion requests are user-bound', deletion.includes('account_deletion_requests') && deletion.includes('user_id uuid not null references public.profiles(id)') && deletion.includes('auth.uid() = user_id')],
  ['docs require shared identity', doc.includes('网站、iOS、Android共用一套Supabase Auth')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}

if (failed) {
  console.error(`COMMUNITY FOUNDATION: FAIL (${failed}/${checks.length})`);
  process.exit(1);
}

console.log(`COMMUNITY FOUNDATION: PASS (${checks.length}/${checks.length})`);
console.log('APP BATCH 1 NODE 1: PASS');

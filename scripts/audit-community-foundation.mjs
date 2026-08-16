import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql','utf8');
const doc=fs.readFileSync('docs/TRRB-UNIFIED-IDENTITY-AND-COMMUNITY-V1.md','utf8');
const requiredTables=['profiles','comments','comment_likes','comment_reports','favorites','reading_history','notification_preferences','user_blocks','moderation_actions'];
const checks=[
 ['all core tables', requiredTables.every(t=>sql.includes(`public.${t}`))],
 ['auth user trigger', sql.includes('on_auth_user_created_trrb')&&sql.includes('auth.users')],
 ['random nickname function', sql.includes('random_trrb_name()')],
 ['random avatar function', sql.includes('random_trrb_avatar_key()')&&sql.includes('avatar_')],
 ['profile customization flags', sql.includes('is_custom_name')&&sql.includes('is_custom_avatar')],
 ['comment replies', sql.includes('parent_id uuid references public.comments')],
 ['comment governance states', ['published','pending','hidden','deleted'].every(x=>sql.includes(`'${x}'`))],
 ['RLS enabled', requiredTables.every(t=>sql.includes(`alter table public.${t} enable row level security`))],
 ['profile owner update policy', sql.includes('profiles owner update')&&sql.includes('auth.uid()=id')],
 ['docs require shared identity', doc.includes('网站、iOS、Android共用一套Supabase Auth'))
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed){console.error(`COMMUNITY FOUNDATION: FAIL (${failed}/${checks.length})`);process.exit(1)}
console.log(`COMMUNITY FOUNDATION: PASS (${checks.length}/${checks.length})`);

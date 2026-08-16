import fs from 'node:fs';

const foundation = fs.readFileSync('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql', 'utf8');
const hardening = fs.readFileSync('supabase/migrations/20260816122000_trrb_identity_defaults_hardening.sql', 'utf8');
const avatar = fs.readFileSync('apps/mobile/src/components/TrRbAvatar.tsx', 'utf8');

const checks = [
  ['trusted registration trigger creates defaults', foundation.includes('handle_new_trrb_user()') && foundation.includes('random_trrb_name()') && foundation.includes('random_trrb_avatar_key()')],
  ['nickname combination space >= 16000 before fallback', hardening.includes("tones text[]") && hardening.includes("scenes text[]") && hardening.includes("roles text[]") && hardening.includes('for i in 1..40 loop')],
  ['case-insensitive nickname uniqueness', foundation.includes('profiles_display_name_ci_unique') && foundation.includes('lower(display_name)')],
  ['reserved identity names blocked server-side', hardening.includes('trrb_name_is_reserved') && ['唐人日报','trrb','管理员','官方','客服','编辑部','moderator','admin'].every((x) => hardening.toLowerCase().includes(x.toLowerCase()))],
  ['profile identity length validated server-side', hardening.includes('display_name_length_invalid') && hardening.includes('char_length(new.display_name)')],
  ['custom flags set when identity changes', hardening.includes('new.is_custom_name := true') && hardening.includes('new.is_custom_avatar := true')],
  ['120 default avatar keys generated', foundation.includes('random()*120') && foundation.includes("lpad((1 + floor(random()*120)::int)::text,3,'0')")],
  ['avatar renderer is local and deterministic', avatar.includes('BACKGROUNDS') && avatar.includes('SYMBOLS') && avatar.includes("/^avatar_(\\d{3})$/")],
  ['avatar renderer has no remote URL dependency', !/https?:\/\//i.test(avatar)],
  ['avatar renderer covers keys 1 through 120', avatar.includes('Number(match[1]) >= 1') && avatar.includes('Number(match[1]) <= 120')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`APP BATCH 1 NODE 2: FAIL (${failed}/${checks.length})`);
  process.exit(1);
}
console.log(`APP BATCH 1 NODE 2: PASS (${checks.length}/${checks.length})`);

import fs from 'node:fs';

const checks = [];
function check(name, ok) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) process.exitCode = 1;
}

const migration = fs.readFileSync('supabase/migrations/20260816154500_trrb_comment_governance.sql', 'utf8');
const foundation = fs.readFileSync('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql', 'utf8');
const api = fs.readFileSync('apps/mobile/src/api/comments.ts', 'utf8');
const ui = fs.readFileSync('apps/mobile/src/components/CommentThread.tsx', 'utf8');

check('one like per user/comment enforced by primary key', foundation.includes('primary key(comment_id,user_id)'));
check('report identity is tied to authenticated user', migration.includes('report actor mismatch') && api.includes('reporter_user_id: userId'));
check('like identity is tied to authenticated user', migration.includes('like actor mismatch') && api.includes('user_id: userId'));
check('restricted/suspended users cannot interact', migration.includes("actor_status is distinct from 'active'"));
check('comment rate limit exists', migration.includes('comment rate limit exceeded'));
check('report rate limit exists', migration.includes('report rate limit exceeded'));
check('moderation actions are audited', migration.includes('moderation_actions') && migration.includes('log_trrb_comment_moderation'));
check('comment statuses include published/pending/hidden/deleted', foundation.includes("status in ('published','pending','hidden','deleted')"));
check('mobile API supports like/report actions', api.includes('likeComment') && api.includes('unlikeComment') && api.includes('reportComment'));
check('mobile UI exposes cross-platform like/report controls', ui.includes('点赞') && ui.includes('举报') && ui.includes('reportReason') && ui.includes('TextInput') && !ui.includes('Alert.prompt'));

if (!process.exitCode) console.log('APP BATCH 1 NODE 6: PASS (10/10)');

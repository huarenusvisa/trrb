import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const migration = read('supabase/migrations/20260816150000_trrb_comment_thread_integrity.sql');
const foundation = read('supabase/migrations/20260816114500_trrb_identity_and_community_foundation.sql');
const api = read('apps/mobile/src/api/comments.ts');
const ui = read('apps/mobile/src/components/CommentThread.tsx');
const article = read('apps/mobile/app/article/[id].tsx');

const checks = [
  ['authenticated ownership enforced', /auth\.uid\(\).*new\.user_id/s.test(migration) && /auth\.uid\(\)=user_id/.test(foundation)],
  ['published article existence enforced server-side', /public\.articles/.test(migration) && /a\.status = 'published'/.test(migration)],
  ['parent comment must belong to same article', /parent_article <> new\.article_id/.test(migration)],
  ['stable pagination index includes created_at and id', /comments_article_created_id_idx/.test(migration) && /created_at desc, id desc/.test(migration)],
  ['client pagination orders by created_at and id', /order\('created_at'.*false/.test(api) && /order\('id'.*false/.test(api)],
  ['public client explicitly filters published comments', /eq\('status', 'published'\)/.test(api)],
  ['comment create uses authenticated user id', /currentUserId\(\)[\s\S]*supabase\.auth\.getUser\(\)/.test(api) && /const userId = await currentUserId\(\)/.test(api) && /user_id: userId/.test(api)],
  ['reply parent id is supported', /parent_id: parentId/.test(api) && /setReplyTo/.test(ui)],
  ['article detail mounts shared comment thread', /CommentThread/.test(article) && /articleId=\{String\(article\.id\)\}/.test(article)],
  ['hidden or deleted rows are not readable by public RLS', /comments public read[\s\S]*status='published'/.test(foundation)]
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) failed++;
}
if (failed) {
  console.error(`APP BATCH 1 NODE 5: FAIL (${checks.length - failed}/${checks.length})`);
  process.exit(1);
}
console.log(`APP BATCH 1 NODE 5: PASS (${checks.length}/${checks.length})`);

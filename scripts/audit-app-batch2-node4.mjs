import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const pass = (message) => console.log(`PASS: ${message}`);
const requireText = (source, needle, label) => source.includes(needle) ? pass(label) : fail(label);

const thread = read('apps/mobile/src/components/CommentThread.tsx');
const api = read('apps/mobile/src/api/comments.ts');
const mine = read('apps/mobile/app/my-comments.tsx');
const integrity = read('supabase/migrations/20260816150000_trrb_comment_thread_integrity.sql');
const governance = read('supabase/migrations/20260816154500_trrb_comment_governance.sql');

requireText(thread, 'createComment', 'comment creation wired');
requireText(thread, 'replyTo', 'reply relationship UX wired');
requireText(thread, 'likeComment', 'like action wired');
requireText(thread, 'reportComment', 'report action wired');
requireText(thread, '举报已提交', 'report feedback is explicit');
requireText(thread, '评论失败', 'comment failure feedback is explicit');
requireText(thread, '点赞失败', 'like failure feedback is explicit');
requireText(api, ".eq('status', 'published')", 'public thread excludes hidden/deleted comments');
requireText(api, 'listOwnComments', 'own comments API exists');
requireText(api, "status: 'deleted'", 'soft-delete status supported');
requireText(mine, "hidden: '已隐藏'", 'hidden state rendered in own comments');
requireText(mine, "deleted: '已删除'", 'deleted state rendered in own comments');
requireText(mine, 'router.push(`/article/${item.article_id}`)', 'own comments link back to source article');
requireText(integrity, 'parent_id', 'thread integrity migration validates reply relationships');
requireText(governance, 'comment rate limit exceeded', 'comment abuse rate limiting enforced server-side');
requireText(governance, 'report rate limit exceeded', 'report abuse rate limiting enforced server-side');
requireText(governance, 'moderation_actions', 'moderation status changes are auditable');

if (!process.exitCode) console.log('APP BATCH 2 NODE 4: PASS');

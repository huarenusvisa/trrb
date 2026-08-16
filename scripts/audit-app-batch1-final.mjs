import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Final gate reruns nodes 1-9 from current main before declaring 10/10.
const audits = [
  ['1 TRRB统一用户数据库与身份架构','scripts/audit-community-foundation.mjs'],
  ['2 随机昵称与默认头像生成机制','scripts/audit-app-batch1-node2.mjs'],
  ['3 iOS/Android统一注册、登录与会话管理','scripts/audit-app-batch1-node3.mjs'],
  ['4 用户个人资料与账号设置','scripts/audit-app-batch1-node4.mjs'],
  ['5 新闻评论、回复与楼层关系','scripts/audit-app-batch1-node5.mjs'],
  ['6 评论点赞、举报、审核与社区治理','scripts/audit-app-batch1-node6.mjs'],
  ['7 收藏与阅读历史云端同步','scripts/audit-app-batch1-node7.mjs'],
  ['8 统一后台“用户与社区”管理中心','scripts/audit-app-batch1-node8.mjs'],
  ['9 账户注销、数据删除与隐私闭环','scripts/audit-app-batch1-node9.mjs']
];

let failed = 0;
for (const [name, script] of audits) {
  try {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
    process.stdout.write(out);
    console.log(`NODE PASS: ${name}`);
  } catch (error) {
    failed++;
    process.stdout.write(error.stdout || '');
    process.stderr.write(error.stderr || '');
    console.error(`NODE FAIL: ${name}`);
  }
}

const publicFiles = [
  'apps/mobile/app/auth.tsx','apps/mobile/app/profile-settings.tsx','apps/mobile/app/delete-account.tsx',
  'apps/mobile/src/auth/supabase.ts','apps/mobile/src/api/comments.ts','apps/mobile/src/storage/librarySync.ts',
  'admin/index.html','admin/admin.js','admin/community-center.js'
].filter(fs.existsSync);
const publicText = publicFiles.map((p)=>fs.readFileSync(p,'utf8')).join('\n');
const finalChecks = [
  ['no service-role secret in mobile/admin', !/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(publicText)],
  ['single existing admin console', fs.existsSync('admin/community-center.js') && !fs.existsSync('community-admin/index.html')],
  ['trusted moderation function', fs.existsSync('netlify/functions/community-admin.js')],
  ['trusted deletion function', fs.existsSync('netlify/functions/delete-account.js')],
  ['iOS/Android shared Expo app', fs.existsSync('apps/mobile/app.json') && fs.existsSync('apps/mobile/eas.json')],
  ['public deletion instructions', fs.existsSync('delete-account.html')]
];
for (const [name, ok] of finalChecks) { console.log(`${ok?'PASS':'FAIL'}: FINAL ${name}`); if(!ok) failed++; }

if (failed) {
  console.error(`APP BATCH 1 FINAL: FAIL (${failed} failures)`);
  process.exit(1);
}
console.log('NODE PASS: 10 APP第一批生产总验收');
console.log('APP BATCH 1: 10/10 PASS');

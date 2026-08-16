import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const index = read('admin/index.html');
const ui = read('admin/community-center.js');
const fn = read('netlify/functions/community-admin.js');
const shared = read('netlify/functions/_shared/supabase-admin.js');

const checks = [
  ['existing /admin integration', index.includes('data-page="community"') && index.includes('id="community-page"') && index.includes('./community-center.js')],
  ['user management UI', index.includes('community-users-body') && ui.includes('set_user_status')],
  ['comment moderation UI', index.includes('community-comments-body') && ui.includes('set_comment_status')],
  ['report center UI', index.includes('community-reports-body') && ui.includes('set_report_status')],
  ['trusted Netlify endpoint', ui.includes('/.netlify/functions/community-admin') && !ui.includes("from('profiles').update") && !ui.includes("from('comments').update")],
  ['server-side staff auth', fn.includes("authenticateStaff(event, ['owner','admin','moderator'])") && shared.includes('authenticateStaff')],
  ['owner/admin user boundary', fn.includes("['owner','admin'].includes(admin.role)")],
  ['moderator supported without editor escalation', fn.includes("['owner','admin','moderator']") && !fn.includes("'editor'"))],
  ['audited critical writes', fn.includes("rest('moderation_actions'") && fn.includes('actor_user_id') && fn.includes('community admin center')],
  ['service role remains server side', shared.includes('SUPABASE_SERVICE_ROLE_KEY') && !index.includes('SUPABASE_SERVICE_ROLE_KEY') && !ui.includes('SUPABASE_SERVICE_ROLE_KEY')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`APP BATCH 1 NODE 8: FAIL (${failed} checks)`);
  process.exit(1);
}
console.log('APP BATCH 1 NODE 8: PASS');

import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const foundation=read('supabase/migrations/20260816120500_trrb_account_deletion_foundation.sql');
const audit=read('supabase/migrations/20260816210500_trrb_account_deletion_audit.sql');
const fn=read('netlify/functions/delete-account.js');
const screen=read('apps/mobile/app/delete-account.tsx');
const settings=read('apps/mobile/app/profile-settings.tsx');
const web=read('delete-account.html');
const checks=[
 ['request table + RLS',foundation.includes('account_deletion_requests')&&foundation.includes('enable row level security')],
 ['trusted auth deletion',fn.includes('/auth/v1/admin/users/')&&fn.includes('SUPABASE_SERVICE_ROLE_KEY')===false&&fn.includes('SERVICE_KEY')],
 ['authenticated confirmation',fn.includes("body.confirm !== 'DELETE'")&&fn.includes('/auth/v1/user')],
 ['minimal completion audit',audit.includes('account_deletion_audit')&&audit.includes('No client policies')&&fn.includes("rest('account_deletion_audit'")],
 ['in-app delete entry',settings.includes("router.push('/delete-account')")&&screen.includes('永久删除账户')&&screen.includes("confirm.trim() !== 'DELETE'")],
 ['external web path',web.includes('删除唐人日报账户')&&web.includes('无法使用 App 时')],
 ['store-facing deletion explanation',web.includes('删除范围')&&web.includes('保留范围')],
 ['no service secret in clients',!screen.includes('SERVICE_ROLE')&&!settings.includes('SERVICE_ROLE')&&!web.includes('SERVICE_ROLE')]
];
let failed=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${n}`);if(!ok)failed++;}
if(failed){console.error(`APP BATCH 1 NODE 9: FAIL (${failed} checks)`);process.exit(1);}console.log('APP BATCH 1 NODE 9: PASS');

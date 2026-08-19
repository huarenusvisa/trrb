import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd();
const FUNCTIONS=path.join(ROOT,'netlify/functions');
const failures=[];
const warnings=[];
const fail=(m)=>failures.push(m);

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else if(/\.js$/i.test(entry.name)&&!entry.name.includes('.test.'))out.push(full);
  }
  return out;
}

const files=walk(FUNCTIONS);
const hardcodedOwner='4c491ee3-a9f0-42c9-9bee-1abb52b20b01';
for(const full of files){
  const rel=path.relative(ROOT,full).replaceAll('\\','/');
  const src=fs.readFileSync(full,'utf8');
  if(src.includes(hardcodedOwner))fail(`${rel}: hardcoded owner UID is forbidden`);
  if(/TRRB_OWNER_UID\s*\|\|\s*["'`][^"'`]+["'`]/.test(src))fail(`${rel}: owner UID must not have a hardcoded fallback`);
  if(/TRRB_OWNER_EMAIL\s*\|\|\s*["'`][^"'`]+["'`]/.test(src))fail(`${rel}: owner email must not have a hardcoded fallback`);
  if(/\[\s*["']owner["']\s*,\s*["']admin["']\s*\]/.test(src))fail(`${rel}: obsolete owner/admin role pair; production roles are owner/editor/viewer`);
  if(rel!=='netlify/functions/_shared/supabase-admin.js' && /admin_users/.test(src) && /(?:ilike|email\s*:)/i.test(src)){
    fail(`${rel}: duplicated email-based admin lookup detected; use shared UID authorization`);
  }
  const parsed=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
  if(parsed.status!==0)fail(`${rel}: JavaScript syntax error: ${(parsed.stderr||parsed.stdout||'').trim().slice(0,300)}`);
}

const critical={
  'netlify/functions/admin-articles.js':/authenticateAdmin|authenticateStaff/,
  'netlify/functions/admin-push.js':/authenticateStaff/,
  'netlify/functions/community-admin.js':/authenticateStaff/,
  'netlify/functions/generate-cover.js':/authenticateStaff/,
  'netlify/functions/ice-review-v2.js':/authenticateStaff/,
  'netlify/functions/ice-review-list-v3.js':/authenticateAdmin|authenticateStaff/,
  'netlify/functions/ice-review-actions-v4.js':/authenticateStaff/,
  'netlify/functions/ice-report-editor.js':/authenticateStaff/,
  'netlify/functions/ice-report-integrated.js':/authenticateStaff/,
  'netlify/functions/ice-admin-maintenance-v3.js':/authenticateStaff/
};
for(const [rel,pattern] of Object.entries(critical)){
  const full=path.join(ROOT,rel);
  if(!fs.existsSync(full)){fail(`${rel}: critical handler missing`);continue;}
  const src=fs.readFileSync(full,'utf8');
  if(!pattern.test(src))fail(`${rel}: critical service-role handler is not bound to shared staff authorization`);
}

const router=fs.readFileSync(path.join(ROOT,'netlify/functions/ice-review.js'),'utf8');
for(const token of ['./ice-review-list-v3','./ice-review-v2','./ice-review-actions-v4']){
  if(!router.includes(token))fail(`ice-review.js: hardened router missing ${token}`);
}
if(/SUPABASE_SERVICE_ROLE_KEY|admin_users|approvalEligibility/.test(router)){
  fail('ice-review.js: main route must remain a thin router and must not reintroduce duplicated auth/eligibility gates');
}

const shared=fs.readFileSync(path.join(ROOT,'netlify/functions/_shared/supabase-admin.js'),'utf8');
if(!/user_id:\s*`eq\.\$\{user\.id\}`/.test(shared))fail('shared staff auth is not bound to auth user_id');
if(/email:\s*`ilike\./.test(shared)||/\.ilike\(\s*["']email/.test(shared))fail('shared staff auth reintroduced email fallback');
if(!shared.includes('["owner", "editor"]'))fail('shared admin role set is not owner/editor');

// The legacy monolithic browser admin still contains presentation-side owner
// constants. Server authorization no longer trusts them; keep this visible as
// technical debt until the large UI file is safely modularized.
const browserAdmin=fs.readFileSync(path.join(ROOT,'admin/admin.js'),'utf8');
if(browserAdmin.includes(hardcodedOwner))warnings.push('admin/admin.js still exposes a presentation-only legacy owner UID; server-side authorization ignores it');

const report={generatedAt:new Date().toISOString(),filesScanned:files.length,failures,warnings};
fs.writeFileSync('admin-auth-regression-audit.json',JSON.stringify(report,null,2)+'\n');
for(const warning of warnings)console.log(`WARN: ${warning}`);
if(failures.length){for(const item of failures)console.error(`FAIL: ${item}`);process.exit(1);}
console.log(`PASS: staff authorization regression audit (${files.length} function files; warnings=${warnings.length})`);

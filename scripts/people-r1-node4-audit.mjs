import fs from 'node:fs';
const spec=fs.readFileSync('docs/PEOPLE-01-US-CHINESE-BIOGRAPHICAL-ARCHIVE.md','utf8');
const sql=fs.readFileSync('supabase/migrations/20260817050600_people_r1_n4_creation.sql','utf8');
const foundation=fs.readFileSync('supabase/migrations/20260817001500_people_r1_foundation.sql','utf8');
const checks=[
 ['spec N4',/创建人物：本人、亲友、网友、编辑部均可创建/.test(spec)],
 ['four creator types',/self','family_friend','netizen','editorial/.test(sql)],
 ['auth required',/authentication required/.test(sql)],
 ['editorial role guard',/editorial creation requires editor role/.test(sql)],
 ['creation starts unverified',/'unverified', 'review'/.test(sql)],
 ['creator relationship recorded',/creator_relationship_label/.test(sql)&&/people_creation_submissions/.test(sql)],
 ['creation verification separated',/verification_status text not null default 'unverified'/.test(foundation)&&/submission_status/.test(sql)],
 ['no public write policy',/Creation\/review writes are intentionally not opened/.test(foundation)],
 ['bounded biography input',/left\(coalesce\(p_biography,''\), 30000\)/.test(sql)]
];
let failed=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(!ok)failed++;}
if(failed){console.error(`PEOPLE-R1-N4 FAIL ${failed}/${checks.length}`);process.exit(1)}
console.log('PEOPLE-R1-N4 PASS');

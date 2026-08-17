import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const audits=[
  'scripts/audit-people-r1-node1.mjs',
  'scripts/people-r1-node2-audit.mjs',
  'scripts/people-r1-node3-audit.mjs',
  'scripts/people-r1-node4-audit.mjs',
  'scripts/people-r1-node5-audit.mjs',
  'scripts/people-r1-node6-audit.mjs',
  'scripts/people-r1-node7-audit.mjs',
  'scripts/people-r1-node8-audit.mjs',
  'scripts/people-r1-node9-audit.mjs'
];
for (const audit of audits){
  must(fs.existsSync(audit),`missing prior audit ${audit}`);
  const r=spawnSync(process.execPath,[audit],{stdio:'inherit'});
  must(r.status===0,`${audit} failed during N10 serial revalidation`);
}

const status=fs.readFileSync('docs/PEOPLE-R1-CURRENT-STATUS.md','utf8');
for(let i=1;i<=9;i++) must(status.includes(`PEOPLE-R1-N${i} — PASS`),`N${i} is not registered PASS before N10`);
must(status.includes('PEOPLE-R1-N10 — RUNNING'),'N10 must be RUNNING during total acceptance');

for(const file of ['people/index.html','people/detail.html','people/detail.js','topic-config.js','apps/mobile/app/people.tsx','apps/mobile/app/(tabs)/index.tsx','netlify/functions/public-people.js']) must(fs.existsSync(file),`missing production surface ${file}`);

const mobile=fs.readFileSync('apps/mobile/app/people.tsx','utf8');
must(mobile.includes('public-people'),'APP must use the governed public people feed');
must(mobile.includes('美国华人人物志'),'APP people product title missing');
must(mobile.includes('verification_status'),'APP must expose verification state');
must(mobile.includes('人物ID'),'APP must expose permanent person ID for disambiguation');
const mobileHome=fs.readFileSync('apps/mobile/app/(tabs)/index.tsx','utf8');
must(mobileHome.includes("router.push('/people')"),'APP people archive is not discoverable from the mobile home');

const publicApi=fs.readFileSync('netlify/functions/public-people.js','utf8');
must(publicApi.includes("publication_status:'eq.published'"),'public API must only return published people');
must(publicApi.includes("source:'people'"),'public API must use the single people data source');
for(const forbidden of ['creator_user_id','requester_user_id','people_record_versions','people_moderation_cases','reviewer_user_id','private_reference','A-Number','SSN']) must(!publicApi.includes(forbidden),`public people feed exposes forbidden field/surface ${forbidden}`);

const landing=fs.readFileSync('people/index.html','utf8');
must(/<title[\s>]/i.test(landing),'people landing page needs an SEO title');
must(/name=["']description["']/i.test(landing),'people landing page needs an SEO description');
const topic=fs.readFileSync('topic-config.js','utf8');
must(topic.includes('美国华人人物志') && topic.includes('/people/'),'Topic entry must keep routing to the independent people product');

console.log('PEOPLE-R1-N10 PASS: N1-N9 were serially revalidated; Web, APP, search, SEO, privacy, evidence governance and review surfaces remain aligned.');
console.log('PEOPLE-R1: 10/10 PASS');

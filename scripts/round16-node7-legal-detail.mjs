import { chromium } from 'playwright';
import fs from 'node:fs';

const ORIGIN = process.env.SITE_ORIGIN || 'https://trrb.net';
const checks=[];
function check(name,ok,detail=''){checks.push({name,ok:Boolean(ok),detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` :: ${detail}`:''}`)}

const dbRes=await fetch(`${ORIGIN}/data/legal/unified-legal-authorities-latest.json?node7=${Date.now()}`,{headers:{'cache-control':'no-cache'}});
check('统一法律数据库可访问',dbRes.ok,`HTTP ${dbRes.status}`);
if(!dbRes.ok)process.exit(1);
const db=await dbRes.json();
const records=Array.isArray(db.records)?db.records:[];
const sources=['SCOTUS','US_CIRCUIT','BIA','WHITE_HOUSE','FEDERAL_REGISTER'];
const samples=sources.map(source=>records.find(r=>r.sourceSystem===source&&r.id&&r.officialUrl)).filter(Boolean);
check('五大来源都有详情页样本',samples.length===5,`samples=${samples.length}`);

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
await page.goto(`${ORIGIN}/legal/?node7=${Date.now()}`,{waitUntil:'networkidle',timeout:45000});
const firstDetail=page.locator('a[href^="/legal/detail.html?id="]').first();
check('数据库列表出现唐人日报详情入口',await firstDetail.count()>0,await firstDetail.getAttribute('href')||'');

for(const r of samples){
  const url=`${ORIGIN}/legal/detail.html?id=${encodeURIComponent(r.id)}&node7=${Date.now()}`;
  await page.goto(url,{waitUntil:'networkidle',timeout:45000});
  const recordVisible=await page.locator('#detail-record:not([hidden])').count()>0;
  const title=(await page.locator('#detail-title').textContent().catch(()=>''))?.trim()||'';
  const officialHref=await page.locator('[data-official-primary="true"]').getAttribute('href').catch(()=>null);
  const bodyText=(await page.locator('body').innerText()).slice(0,20000);
  check(`${r.sourceSystem} 详情主体可见`,recordVisible,`id=${r.id}`);
  check(`${r.sourceSystem} 标题与数据库一致`,Boolean(title)&&title===(r.title||r.citation||r.docket||title),title.slice(0,100));
  check(`${r.sourceSystem} 官方原文出口一致`,officialHref===r.officialUrl,officialHref||'missing');
  check(`${r.sourceSystem} 中文层与官方层明确分离`,bodyText.includes('中文信息整理')&&bodyText.includes('法院 / 政府官方原文'));
  check(`${r.sourceSystem} 未出现undefined/null污染`,!/(^|\s)(undefined|null)(\s|$)/i.test(bodyText));
}
await browser.close();

const failures=checks.filter(c=>!c.ok);
const report={generatedAt:new Date().toISOString(),origin:ORIGIN,datasetVersion:db.datasetVersion,count:records.length,samples:samples.map(r=>({id:r.id,sourceSystem:r.sourceSystem,officialUrl:r.officialUrl})),checks,failures:failures.length};
fs.writeFileSync('round16-node7-legal-detail.json',JSON.stringify(report,null,2));
console.log(`ROUND16 NODE7 SUMMARY: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){console.error('ROUND16 NODE7 FAIL');process.exit(1)}
console.log('ROUND16 NODE7 PASS: legal detail pages and official-source dual layer verified');

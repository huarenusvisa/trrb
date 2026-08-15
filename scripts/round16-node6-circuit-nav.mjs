import fs from 'node:fs';
import { chromium } from 'playwright';

const origin=process.env.SITE_ORIGIN||'https://trrb.net';
const registry=JSON.parse(fs.readFileSync('data/legal/circuit-source-registry.json','utf8'));
const db=JSON.parse(fs.readFileSync('data/legal/unified-legal-authorities-latest.json','utf8'));
const courts=registry.courts||[];
if(courts.length!==13) throw new Error(`Expected 13 circuit courts, found ${courts.length}`);
const circuitRecords=(db.records||[]).filter(r=>r.sourceSystem==='US_CIRCUIT');
for(const court of courts){
  const count=circuitRecords.filter(r=>r.issuingBody===court.name).length;
  if(count<1) throw new Error(`No US_CIRCUIT records for ${court.name}`);
}

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  const response=await page.goto(`${origin}/legal/?source=US_CIRCUIT`,{waitUntil:'networkidle',timeout:90000});
  if(!response||!response.ok()) throw new Error(`Legal hub HTTP ${response?.status()}`);
  await page.waitForSelector('#legal-list .legal-card',{timeout:30000});
  const buttons=page.locator('[data-circuit-body]');
  if(await buttons.count()!==13) throw new Error(`Production circuit button count ${await buttons.count()}`);
  const navVisible=await page.locator('#circuit-nav').evaluate(el=>getComputedStyle(el).display!=='none');
  if(!navVisible) throw new Error('Circuit secondary navigation is not visible for US_CIRCUIT source');

  for(const court of courts){
    const button=page.locator(`[data-circuit-body="${court.name.replaceAll('"','\\"')}"]`);
    if(await button.count()!==1) throw new Error(`Missing circuit button: ${court.name}`);
    await button.click();
    await page.waitForTimeout(120);
    const url=new URL(page.url());
    if(url.searchParams.get('source')!=='US_CIRCUIT') throw new Error(`Source state lost for ${court.name}`);
    if(url.searchParams.get('body')!==court.name) throw new Error(`Body state mismatch for ${court.name}`);
    const selected=await page.locator('#legal-body').inputValue();
    if(selected!==court.name) throw new Error(`Body select mismatch for ${court.name}`);
    const cardBodies=await page.locator('#legal-list .legal-card .meta span:first-child').allTextContents();
    if(cardBodies.length<1||cardBodies.some(v=>v.trim()!==court.name)) throw new Error(`Independent filter leaked records for ${court.name}`);
    if(!(await button.evaluate(el=>el.classList.contains('active')))) throw new Error(`Active state missing for ${court.name}`);
  }

  const tenth=courts.find(c=>c.id==='ca10');
  const deep=`${origin}/legal/?source=US_CIRCUIT&body=${encodeURIComponent(tenth.name)}`;
  await page.goto(deep,{waitUntil:'networkidle',timeout:90000});
  await page.waitForSelector('#legal-list .legal-card',{timeout:30000});
  if((await page.locator('#legal-body').inputValue())!==tenth.name) throw new Error('Deep-link reload did not preserve Tenth Circuit body state');
  console.log('ROUND 16 NODE 6: PASS');
  console.log(`Verified ${courts.length} circuit buttons and ${circuitRecords.length} US_CIRCUIT records.`);
}finally{
  await browser.close();
}

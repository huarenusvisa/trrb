import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/community-browser/node_modules/playwright/index.mjs');
const origin='https://trrb.net';
const guideUser='8e5569ee-86bf-4fc1-94a3-497d2657efb0',guideId='588963ac-59bf-4f1c-bbf8-19e5743e3a77';
const photoUser='07c2de9e-6231-4c97-9f7b-646aebb28cb2',photoId='b023205e-d832-4212-b175-1f2eca30a057';
const deadline=Date.now()+8*60_000;
let ready=false;
while(Date.now()<deadline){
  try{
    const r=await fetch(origin+'/user/?id='+guideUser+'&verify='+Date.now(),{signal:AbortSignal.timeout(20_000),cache:'no-store'});
    if(r.ok&&(await r.text()).includes('/assets/social-cards.js?v=20260926-social-2')){ready=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,15_000));
}
assert.ok(ready,'New public profile assets did not reach production during this acceptance run');
mkdirSync('artifacts/community-production',{recursive:true});
const browser=await chromium.launch({headless:true});
const report={checked_at:new Date().toISOString(),version:'20260926-social-2',database_writes:false,checks:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const api=await page.request.get(origin+'/.netlify/functions/community-api?post_id='+guideId);
  assert.ok(api.ok());
  const payload=await api.json(),post=payload.posts?.find(p=>p.id===guideId);
  assert.ok(post&&post.status==='published');
  await page.goto(origin+'/user/?id='+guideUser,{waitUntil:'networkidle'});
  const card=page.locator('.note-card[data-post-id="'+guideId+'"]');
  await card.waitFor({timeout:30_000});
  assert.ok((await page.locator('#post-count').innerText()).includes('作品'));
  await page.screenshot({path:'artifacts/community-production/guide-author-home.png',fullPage:true});
  await card.locator('.note-cover').click();
  await page.locator('#post-dialog[open] .detail-body').waitFor({timeout:30_000});
  const displayed=await page.locator('#post-detail .detail-body').innerText();
  assert.equal(displayed.trim(),post.content.trim(),'Displayed guide body must match the saved published body exactly');
  report.guide={id:guideId,body_characters:post.content.length,exact_body_match:true};
  report.checks.push('reported community guide visible on author homepage and complete after click');
  await page.screenshot({path:'artifacts/community-production/guide-open-complete.png',fullPage:true});
  await page.goto(origin+'/user/?id='+photoUser+'&post='+photoId,{waitUntil:'networkidle'});
  await page.locator('#post-detail-dialog[open] .detail-copy').waitFor({timeout:30_000});
  await page.waitForFunction(()=>document.querySelector('#profile-avatar img')?.naturalWidth>0,{},{timeout:30_000});
  assert.equal(await page.locator('#publish-dynamic').isVisible(),false);
  report.checks.push('real uploaded avatar loads and profile dynamic deep link opens full content');
  await page.screenshot({path:'artifacts/community-production/photo-post-open.png',fullPage:true});
  await page.goto(origin+'/user/center/',{waitUntil:'networkidle'});
  await page.getByText('请先登录，个人中心只展示你自己的作品和本地草稿。').waitFor({timeout:30_000});
  assert.equal(await page.locator('.note-card').count(),0);
  report.checks.push('signed-out personal center shows login only, not another author private management');
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/community/',{waitUntil:'networkidle'});
  await page.locator('.note-card').first().waitFor({timeout:30_000});
  assert.equal(await page.locator('#post-feed').evaluate(el=>getComputedStyle(el).columnCount),'2');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  report.checks.push('production mobile discovery has two columns and no horizontal overflow');
  await page.screenshot({path:'artifacts/community-production/discovery-mobile.png',fullPage:true});
  report.passed=true;
  console.log(JSON.stringify({event:'community-production-acceptance',...report}));
}finally{
  writeFileSync('artifacts/community-production/result.json',JSON.stringify(report,null,2));
  await browser.close();
}

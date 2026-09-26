import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/community-browser/node_modules/playwright/index.mjs');
const origin='https://trrb.net',deadline=Date.now()+7*60000;
let ready=false;
while(Date.now()<deadline){try{const r=await fetch(origin+'/community/?qa='+Date.now(),{signal:AbortSignal.timeout(15000)});if(r.ok&&(await r.text()).includes('community-composer.js?v=20260926-simple-media-1')){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,10000));}
assert.ok(ready,'Simple community composer has not reached production');
const response=await fetch(origin+'/.netlify/functions/community-api?limit=1');assert.ok(response.ok());const data=await response.json();assert.equal(data.media_policy.video_max_bytes,12582912);
const browser=await chromium.launch({headless:true});mkdirSync('artifacts/simple-community-live',{recursive:true});const checks=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.goto(origin+'/community/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.TrrbCommunityComposer&&window.TrrbCommunityMediaPolicy));
  assert.equal(await page.locator('#composer-form select').count(),1);
  assert.equal(await page.locator('#post-title,#post-label,#structured-fields,#privacy-confirm').count(),0);
  // Render the shipped dialog without signing into, uploading to or publishing on any account.
  await page.locator('#composer-dialog').evaluate(d=>d.showModal());
  await page.locator('#post-content').fill('验收文字：不提交、不上传。');
  await page.locator('#community-video').setInputFiles({name:'oversize.mp4',mimeType:'video/mp4',buffer:Buffer.alloc(12582913)});
  await page.getByText('视频不能超过 12 MB，请压缩后重新选择').waitFor();
  assert.equal(await page.locator('.compose-media-preview').count(),0);
  assert.equal(await page.locator('#post-content').inputValue(),'验收文字：不提交、不上传。');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`artifacts/simple-community-live/${width>760?'PC':'Mobile'}-simple-publish.png`,fullPage:true});
  checks.push({width,only_board_selector:true,oversize_rejected_locally:true,body_preserved:true});await page.close();
 }
 console.log(JSON.stringify({event:'simple-community-production-acceptance',checked_at:new Date().toISOString(),passed:true,checks,server_video_max_bytes:data.media_policy.video_max_bytes,production_writes:0}));
 writeFileSync('artifacts/simple-community-live/result.json',JSON.stringify({passed:true,checks,production_writes:0},null,2));
}finally{await browser.close();}

import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import('/tmp/community-browser/node_modules/playwright/index.mjs');
const origin='https://trrb.net',version='20260926-detail-1';
const user='07c2de9e-6231-4c97-9f7b-646aebb28cb2',post='b023205e-d832-4212-b175-1f2eca30a057';
const url=origin+'/user/?id='+user+'&post='+post;
let ready=false;
for(const end=Date.now()+7*60_000;Date.now()<end;){
  try{const r=await fetch(url+'&verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(r.ok&&(await r.text()).includes('/assets/social-detail.js?v='+version)){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.ok(ready,'New detail assets have not reached production');
mkdirSync('artifacts/social-detail-live',{recursive:true});
const browser=await chromium.launch({headless:true});
const report={version,checked_at:new Date().toISOString(),read_only:true,checks:[]};
try{
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}}),page=await desktop.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('dialog[open] .detail-layout').waitFor({timeout:45000});
  const gallery=await page.locator('.detail-gallery').boundingBox(),side=await page.locator('.detail-content-panel').boundingBox(),author=await page.locator('.detail-author-header').boundingBox();
  assert.ok(side.x>=gallery.x+gallery.width-1);assert.ok(Math.abs(author.y-gallery.y)<2);
  assert.equal(await page.locator('.detail-slide').count(),3);assert.equal(await page.locator('.detail-slide:visible').count(),1);
  assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
  await page.waitForFunction(()=>document.querySelector('.detail-author-header img')?.naturalWidth>0);
  assert.equal(await page.locator('.detail-author-header .note-author').getAttribute('href'),'/user/?id='+user);
  assert.equal(await page.locator('.detail-follow').isVisible(),true);
  const body=await page.locator('.detail-copy').innerText();assert.ok(body.trim().length>30);
  await page.locator('.detail-next').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'2 / 3');
  await page.locator('.detail-prev').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
  await page.screenshot({path:'artifacts/social-detail-live/PC-left-image-right-content.png'});
  await page.mouse.click(5,5);await page.waitForFunction(()=>!document.querySelector('#post-detail-dialog').open);
  assert.ok(!new URL(page.url()).searchParams.has('post'));
  report.checks.push('PC: real three-photo post, left carousel, right author/body, original public profile link and backdrop close');
  await desktop.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await mobile.newPage();
  await phone.goto(url,{waitUntil:'domcontentloaded'});await phone.locator('dialog[open] .detail-layout').waitFor({timeout:45000});
  const g=await phone.locator('.detail-gallery').boundingBox(),p=await phone.locator('.detail-content-panel').boundingBox();
  assert.ok(p.y>=g.y+g.height-1);assert.ok(Math.abs(p.x-g.x)<2&&Math.abs(p.width-g.width)<2,'Mobile must be one column');
  const cdp=await mobile.newCDPSession(phone),start=g.x+g.width*.8,end=g.x+g.width*.2,y=g.y+g.height*.45;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/6,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.waitForFunction(()=>document.querySelector('.detail-gallery').dataset.activeIndex==='1');
  assert.equal(await phone.locator('.detail-copy').innerText(),body);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await phone.screenshot({path:'artifacts/social-detail-live/Mobile-image-above-body.png'});
  await phone.locator('.modal-close').first().click();await phone.waitForFunction(()=>!document.querySelector('#post-detail-dialog').open);
  report.checks.push('Mobile: actual touch swipe changes picture, same full body below image, no side-by-side layout or horizontal overflow');
  await mobile.close();report.passed=true;
  console.log(JSON.stringify({event:'social-detail-production-accepted',...report}));
}finally{writeFileSync('artifacts/social-detail-live/result.json',JSON.stringify(report,null,2));await browser.close();}

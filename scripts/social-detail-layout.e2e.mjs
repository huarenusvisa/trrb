import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tmp/community-browser/node_modules/playwright/index.mjs');
const css=['user/profile.css','assets/social-discovery.css','assets/social-detail.css'].map(p=>readFileSync(p,'utf8')).join('\n');
const script=readFileSync('assets/social-detail.js','utf8');
const browser=await chromium.launch({headless:true});
const checks=[];
mkdirSync('artifacts/social-detail',{recursive:true});
function fixtureHTML(){return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body class="social-discovery user-public"><button id="open">打开作品</button><button id="follow-source">关注</button><dialog id="post-detail-dialog" class="modal wide"><section class="modal-card"><button class="modal-close" type="button" aria-label="关闭">×</button><div id="post-detail-content"></div></section></dialog></body></html>';}
async function make(width=1440,height=960,touch=false){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const page=await context.newPage();
  await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:fixtureHTML()}));
  await page.goto('https://fixture.test/user/?id=test&post=photo-test');
  await page.addScriptTag({content:script});
  await page.evaluate(()=>{
    const dialog=document.querySelector('dialog'),content=document.querySelector('#post-detail-content'),source=document.querySelector('#follow-source');
    window.closedCount=0;window.followCount=0;window.pauseCount=0;
    HTMLMediaElement.prototype.pause=function(){window.pauseCount++;};
    const poster=i=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${i===2?1100:700}" height="${i===2?700:1000}"><rect width="100%" height="100%" fill="${['#e8e3dc','#d9e7e3','#e1e4f0'][i]}"/><circle cx="350" cy="340" r="155" fill="#b4c7c4"/><text x="350" y="580" text-anchor="middle" font-size="42" fill="#24384a">图片 ${i+1} / 3</text></svg>`);
    window.renderFixture=(kind='photos')=>{
      TrrbDetail.prepare(dialog,'photo-test');
      if(!dialog.open)dialog.showModal();
      content.innerHTML='<div class="author-line"><a class="note-author" href="/user/?id=public-author"><span class="social-avatar"><img src="'+poster(0)+'" alt=""/></span><span>作者昵称 · 公开主页</span></a></div>'+
        (kind==='text'?'':kind==='video'?'<video class="detail-media" controls playsinline></video>':[0,1,2].map(i=>'<img class="detail-media" src="'+poster(i)+'" alt="图片 '+(i+1)+'"/>').join(''))+
        '<div class="detail-copy">中秋节，请喝杯奶茶。\n正文在图片下方或右侧，依屏幕宽度切换。\n'+('这里是原始正文，不应被图片挡住。\n').repeat(35)+'</div><div class="detail-comment-head"><h3>评论</h3></div><div id="dynamic-comment-results"><p>测试评论内容</p></div><form class="detail-comment-form"><textarea name="content" placeholder="写下评论"></textarea><button type="submit">发表评论</button><div class="form-message"></div></form>';
      content.querySelector('form').addEventListener('submit',e=>e.preventDefault());
      TrrbDetail.enhance(dialog,{postId:'photo-test',followSource:source,onFollow:async()=>{window.followCount++;source.textContent='已关注';},publishedAt:'2026-09-26T17:50:00Z'});
    };
    TrrbDetail.bind(dialog,()=>window.closedCount++);
    document.querySelector('#open').addEventListener('click',()=>window.renderFixture());
    dialog.querySelector('.modal-close').addEventListener('click',()=>dialog.close());
  });
  await page.locator('#open').click();await page.locator('.detail-slide:not([hidden])').waitFor();
  return {page,context};
}
const box=async(page,selector)=>page.locator(selector).boundingBox();
try{
  {
    const {page,context}=await make();
    const gallery=await box(page,'.detail-gallery'),panel=await box(page,'.detail-content-panel'),header=await box(page,'.detail-author-header'),dlg=await box(page,'dialog');
    assert.ok(panel.x>=gallery.x+gallery.width-1,'Desktop body must be on the right, not below pictures');
    assert.ok(header.x>=panel.x&&Math.abs(header.y-gallery.y)<2,'Author must be at upper right');
    assert.ok(dlg.width>=1000,'Desktop viewer must not remain a narrow vertical popup');
    assert.equal(await page.locator('.detail-slide:visible').count(),1);
    assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
    assert.equal(await page.locator('.detail-slide:visible img').evaluate(el=>getComputedStyle(el).objectFit),'contain');
    await page.locator('.detail-next').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'2 / 3');
    await page.locator('[data-detail-slide-to="2"]').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'3 / 3');
    await page.locator('.detail-next').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
    await page.locator('.detail-prev').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'3 / 3');
    await page.locator('.detail-gallery').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
    await page.locator('textarea').fill('输入评论');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
    await page.locator('.detail-follow').click();assert.equal(await page.locator('.detail-follow').innerText(),'已关注');assert.equal(await page.evaluate(()=>window.followCount),1);
    assert.match(await page.locator('.detail-author-header a').getAttribute('href'),/^\/user\/\?id=public-author$/);
    await page.locator('.detail-content-scroll').evaluate(el=>el.scrollTop=350);
    assert.ok(Math.abs((await box(page,'.detail-author-header')).y-header.y)<1,'Author header must not scroll away');
    assert.ok(Math.abs((await box(page,'.detail-gallery')).y-gallery.y)<1,'Text scroll must not move PC pictures');
    await page.locator('.detail-next').click();await page.evaluate(()=>window.renderFixture());
    assert.equal(await page.locator('.detail-gallery-counter').innerText(),'2 / 3','Comment refresh retains current picture');
    await page.waitForFunction(()=>document.querySelector('.detail-content-scroll').scrollTop>300);
    await page.locator('.detail-content-scroll').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:'artifacts/social-detail/pc-left-image-right-content.png'});
    // Inner content interactions must not close the dialog.
    await page.locator('.detail-slide:visible img').click();assert.equal(await page.locator('dialog[open]').count(),1);
    await page.mouse.move(gallery.x+50,gallery.y+50);await page.mouse.down();await page.mouse.move(5,5);await page.mouse.up();assert.equal(await page.locator('dialog[open]').count(),1,'Dragging from inside to outside does not dismiss');
    await page.mouse.click(5,5);await page.waitForFunction(()=>!document.querySelector('dialog').open);
    await page.waitForFunction(()=>!new URL(location.href).searchParams.has('post'));
    assert.ok(!new URL(page.url()).searchParams.has('post'));
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('trrb-detail-open')),false);
    await page.locator('#open').click();assert.equal(await page.locator('.detail-gallery-counter').innerText(),'1 / 3');
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog').open);
    await page.locator('#open').click();await page.locator('.modal-close').click();await page.waitForFunction(()=>!document.querySelector('dialog').open);
    checks.push('PC: split geometry, prominent fixed author/follow, containment, carousel, comment safety and three close methods');
    await context.close();
  }
  for(const width of [320,390,430,768]){
    const {page,context}=await make(width,844,true);
    const gallery=await box(page,'.detail-gallery'),panel=await box(page,'.detail-content-panel');
    assert.ok(panel.y>=gallery.y+gallery.height-1,`Mobile ${width}px: body must be below gallery`);
    assert.ok(Math.abs(panel.x-gallery.x)<2&&Math.abs(panel.width-gallery.width)<2,`Mobile ${width}px: one full-width column`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const cdp=await context.newCDPSession(page);
    const y=gallery.y+gallery.height*.45,start=gallery.x+gallery.width*.8,end=gallery.x+gallery.width*.2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/6,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelector('.detail-gallery').dataset.activeIndex==='1');
    assert.equal(await page.locator('dialog[open]').count(),1,'Swipe is not a close gesture');
    await page.locator('textarea').fill('手机评论');assert.equal(await page.locator('dialog[open]').count(),1);
    if(width===390)await page.screenshot({path:'artifacts/social-detail/mobile-swipe-image-body-below.png'});
    checks.push(`Mobile ${width}px: real touch swipe, picture above body, full-width single column, comments usable`);
    await context.close();
  }
  {
    const {page,context}=await make();await page.evaluate(()=>window.renderFixture('text'));
    assert.equal(await page.locator('.detail-gallery').count(),0);
    assert.equal(await page.locator('.detail-layout-text').count(),1);
    assert.ok((await box(page,'dialog')).width<900,'Text-only posts do not have an empty image column');
    await page.evaluate(()=>window.renderFixture('video'));
    assert.equal(await page.locator('.detail-next').count(),0);
    assert.equal(await page.locator('video').getAttribute('autoplay'),null);
    const before=await page.evaluate(()=>window.pauseCount);await page.locator('.modal-close').click();await page.waitForFunction(n=>window.pauseCount>n,before);
    checks.push('Text-only and single video supported; video pauses on close');await context.close();
  }
  console.log(JSON.stringify({event:'social-detail-layout-verified',passed:checks.length,checks}));
  writeFileSync('artifacts/social-detail/results.json',JSON.stringify({passed:checks.length,checks},null,2));
}finally{await browser.close();}

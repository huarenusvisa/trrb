import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import('/tmp/community-browser/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true});
try {
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:1000}});
    await page.setContent('<style>'+readFileSync('community/community.css','utf8')+'\n'+readFileSync('assets/social-discovery.css','utf8')+'</style><body class="social-discovery"><main class="shell"><div class="post-feed mixed-feed"><article class="note-card"><div class="note-cover" style="--note-ratio:.8"></div><div class="note-title">第一条作品</div></article><article class="note-card"><div class="note-cover note-cover-text"><div class="note-text-cover"><strong>第二条作品</strong></div></div><div class="note-title">年费指引测试</div></article></div></main></body>');
    const boxes=await page.locator('.note-card').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width})));
    assert.ok(boxes[1].x>boxes[0].x+boxes[0].width,`Cards must occupy separate columns at ${width}px, not stack in one column`);
    assert.ok(Math.abs(boxes[0].y-boxes[1].y)<2,'Both columns start together');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    console.log(JSON.stringify({event:'community-masonry-positions',viewport:width,passed:true,boxes}));
    await page.close();
  }
} finally {await browser.close();}

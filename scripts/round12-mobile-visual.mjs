#!/usr/bin/env node
import fs from 'node:fs';
import { chromium, webkit, devices } from 'playwright';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const failures = [];
const results = [];

function assert(ok, label, detail = '') {
  results.push({ok, label, detail});
  if (!ok) failures.push({label, detail});
}

async function checkViewport(browserType, name, contextOptions) {
  const browser = await browserType.launch({headless:true});
  const context = await browser.newContext({...contextOptions, locale:'zh-CN'});
  const page = await context.newPage();
  const consoleErrors = [];
  const failedResources = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('response', response => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    failedResources.push(`FAILED ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });

  async function open(path, selector = 'body') {
    const response = await page.goto(`${ORIGIN}${path}`, {waitUntil:'domcontentloaded', timeout:30000});
    await page.waitForSelector(selector, {timeout:15000});
    await page.waitForTimeout(1200);
    assert(response?.status() === 200, `${name} ${path} HTTP 200`, `status=${response?.status()}`);
    const metrics = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewport: window.innerWidth,
      title: document.title,
      text: document.body.innerText.slice(0,5000),
      brand: (() => {
        const el=document.querySelector('.brand img,.site-header img,.trump-brand,.ice-brand');
        if(!el) return null;
        const r=el.getBoundingClientRect();
        return {w:r.width,h:r.height,visible:r.width>0&&r.height>0,text:(el.textContent||'').trim().slice(0,20)};
      })(),
      navigationVisible: (() => {
        const candidates=[...document.querySelectorAll('.mobile-menu-toggle,.ice-menu,.trump-topbar nav')];
        return candidates.some(el => {
          const s=getComputedStyle(el);
          const r=el.getBoundingClientRect();
          return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
        });
      })()
    }));
    assert(metrics.bodyWidth <= metrics.viewport + 4, `${name} ${path} 无横向溢出`, `${metrics.bodyWidth}/${metrics.viewport}`);
    assert(!/文章不存在|文章已下线/.test(metrics.text), `${name} ${path} 无错误文章状态`);
    if (path !== '/listing.html?q=%E7%89%B9%E6%9C%97%E6%99%AE') {
      assert(Boolean(metrics.brand?.visible) && metrics.brand.w < 360, `${name} ${path} 品牌标识尺寸正常`, JSON.stringify(metrics.brand));
      assert(metrics.navigationVisible, `${name} ${path} 移动导航入口可见`);
    }
    return metrics;
  }

  await open('/', '#hero');
  const heroHref = await page.locator('#hero a.hero-link').first().getAttribute('href');
  assert(Boolean(heroHref) && !/article\.html\?id=/i.test(heroHref || ''), `${name} 首页Hero使用pretty URL`, heroHref || '');
  if (heroHref) {
    await page.goto(new URL(heroHref, ORIGIN).toString(), {waitUntil:'domcontentloaded', timeout:30000});
    await page.waitForSelector('#article-root h1', {timeout:15000});
    await page.waitForTimeout(600);
    const articleState = await page.evaluate(() => ({
      h1: document.querySelector('#article-root h1')?.textContent?.trim() || '',
      text: document.querySelector('#article-root')?.innerText || '',
      overflow: document.body.scrollWidth - window.innerWidth
    }));
    assert(articleState.h1.length >= 6, `${name} Hero点击后文章标题存在`, articleState.h1);
    assert(!/文章不存在|文章已下线/.test(articleState.text), `${name} Hero点击后不是错误文章`);
    assert(articleState.overflow <= 4, `${name} 文章页无横向溢出`, `overflow=${articleState.overflow}`);
  }

  await open('/important-news', '#listing-grid');
  await open('/us-crime', '#listing-grid');
  await open('/trump', 'body');
  await open('/ice', 'body');

  await page.goto(`${ORIGIN}/listing.html?q=${encodeURIComponent('特朗普')}`, {waitUntil:'domcontentloaded', timeout:30000});
  await page.waitForSelector('#listing-grid', {timeout:15000});
  await page.waitForFunction(() => document.querySelectorAll('#listing-grid .archive-card').length > 0 || /没有找到相关文章/.test(document.body.innerText), null, {timeout:15000});
  const search = await page.evaluate(() => ({
    count: document.querySelectorAll('#listing-grid .archive-card').length,
    hrefs: [...document.querySelectorAll('#listing-grid .archive-card a')].slice(0,10).map(a => a.getAttribute('href') || ''),
    text: document.querySelector('#listing-grid')?.innerText || '',
    overflow: document.body.scrollWidth - window.innerWidth
  }));
  assert(search.count > 0, `${name} 中文搜索返回结果`, `count=${search.count}`);
  assert(search.hrefs.every(h => h && !/article\.html\?id=/i.test(h)), `${name} 搜索结果全部使用pretty URL`, search.hrefs.join(' | '));
  assert(search.overflow <= 4, `${name} 搜索页无横向溢出`, `overflow=${search.overflow}`);

  await page.screenshot({path:`round12-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.png`, fullPage:true});
  const relevantFailed = [...new Set(failedResources.filter(x => !/favicon|ResizeObserver/i.test(x)))];
  const relevantConsole = consoleErrors.filter(x => !/favicon|ResizeObserver/i.test(x));
  assert(relevantFailed.length === 0, `${name} 无404/失败资源请求`, relevantFailed.slice(0,12).join(' | '));
  assert(relevantConsole.length === 0, `${name} 无关键console error`, relevantConsole.slice(0,8).join(' | '));
  await browser.close();
}

await checkViewport(webkit, 'iPhone-WebKit', devices['iPhone 13']);
await checkViewport(chromium, 'Android-Chromium', {
  viewport:{width:412,height:915}, screen:{width:412,height:915}, deviceScaleFactor:2.625,
  isMobile:true, hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
});

const report = {generated_at:new Date().toISOString(), origin:ORIGIN, failures, results};
fs.writeFileSync('round12-mobile-visual.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Round 12 mobile visual: failures=${failures.length}`);
if (failures.length) {
  failures.forEach(x => console.error(`${x.label} — ${x.detail}`));
  process.exit(1);
}
console.log('ROUND12 MOBILE VISUAL PASS: iPhone WebKit + Android Chromium');

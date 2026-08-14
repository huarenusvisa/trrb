#!/usr/bin/env node
import fs from 'node:fs';
import { chromium, webkit, devices } from 'playwright';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const failures = [];
const results = [];
const diagnostics = [];

function assert(ok, label, detail = '') {
  results.push({ ok, label, detail });
  if (!ok) failures.push({ label, detail });
}

function recordDiagnostic(group, payload) {
  diagnostics.push({ group, ...payload });
}

function compactError(error) {
  return String(error?.message || error || '').replace(/\s+/g, ' ').slice(0, 500);
}

async function checkViewport(browserType, name, contextOptions) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ ...contextOptions, locale: 'zh-CN' });
  const page = await context.newPage();
  let consoleErrors = [];
  let failedResources = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    failedResources.push(`FAILED ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });

  function resetNetworkDiagnostics() {
    consoleErrors = [];
    failedResources = [];
  }

  function finishNetworkDiagnostics(label) {
    const relevantFailed = [...new Set(failedResources.filter(x => !/favicon|ResizeObserver/i.test(x)))];
    const relevantConsole = [...new Set(consoleErrors.filter(x => !/favicon|ResizeObserver/i.test(x)))];
    assert(relevantFailed.length === 0, `${name} ${label} 无404/失败资源请求`, relevantFailed.slice(0, 20).join(' | '));
    assert(relevantConsole.length === 0, `${name} ${label} 无关键console error`, relevantConsole.slice(0, 12).join(' | '));
    recordDiagnostic(`${name}:${label}:network`, {
      failedResources: relevantFailed.slice(0, 50),
      consoleErrors: relevantConsole.slice(0, 30)
    });
  }

  async function safeStep(label, fn) {
    try {
      return await fn();
    } catch (error) {
      const detail = compactError(error);
      assert(false, `${name} ${label} 执行完成`, detail);
      recordDiagnostic(`${name}:${label}:exception`, { error: detail, url: page.url() });
      return null;
    }
  }

  async function open(path, selector = 'body') {
    return safeStep(`${path} 页面检查`, async () => {
      resetNetworkDiagnostics();
      const requestedUrl = `${ORIGIN}${path}`;
      const response = await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const status = response?.status() ?? null;
      let selectorVisible = true;
      try {
        await page.waitForSelector(selector, { timeout: 12000 });
      } catch {
        selectorVisible = false;
      }
      await page.waitForTimeout(700);
      const metrics = await page.evaluate(() => ({
        bodyWidth: document.body.scrollWidth,
        viewport: window.innerWidth,
        title: document.title,
        text: document.body.innerText.slice(0, 5000),
        finalUrl: location.href,
        brand: (() => {
          const el = document.querySelector('.brand img,.site-header img,.trump-brand,.ice-brand');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, visible: r.width > 0 && r.height > 0, text: (el.textContent || '').trim().slice(0, 20) };
        })(),
        navigationVisible: (() => {
          const candidates = [...document.querySelectorAll('.mobile-menu-toggle,.ice-menu,.trump-topbar nav')];
          return candidates.some(el => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          });
        })()
      }));
      assert(status === 200, `${name} ${path} HTTP 200`, `status=${status}; final=${metrics.finalUrl}`);
      assert(selectorVisible, `${name} ${path} 关键元素存在`, selector);
      assert(metrics.bodyWidth <= metrics.viewport + 4, `${name} ${path} 无横向溢出`, `${metrics.bodyWidth}/${metrics.viewport}`);
      assert(!/文章不存在|文章已下线/.test(metrics.text), `${name} ${path} 无错误文章状态`);
      if (path !== '/listing.html?q=%E7%89%B9%E6%9C%97%E6%99%AE') {
        assert(Boolean(metrics.brand?.visible) && metrics.brand.w < 360, `${name} ${path} 品牌标识尺寸正常`, JSON.stringify(metrics.brand));
        assert(metrics.navigationVisible, `${name} ${path} 移动导航入口可见`);
      }
      recordDiagnostic(`${name}:${path}:page`, { status, selector, selectorVisible, ...metrics });
      finishNetworkDiagnostics(path);
      return metrics;
    });
  }

  await open('/', '#hero');

  await safeStep('Hero文章链路', async () => {
    resetNetworkDiagnostics();
    const heroHref = await page.locator('#hero a.hero-link').first().getAttribute('href');
    assert(Boolean(heroHref) && !/article\.html\?id=/i.test(heroHref || ''), `${name} 首页Hero使用pretty URL`, heroHref || '');
    if (!heroHref) {
      recordDiagnostic(`${name}:hero`, { heroHref: null, reason: 'missing hero href' });
      return;
    }

    const requestedArticleUrl = new URL(heroHref, ORIGIN).toString();
    const response = await page.goto(requestedArticleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response?.status() ?? null;
    const headers = response?.headers() || {};
    let h1Visible = true;
    try {
      await page.waitForSelector('#article-root h1', { timeout: 12000 });
    } catch {
      h1Visible = false;
    }
    await page.waitForTimeout(600);
    const articleState = await page.evaluate(() => ({
      finalUrl: location.href,
      title: document.title,
      prerendered: document.documentElement.getAttribute('data-prerendered') || document.body.getAttribute('data-prerendered') || document.querySelector('[data-prerendered="true"]')?.getAttribute('data-prerendered') || '',
      articleRootExists: Boolean(document.querySelector('#article-root')),
      h1: document.querySelector('#article-root h1')?.textContent?.trim() || '',
      rootText: document.querySelector('#article-root')?.innerText?.slice(0, 2500) || '',
      bodyText: document.body.innerText.slice(0, 3500),
      overflow: document.body.scrollWidth - window.innerWidth,
      loadingText: document.querySelector('.article-loading')?.textContent?.trim() || ''
    }));

    const heroDetail = JSON.stringify({
      heroHref,
      requestedArticleUrl,
      status,
      finalUrl: articleState.finalUrl,
      h1Visible,
      h1: articleState.h1,
      articleRootExists: articleState.articleRootExists,
      prerendered: articleState.prerendered,
      xTrRBPrerender: headers['x-trrb-prerender'] || '',
      loadingText: articleState.loadingText
    });
    assert(status === 200, `${name} Hero文章 HTTP 200`, heroDetail);
    assert(h1Visible && articleState.h1.length >= 6, `${name} Hero点击后文章标题存在`, heroDetail);
    assert(!/文章不存在|文章已下线/.test(`${articleState.rootText}\n${articleState.bodyText}`), `${name} Hero点击后不是错误文章`, heroDetail);
    assert(articleState.overflow <= 4, `${name} 文章页无横向溢出`, `overflow=${articleState.overflow}; ${heroDetail}`);
    recordDiagnostic(`${name}:hero`, {
      heroHref,
      requestedArticleUrl,
      status,
      headers: { 'x-trrb-prerender': headers['x-trrb-prerender'] || '', 'cache-control': headers['cache-control'] || '' },
      ...articleState,
      h1Visible
    });
    finishNetworkDiagnostics('Hero文章');
  });

  await open('/important-news', '#listing-grid');
  await open('/us-crime', '#listing-grid');
  await open('/trump', 'body');
  await open('/ice', 'body');

  await safeStep('中文搜索', async () => {
    resetNetworkDiagnostics();
    const searchUrl = `${ORIGIN}/listing.html?q=${encodeURIComponent('特朗普')}`;
    const response = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let gridVisible = true;
    try {
      await page.waitForSelector('#listing-grid', { timeout: 12000 });
    } catch {
      gridVisible = false;
    }
    let settled = true;
    try {
      await page.waitForFunction(() => document.querySelectorAll('#listing-grid .archive-card').length > 0 || /没有找到相关文章/.test(document.body.innerText), null, { timeout: 12000 });
    } catch {
      settled = false;
    }
    const search = await page.evaluate(() => ({
      count: document.querySelectorAll('#listing-grid .archive-card').length,
      hrefs: [...document.querySelectorAll('#listing-grid .archive-card a')].slice(0, 10).map(a => a.getAttribute('href') || ''),
      text: document.querySelector('#listing-grid')?.innerText || '',
      overflow: document.body.scrollWidth - window.innerWidth,
      finalUrl: location.href
    }));
    assert(response?.status() === 200, `${name} 搜索页 HTTP 200`, `status=${response?.status()}; final=${search.finalUrl}`);
    assert(gridVisible && settled, `${name} 搜索页完成渲染`, `gridVisible=${gridVisible}; settled=${settled}`);
    assert(search.count > 0, `${name} 中文搜索返回结果`, `count=${search.count}`);
    assert(search.hrefs.every(h => h && !/article\.html\?id=/i.test(h)), `${name} 搜索结果全部使用pretty URL`, search.hrefs.join(' | '));
    assert(search.overflow <= 4, `${name} 搜索页无横向溢出`, `overflow=${search.overflow}`);
    recordDiagnostic(`${name}:search`, search);
    finishNetworkDiagnostics('中文搜索');
  });

  await safeStep('保存截图', async () => {
    await page.screenshot({ path: `round12-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: true });
  });

  await browser.close();
}

async function runViewport(browserType, name, options) {
  try {
    await checkViewport(browserType, name, options);
  } catch (error) {
    const detail = compactError(error);
    assert(false, `${name} 浏览器验收主流程完成`, detail);
    recordDiagnostic(`${name}:fatal`, { error: detail });
  }
}

await runViewport(webkit, 'iPhone-WebKit', devices['iPhone 13']);
await runViewport(chromium, 'Android-Chromium', {
  viewport: { width: 412, height: 915 },
  screen: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
});

const report = {
  generated_at: new Date().toISOString(),
  origin: ORIGIN,
  failures,
  results,
  diagnostics,
  summary: {
    failures: failures.length,
    checks: results.length,
    passed: results.filter(x => x.ok).length
  }
};
fs.writeFileSync('round12-mobile-visual.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Round 12 mobile visual: failures=${failures.length}, checks=${results.length}, passed=${report.summary.passed}`);
if (failures.length) {
  failures.forEach(x => console.error(`${x.label} — ${x.detail}`));
  process.exit(1);
}
console.log('ROUND12 MOBILE VISUAL PASS: iPhone WebKit + Android Chromium');

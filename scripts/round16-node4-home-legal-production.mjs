import fs from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = (process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/$/, '');
const EXPECTED_JS_VERSION = '20260819-seo-canonical-1';
const EXPECTED_CSS_VERSION = '20260815-r16n4';
const expectedLinks = [
  ['最高法院', '/legal/?source=SCOTUS'],
  ['巡回法院', '/legal/?source=US_CIRCUIT'],
  ['BIA裁决', '/legal/?source=BIA'],
  ['行政命令', '/legal/?source=WHITE_HOUSE'],
  ['联邦新规', '/legal/?source=FEDERAL_REGISTER']
];

const report = { origin: ORIGIN, checkedAt: new Date().toISOString(), checks: [], failures: [] };
function check(name, ok, detail = '') {
  report.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) report.failures.push({ name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const response = await page.goto(`${ORIGIN}/?r16n4=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  check('homepage HTTP 200', response?.status() === 200, `status=${response?.status()}`);
  await page.waitForSelector('#sections-grid', { timeout: 25000 });
  await page.waitForSelector('#legal-home-hub', { timeout: 25000 });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const root = document.querySelector('#sections-grid');
    const legal = document.querySelector('#legal-home-hub');
    const headings = Array.from(root?.querySelectorAll('.news-box h2') || []).map((n) => (n.textContent || '').trim());
    const links = Array.from(legal?.querySelectorAll('a') || []).map((a) => ({ text: (a.textContent || '').trim(), href: a.getAttribute('href') || '' }));
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    return {
      headings,
      legalText: (legal?.textContent || '').replace(/\s+/g, ' ').trim(),
      links,
      oldExposureCards: root?.querySelectorAll('.expose-wall-box').length || 0,
      oldExposureHeading: Array.from(root?.querySelectorAll('h2') || []).filter((n) => (n.textContent || '').trim() === '曝光墙').length,
      exposureUtilityLinks: document.querySelectorAll('a[href*="expose"]').length,
      legalHubCount: document.querySelectorAll('#legal-home-hub').length,
      resources
    };
  });

  check('legal hub appears exactly once', state.legalHubCount === 1, `count=${state.legalHubCount}`);
  check('legal hub title is visible', state.legalText.includes('美国判例与新规'), state.legalText.slice(0, 160));
  check('legal hub replaces homepage exposure card', state.oldExposureCards === 0 && state.oldExposureHeading === 0, `oldCards=${state.oldExposureCards}; oldHeading=${state.oldExposureHeading}`);
  check('exposure utility remains available elsewhere', state.exposureUtilityLinks >= 1, `links=${state.exposureUtilityLinks}`);

  const immigrationPos = state.headings.indexOf('移民美国');
  const asylumPos = state.headings.indexOf('庇护百科');
  const legalPos = state.headings.indexOf('美国判例与新规');
  check('knowledge row keeps immigration/asylum/legal order', immigrationPos >= 0 && asylumPos > immigrationPos && legalPos > asylumPos, `immigration=${immigrationPos}; asylum=${asylumPos}; legal=${legalPos}`);

  for (const [label, href] of expectedLinks) {
    const found = state.links.some((item) => item.text.includes(label) && item.href === href);
    check(`homepage legal deep link: ${label}`, found, href);
  }
  check('legal database all-entry exists', state.links.some((item) => item.href === '/legal/' && item.text.includes('查看全部判例与新规')), 'href=/legal/');

  const jsVersioned = state.resources.some((url) => url.includes(`homepage-immigration-hub.js?v=${EXPECTED_JS_VERSION}`));
  const cssVersioned = state.resources.some((url) => url.includes(`homepage-immigration-hub.css?v=${EXPECTED_CSS_VERSION}`));
  check('homepage legal JS uses expected cache-busted asset', jsVersioned, EXPECTED_JS_VERSION);
  check('homepage legal CSS uses expected cache-busted asset', cssVersioned, EXPECTED_CSS_VERSION);

  for (const [label, href] of expectedLinks) {
    const probe = await page.request.get(`${ORIGIN}${href}&r16n4=${Date.now()}`, { failOnStatusCode: false, timeout: 25000 });
    check(`legal destination reachable: ${label}`, probe.status() === 200, `status=${probe.status()}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#legal-home-hub', { timeout: 25000 });
  check('legal hub survives normal reload/cache path', await page.locator('#legal-home-hub').count() === 1, 'reload');
} finally {
  await browser.close();
}

fs.writeFileSync('round16-node4-home-legal-production.json', JSON.stringify(report, null, 2));
if (report.failures.length) {
  console.error(`ROUND16 NODE4 FAIL: failures=${report.failures.length}`);
  process.exit(1);
}
console.log(`ROUND16 NODE4 PASS: checks=${report.checks.length}; failures=0`);

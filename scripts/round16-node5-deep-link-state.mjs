import { chromium } from 'playwright';

const origin = process.env.SITE_ORIGIN || 'https://trrb.net';
const sources = ['SCOTUS','US_CIRCUIT','BIA','WHITE_HOUSE','FEDERAL_REGISTER'];
const report = { node: 5, name: '五大类深链接筛选与状态保持', origin, checkedAt: new Date().toISOString(), checks: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const source of sources) {
    const page = await browser.newPage();
    const url = `${origin}/legal/?source=${encodeURIComponent(source)}`;
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const status = response?.status() || 0;
    await page.waitForSelector('#legal-list .legal-card, #legal-list .empty', { timeout: 30000 });
    const activeTab = await page.locator(`.source-tabs button[data-source="${source}"]`).evaluate(el => el.classList.contains('active'));
    const sourceSelect = await page.locator('#legal-source').inputValue();
    const cards = page.locator('#legal-list .legal-card');
    const count = await cards.count();
    const badges = count ? await cards.locator('.legal-card-top .badge:first-child').allTextContents() : [];
    const filteredCorrectly = count > 0 && badges.every(Boolean);
    const before = new URL(page.url()).searchParams.get('source');
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('#legal-list .legal-card, #legal-list .empty', { timeout: 30000 });
    const after = new URL(page.url()).searchParams.get('source');
    const selectAfter = await page.locator('#legal-source').inputValue();
    const ok = status === 200 && activeTab && sourceSelect === source && before === source && after === source && selectAfter === source && filteredCorrectly;
    report.checks.push({ source, status, activeTab, sourceSelect, count, before, after, selectAfter, ok });
    await page.close();
  }
} finally {
  await browser.close();
}
report.pass = report.checks.length === 5 && report.checks.every(x => x.ok);
console.log(JSON.stringify(report, null, 2));
await import('node:fs').then(fs => fs.writeFileSync('round16-node5-deep-link-state.json', JSON.stringify(report, null, 2) + '\n'));
if (!report.pass) process.exit(1);
console.log('ROUND 16 NODE 5: PASS');

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Run the actual command-line audits with isolated, deterministic HTTP responses.
// No production database, requests or generated reports are touched.
async function runAudit(script, scenario, reportPath) {
  const cwd = await mkdtemp(join(tmpdir(), 'trrb-indexability-audit-'));
  const moduleUrl = new URL(script, import.meta.url).href;
  const harness = `
    const scenario = ${JSON.stringify(scenario)};
    const legacyAudit = ${JSON.stringify(script === 'legacy-search-acceptance.mjs')};
    const round14Audit = ${JSON.stringify(script === 'round14-node5-duplicate-thin-content-audit.mjs')};
    const site = 'https://trrb.net';
    const articleUrls = Array.from({ length: round14Audit ? 100 : 5 }, (_, i) => site + '/hot-headlines/short-' + i);
    function response(url, body, status = 200, headers = {}) {
      const value = new Response(body, { status, headers });
      Object.defineProperty(value, 'url', { value: String(url) });
      return value;
    }
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      if (round14Audit && url.hostname.endsWith('.supabase.co')) {
        const rows = url.pathname.endsWith('/categories')
          ? [{ id: 'hot', name: '热门头条', slug: 'hot-headlines', is_active: true }]
          : articleUrls.map((u, i) => ({ id: String(i), slug: 'short-' + i, title: '讯', content: i === 99 ? '<script>not body</script>&nbsp;' : '<p>好</p>', category_id: 'hot', category_name: '热门头条', status: 'published', visibility: 'public' }));
        return response(url, JSON.stringify(rows));
      }
      if (url.hostname === 'fixture.invalid') {
        const articles = [
          { id: 'short', title: '讯', content: '<p>好</p>', summary: '', canonical_url: site + '/hot-headlines/short' },
          { id: 'summary', title: '讯', content: '<div>&nbsp;</div>', summary: '摘要', canonical_url: site + '/hot-headlines/summary' },
          { id: 'empty', title: '讯', content: '<script>not body</script><style>not body</style><!-- not body -->&nbsp;', summary: '', canonical_url: site + '/hot-headlines/empty' }
        ];
        return response(url, JSON.stringify(url.pathname.endsWith('/articles') ? articles : []));
      }
      if (url.protocol === 'http:' || url.hostname === 'www.trrb.net') {
        return response(url, '', 301, { location: site + '/' });
      }
      if (url.pathname.endsWith('sitemap.xml')) {
        if (round14Audit) {
          const links = [...articleUrls.slice(0, -1), site + '/legal/', site + '/immigrate/center?path=study', site + '/immigrate/center?path=study&amp;topic=f1'];
          return response(url, '<urlset>' + links.map(u => '<url><loc>' + u + '</loc></url>').join('') + '</urlset>', 200, { 'x-trrb-sitemap': 'live-supabase-v5-static-authority-aligned', 'x-trrb-sitemap-immigration-knowledge': '62' });
        }
        return response(url, '<urlset>' + articleUrls.map(u => '<url><loc>' + u + '</loc></url>').join('') + '</urlset>');
      }
      if (url.pathname === '/article.html') return legacyAudit
        ? response(url, '', 301, { location: articleUrls[0] })
        : response(url, '', 404, { 'x-robots-tag': 'noindex' });
      if (articleUrls.includes(site + url.pathname)) {
        const emptyArticle = scenario === 'empty' || (round14Audit && url.pathname.endsWith('short-99'));
        const body = emptyArticle
          ? '<script>not article body</script><style>not article body</style><!-- not article body -->&nbsp;'
          : '<p>好</p>';
        const robots = round14Audit && (emptyArticle || scenario === 'short-noindex') ? 'noindex,follow' : 'index,follow';
        const html = '<title>讯</title><meta name="description" content="好"><meta name="robots" content="' + robots + '">'
          + '<link rel="canonical" href="' + url.href + '"><article data-prerendered="true"><h1>讯</h1><div class="article-body">' + body + '</div></article>'
          + '<script type="application/ld+json">{"@type":"NewsArticle"}</script>';
        return response(url, html, 200, { 'x-trrb-prerender': 'article-edge-v9' });
      }
      if (url.href === site + '/') return response(url, 'Home');
      throw new Error('Unexpected test request: ' + url);
    };
    await import(${JSON.stringify(moduleUrl)});
  `;
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', harness], {
      cwd,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, SITE_ORIGIN: 'https://trrb.net', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', LEGACY_PRIORITY_IDS: 'wp-117123' }
    });
    assert.ifError(result.error);
    const report = JSON.parse(await readFile(join(cwd, reportPath), 'utf8'));
    return { status: result.status, report, output: result.stdout + result.stderr };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

for (const [script, reportPath] of [
  ['google-indexing-acceptance.mjs', 'google-indexing-acceptance-report.json'],
  ['verify-prerender-online.mjs', 'prerender-online-report.json']
]) {
  test(`${script} accepts a one-character headline and body`, async () => {
    const result = await runAudit(script, 'short', reportPath);
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(result.report.failures, []);
  });

  test(`${script} rejects an HTML shell without visible article text`, async () => {
    const result = await runAudit(script, 'empty', reportPath);
    assert.equal(result.status, 1, result.output);
    assert.ok(result.report.failures.some(failure => failure.bad?.some(reason => /body/.test(reason))), result.output);
  });
}

test('full data audit counts short articles and summary-only articles, excluding empty HTML', async () => {
  const { status, report, output } = await runAudit('full-seo-data-audit.mjs', 'data', 'reports/full-seo-data-latest.json');
  assert.equal(status, 0, output);
  assert.equal(report.totals.articles, 3);
  assert.equal(report.totals.indexable, 2);
  assert.deepEqual(report.issues.empty_body, ['empty']);
  assert.deepEqual(report.issues.missing_title, []);
  assert.deepEqual(report.issues.missing_description, ['empty']);
});

test('legacy restoration accepts a one-character headline and body', async () => {
  const { status, report, output } = await runAudit('legacy-search-acceptance.mjs', 'short', 'reports/legacy-search-acceptance-latest.json');
  assert.equal(status, 0, output);
  assert.deepEqual(report.failures, []);
  assert.equal(report.samples[0].body_length, 1);
});

test('legacy restoration still rejects an empty HTML shell', async () => {
  const { status, report, output } = await runAudit('legacy-search-acceptance.mjs', 'empty', 'reports/legacy-search-acceptance-latest.json');
  assert.equal(status, 1, output);
  assert.ok(report.failures.some(failure => failure.reasons?.includes('missing-body')), output);
});

test('legacy thin-content audit accepts non-ICE short news while excluding empty records', async () => {
  const { status, report, output } = await runAudit('round14-node5-duplicate-thin-content-audit.mjs', 'short', 'round14-node5-duplicate-thin-content-audit.json');
  assert.equal(status, 0, output);
  assert.equal(report.failures, 0);
  assert.equal(report.shortNonIce, 99);
  assert.equal(report.emptyArticles, 1);
});

test('legacy thin-content audit detects a regression that noindexes non-ICE short news', async () => {
  const { status, report, output } = await runAudit('round14-node5-duplicate-thin-content-audit.mjs', 'short-noindex', 'round14-node5-duplicate-thin-content-audit.json');
  assert.equal(status, 1, output);
  assert.ok(report.checks.some(check => check.label === '非ICE短讯不会仅因篇幅短被文章页 noindex' && !check.ok), output);
});

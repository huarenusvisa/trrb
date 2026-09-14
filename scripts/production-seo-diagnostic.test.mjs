import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { runProductionSeoDiagnostic } from './production-seo-diagnostic.mjs';

async function fixture(t, settings = {}) {
  const requests = [];
  let origin;
  const article = (pathname, { noindex = false, canonical = `${origin}${pathname}` } = {}) => `<!doctype html><html><head>
    <title>快讯</title><link href="${canonical}" rel="canonical">
    <meta content="一则简讯" name="description">
    ${noindex ? '<meta CONTENT="noindex,follow" NAME="robots">' : ''}
    <script type="application/ld+json">{"@type":"NewsArticle"}</script>
    </head><body><h1>快讯</h1><div class="article-body">当地部门公布了这则消息。</div></body></html>`;
  const list = Array.from({ length: 20 }, (_, i) => `/hot-headlines/listed-${i}`);
  const xml = paths => `<urlset>${paths.map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`;
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === '/sitemap.xml') {
      res.setHeader('content-type', 'application/xml');
      return res.end(xml(list));
    }
    if (pathname === '/news-sitemap.xml') {
      if (settings.brokenNewsSitemap) { res.statusCode = 503; return res.end('Unavailable'); }
      res.setHeader('content-type', 'application/xml');
      return res.end(xml([list[0]]));
    }
    if (pathname === '/') {
      const links = settings.onlyShort ? ['/hot-headlines/short'] : [list[0], '/hot-headlines/excluded', '/hot-headlines/broken', '/hot-headlines/wrong-canonical', '/hot-headlines/old-link'];
      if (settings.hangingArticle) links.unshift('/hot-headlines/hangs');
      return res.end(`<main data-seo-static-snapshot="build">${links.map(p => `<a href="${p}">${p}</a>`).join('')}</main>`);
    }
    if (pathname === '/hot-headlines') {
      res.setHeader('x-trrb-category-prerender', settings.categoryVersion || 'category-edge-v2');
      return res.end('<main data-seo-category-snapshot="edge"><a href="hot-headlines/excluded">Excluded</a><a href="/hot-headlines/short">Short report</a><a href="https://foreign.invalid/news/private">Foreign</a></main>');
    }
    if (pathname === '/article.html') {
      res.writeHead(301, { location: list[0] });
      return res.end();
    }
    if (pathname === '/hot-headlines/broken') { res.statusCode = 404; return res.end('Missing'); }
    if (pathname === '/hot-headlines/old-link') { res.writeHead(301, { location: '/hot-headlines/short' }); return res.end(); }
    if (pathname === '/hot-headlines/hangs') return; // AbortSignal must end this request.
    res.setHeader('x-trrb-prerender', 'article-edge-v3');
    return res.end(article(pathname, {
      noindex: pathname === '/hot-headlines/excluded' || (settings.sitemapNoindex && pathname === list.at(-1)),
      canonical: pathname === '/hot-headlines/wrong-canonical' ? `${origin}/` : `${origin}${pathname}`
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const options = {
    site: origin,
    hostSources: [],
    pageExpectations: [
      { url: `${origin}/`, minLinks: 1, marker: 'data-seo-static-snapshot="build"' },
      { url: `${origin}/hot-headlines`, minLinks: 1, marker: 'data-seo-category-snapshot="edge"', header: 'category-edge-v1' }
    ],
    limits: { sitemapSamples: 4, linkedSamples: 5 }
  };
  return { origin, options, requests };
}

test('discovers actual homepage/category links beyond sitemaps with explicit severity and coverage', async t => {
  const f = await fixture(t, { sitemapNoindex: true });
  const report = await runProductionSeoDiagnostic(f.options);
  const row = suffix => report.articles.find(a => a.url === `${f.origin}/hot-headlines/${suffix}`);
  assert.equal(report.coverage.sampled_articles, 9, '4 spread sitemap samples plus 5 linked samples');
  assert.equal(report.coverage.sampled_outside_inspected_sitemaps, 5);
  assert.equal(report.coverage.discovered_sitemap_articles, 20);
  assert.equal(report.coverage.completed, true);
  assert.deepEqual(row('excluded').errors, [], 'Linked noindex is not automatically an editorial mistake');
  assert.match(row('excluded').warnings.join(' '), /editorial intent requires review/);
  assert.deepEqual(row('excluded').discovered_from.map(s => s.url), [`${f.origin}/`, `${f.origin}/hot-headlines`]);
  assert.equal(row('excluded').sitemap_membership, 'absent');
  assert.ok(row('listed-19').errors.includes('sitemap-url-has-noindex'), 'Spread sampling checks the end of the sitemap too');
  assert.equal(row('listed-0').discovered_from.filter(s => s.kind === 'sitemap').length, 2);
  assert.ok(row('listed-0').discovered_from.some(s => s.kind === 'page'));
  assert.ok(row('broken').errors.some(e => e.includes('HTTP 404')));
  assert.ok(row('wrong-canonical').errors.includes('canonical-mismatch-or-missing'));
  assert.ok(row('old-link').warnings.some(w => w.includes('discovered-url-redirects')));
  assert.deepEqual(row('short').errors, [], 'A complete short report is not rejected by length');
  assert.ok(row('short').warnings.some(w => w.includes('informational-only')));
  assert.ok(!report.failures.some(failure => failure.problem?.includes('category prerender header')), 'v2 category headers remain compatible');
  assert.equal(report.coverage.legacy_sample_count, 1);
  assert.match(report.coverage.legacy_scope, /not an audit of historical GSC failures/);
  assert.ok(f.requests.every(r => r.method === 'GET'), 'The diagnostic must never submit or mutate');
  assert.ok(f.requests.length <= 25, 'The fixture exercises bounded requests only');
});

test('healthy short reports do not fail length gates and unsampled links remain visible', async t => {
  const f = await fixture(t, { onlyShort: true, categoryVersion: 'category-edge-v1' });
  const report = await runProductionSeoDiagnostic({ ...f.options, limits: { sitemapSamples: 2, linkedSamples: 1 } });
  assert.equal(report.failures.length, 0, JSON.stringify(report.failures));
  assert.equal(report.coverage.sampled_articles, 3);
  assert.equal(report.coverage.linked_articles_not_sampled, 1);
  assert.equal(report.coverage.mode, 'bounded-sample');
});

test('request and URL storage limits cannot silently produce a complete result', async t => {
  const f = await fixture(t);
  const report = await runProductionSeoDiagnostic({ ...f.options, limits: { requests: 3, sitemapUrls: 6, sitemapSamples: 2, linkedSamples: 1 } });
  assert.equal(f.requests.length, 3);
  assert.equal(report.coverage.request_count, 3);
  assert.equal(report.coverage.completed, false);
  assert.equal(report.coverage.discovered_sitemap_articles, 6);
  assert.ok(report.coverage.truncated.includes('request budget exhausted'));
  assert.ok(report.coverage.truncated.includes('sitemap URL storage limit reached'));
  assert.ok(report.failures.some(failure => failure.diagnostic === 'incomplete'));
});

test('failed sitemap retrieval marks outside-sitemap membership as unknown', async t => {
  const f = await fixture(t, { brokenNewsSitemap: true });
  const report = await runProductionSeoDiagnostic(f.options);
  assert.equal(report.coverage.sitemap_scan_complete, false);
  const excluded = report.articles.find(a => a.url.endsWith('/excluded'));
  assert.equal(excluded.sitemap_membership, 'unknown');
  assert.deepEqual(excluded.errors, []);
  assert.ok(report.failures.some(failure => typeof failure === 'string' && failure.includes('HTTP 503')));
});

test('a hanging article request times out and is recorded as a failed response', async t => {
  const f = await fixture(t, { hangingArticle: true });
  const report = await runProductionSeoDiagnostic({ ...f.options, limits: { requestTimeoutMs: 80, sitemapSamples: 1, linkedSamples: 2 } });
  const hung = report.articles.find(a => a.url.endsWith('/hangs'));
  assert.equal(hung.status, 0);
  assert.match(hung.error, /timeout|aborted/i);
  assert.ok(hung.errors.some(e => e.startsWith('HTTP 0')));
  assert.ok(report.coverage.elapsed_ms < 3000, 'A hanging response must not stall the diagnostic');
});

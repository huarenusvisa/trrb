import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import categoryPage from '../netlify/edge-functions/category-prerender.ts';
import iceCanonical, { config as iceConfig } from '../netlify/edge-functions/01-ice-route-canonical.ts';
import { hasNoindex } from './seo-live-page-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = '<html><head><title>Listing</title><meta name="robots" content="noindex"></head><body><h1 id="listing-title">Listing</h1><div class="listing-grid" id="listing-grid"></div><nav class="pagination" id="pagination" aria-label="分页"></nav></body></html>';
const context = { next: async () => new Response('fallback', { status: 404 }) };
function fixture(t, { empty = false, unavailable = false } = {}) {
  const originalDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: key => key === 'SUPABASE_URL' ? 'https://database.test' : 'fixture-key' } };
  t.after(() => { globalThis.Deno = originalDeno; });
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/categories') return Response.json([]);
    if (url.pathname === '/.netlify/functions/public-category-page') {
      if (unavailable) return new Response('unavailable', { status: 503 });
      return Response.json({ total: empty ? 0 : 1, total_pages: empty ? 0 : 1,
        articles: empty ? [] : [{ id: '1', slug: 'brief', title: '已确认的短讯', summary: '新闻事实。', category_name: '热门头条' }] });
    }
    assert.equal(url.pathname, '/listing.html');
    return new Response(template, { headers: {
      'Content-Type': 'text/html', 'X-Robots-Tag': 'noindex,follow,noarchive',
      'Content-Length': String(Buffer.byteLength(template))
    } });
  });
}

for (const method of ['GET', 'HEAD']) {
  test(`${method}: public categories do not inherit template noindex headers`, async t => {
    fixture(t);
    for (const route of ['/hot-headlines', '/us-politics', '/us-crime', '/immigration', '/ice/news']) {
      const response = await categoryPage(new Request(`https://trrb.net${route}`, { method }), context);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('x-robots-tag'), null, route);
      assert.equal(hasNoindex(html, Object.fromEntries(response.headers)), false, route);
      assert.equal(response.headers.get('content-length'), null, route);
      if (method === 'GET') {
        assert.match(html, /name="robots" content="index,follow/);
        assert.match(html, /已确认的短讯/);
        assert.ok(html.includes(`rel="canonical" href="https://trrb.net${route}"`));
      } else assert.equal(html, '');
    }
  });
}

test('empty, nonexistent and unavailable categories retain nonindexable errors', async t => {
  fixture(t, { empty: true });
  let response = await categoryPage(new Request('https://trrb.net/hot-headlines'), context);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  fixture(t);
  response = await categoryPage(new Request('https://trrb.net/hot-headlines?page=2'), context);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  fixture(t, { unavailable: true });
  response = await categoryPage(new Request('https://trrb.net/hot-headlines'), context);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
});

test('redirect finalization removes normalized ICE self-loops, including stale generated rules', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trrb-ice-redirects-'));
  try {
    writeFileSync(path.join(dir, '_redirects'), '/ice/ /ice 301!\n/ice/news/ /ice/news 301!\n/unrelated /kept 301!\n');
    execFileSync(process.execPath, [path.join(root, 'scripts/finalize-redirects.mjs'), '--redirects-only'], { cwd: dir });
    const output = readFileSync(path.join(dir, '_redirects'), 'utf8');
    assert.match(output, /^\/ice \/topic\/ice\/live-v6.html 200!$/m);
    assert.match(output, /^\/ice\/news \/listing.html\?category=\S+ 200!$/m);
    assert.doesNotMatch(output, /^\/ice(?:\/news)?\/\s/m);
    assert.match(output, /^\/topic\/ice \/ice 301!$/m);
    assert.match(output, /^\/unrelated \/kept 301!$/m);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('ICE rewrite target stays indexable and legacy routes still canonicalize', async () => {
  assert.ok(!iceConfig.path.includes('/ice'));
  assert.ok(!iceConfig.path.includes('/topic/ice/live-v6.html'));
  const html = readFileSync(path.join(root, 'topic/ice/live-v6.html'), 'utf8');
  assert.match(html, /rel="canonical" href="https:\/\/trrb.net\/ice"/);
  assert.equal(hasNoindex(html), false);
  for (const route of iceConfig.path) {
    const response = await iceCanonical(new Request(`https://trrb.net${route}`));
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), 'https://trrb.net/ice');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleIndexability } from '../netlify/shared/article-indexability.mjs';
import articlePage from '../netlify/edge-functions/article-prerender.ts';
import newsSitemap from '../netlify/edge-functions/news-sitemap-live.ts';
import liveSitemap from '../netlify/edge-functions/sitemap-live.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const article = (overrides = {}) => ({
  id: '00000000-0000-4000-8000-000000000001', title: '快讯', slug: 'short-news',
  content: '已确认的新消息。', category_id: 'cat-1', category_name: '热门头条',
  status: 'published', visibility: 'public', published_at: new Date().toISOString(),
  ...overrides
});
const categories = [{ id: 'cat-1', name: '热门头条', slug: 'hot-headlines', is_active: true }];
const template = '<!doctype html><html><head><title>唐人日报</title><meta name="robots" content="noindex"></head><body><article class="container article-page" id="article-root"></article></body></html>';

function useFixture(t, articles) {
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/categories') return Response.json(categories);
    if (url.pathname === '/rest/v1/articles') {
      // This fixture enforces the same public/published boundary as production.
      assert.equal(url.searchParams.get('status'), 'eq.published');
      assert.equal(url.searchParams.get('visibility'), 'eq.public');
      let rows = articles.filter(a => a.status === 'published' && a.visibility === 'public');
      if (url.searchParams.has('slug')) rows = rows.filter(a => `eq.${a.slug}` === url.searchParams.get('slug'));
      if (url.searchParams.has('id')) rows = rows.filter(a => `eq.${a.id}` === url.searchParams.get('id'));
      const offset = Number(url.searchParams.get('offset') || 0);
      return Response.json(rows.slice(offset, offset + Number(url.searchParams.get('limit') || 1000)));
    }
    if (url.pathname === '/article.html') return new Response(template);
    if (url.pathname === '/sitemap-static.xml') return new Response('<urlset>' + ['/', '/immigrate/', '/legal/'].map(p => `<url><loc>https://trrb.net${p}</loc></url>`).join('') + '</urlset>');
    throw new Error(`Unexpected fixture request: ${url.pathname}`);
  });
  const originalDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: name => name === 'SUPABASE_URL' ? 'https://database.test' : 'fixture-key' } };
  t.after(() => { globalThis.Deno = originalDeno; });
}
const context = { next: async () => new Response('not found', { status: 404 }) };

test('all nonempty article lengths qualify, including short titles and long reports', () => {
  for (const length of [1, 29, 79, 159, 299, 300, 20000]) {
    assert.equal(articleIndexability({ title: '讯', content: '新'.repeat(length) }).indexable, true);
  }
});

test('empty markup cannot masquerade as content; a visible summary is a valid fallback', () => {
  for (const content of ['', '  ', '<p>&nbsp;&#160;&#x200b;</p>', '<script>news</script><style>news</style><!--news-->']) {
    assert.equal(articleIndexability({ title: '快讯', content }).indexable, false);
  }
  assert.equal(articleIndexability({ title: '<b> </b>', content: '新闻' }).indexable, false);
  assert.equal(articleIndexability({ title: '快讯', content: '<p></p>', summary: '&#x65b0;&#38395;' }).body, '新闻');
});

test('public short article returns index metadata, matching canonical and readable body', async t => {
  useFixture(t, [article()]);
  const response = await articlePage(new Request('https://trrb.net/hot-headlines/short-news'), context);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(response.headers.get('x-trrb-indexability'), 'eligible');
  assert.match(html, /name="robots" content="index,follow/);
  assert.doesNotMatch(html, /name="robots" content="noindex/);
  assert.match(html, /rel="canonical" href="https:\/\/trrb.net\/hot-headlines\/short-news"/);
  assert.match(html, /<div class="article-body"><p>已确认的新消息。<\/p>/);
});

test('summary fallback is actually rendered; empty articles retain noindex', async t => {
  const rows = [article({ content: '<p></p>', summary: '短讯摘要。' })];
  useFixture(t, rows);
  let response = await articlePage(new Request('https://trrb.net/hot-headlines/short-news'), context);
  assert.match(await response.text(), /<div class="article-body"><p>短讯摘要。<\/p>/);
  rows[0].summary = '';
  response = await articlePage(new Request('https://trrb.net/hot-headlines/short-news'), context);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  assert.equal(response.headers.get('x-trrb-indexability'), 'missing-body');
});

test('public eligibility does not expose draft or private articles', async t => {
  useFixture(t, [article({ status: 'draft' }), article({ visibility: 'private' })]);
  const response = await articlePage(new Request('https://trrb.net/hot-headlines/short-news'), context);
  assert.equal(response.status, 404);
});

test('live and News sitemaps include short news but exclude empty and nonpublic records', async t => {
  useFixture(t, [article(), article({ slug: 'empty', content: '' }), article({ slug: 'private', visibility: 'private' }), article({ slug: 'draft', status: 'draft' })]);
  for (const [handler, pathname] of [[liveSitemap, '/_internal/sitemap-live.xml'], [newsSitemap, '/news-sitemap.xml']]) {
    const response = await handler(new Request(`https://trrb.net${pathname}`), context);
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(xml, /<loc>https:\/\/trrb.net\/hot-headlines\/short-news<\/loc>/);
    assert.doesNotMatch(xml, /\/hot-headlines\/(?:empty|private|draft)</);
  }
});

test('News sitemap keeps its 48-hour eligibility window', async t => {
  useFixture(t, [article({ published_at: new Date(Date.now() - 72 * 3600000).toISOString() })]);
  const response = await newsSitemap(new Request('https://trrb.net/news-sitemap.xml'), context);
  assert.doesNotMatch(await response.text(), /short-news/);
});

test('production sitemap build includes short articles and only public published records', async t => {
  useFixture(t, [article(), article({ slug: 'empty', content: '' }), article({ slug: 'private', visibility: 'private' })]);
  const working = mkdtempSync(path.join(tmpdir(), 'trrb-sitemap-test-'));
  const previousCwd = process.cwd();
  const originalEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    mkdirSync(path.join(working, 'config'));
    writeFileSync(path.join(working, 'config/immigration-knowledge.js'), readFileSync(path.join(root, 'config/immigration-knowledge.js')));
    process.chdir(working);
    process.env.SUPABASE_URL = 'https://database.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-key';
    await import(new URL('./generate-sitemaps.mjs', import.meta.url));
    for (const name of ['sitemap.xml', 'news-sitemap.xml']) {
      const xml = readFileSync(path.join(working, name), 'utf8');
      assert.match(xml, /\/hot-headlines\/short-news<\/loc>/);
      assert.doesNotMatch(xml, /\/hot-headlines\/(?:empty|private)</);
    }
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(working, { recursive: true, force: true });
  }
});


for (const unavailable of ['/rest/v1/articles','/rest/v1/categories','/article.html']) {
  test(`temporary ${unavailable} failure never becomes an article 404 or permanent noindex`,async t=>{
    useFixture(t,[article()]);
    const original=globalThis.fetch;
    t.mock.method(globalThis,'fetch',async input=>new URL(String(input)).pathname===unavailable ? new Response('temporary',{status:503}) : original(input));
    const response=await articlePage(new Request('https://trrb.net/hot-headlines/short-news'),context);
    assert.equal(response.status,503);
    assert.equal(response.headers.get('retry-after'),'120');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-robots-tag'),null);
  });
}

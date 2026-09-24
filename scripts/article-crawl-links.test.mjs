import test from 'node:test';
import assert from 'node:assert/strict';
import articlePage from '../netlify/edge-functions/article-prerender.ts';

const article = { id: '00000000-0000-4000-8000-000000000001', slug: 'current', title: '当前报道', content: '已核实的新闻正文。', category_id: 'cat', category_name: '热门头条', status: 'published', visibility: 'public', published_at: '2026-09-01', source_url: 'https://example.org/report?a=1&b=2' };
const story = { ...article, id: '00000000-0000-4000-8000-000000000002', title: '同栏目报道 <标题>', slug: 'other', canonical_url: 'https://trrb.net/hot-headlines/other' };
const template = '<html><head><title>模板</title><meta name="robots" content="noindex"></head><body><article class="container article-page" id="article-root"></article></body></html>';
function fixture(t, { source = article.source_url, outage = false } = {}) {
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: key => key === 'SUPABASE_URL' ? 'https://db.test' : 'test' } };
  t.after(() => { globalThis.Deno = previous; });
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.pathname === '/article.html') return new Response(template, { headers: { 'content-length': String(template.length), 'x-robots-tag': 'noindex' } });
    if (url.pathname === '/rest/v1/categories') return Response.json([{ slug: 'hot-headlines' }]);
    if (url.searchParams.has('slug')) return Response.json([{ ...article, source_url: source }]);
    assert.equal(url.searchParams.get('category_id'), 'eq.cat');
    for (const [key, value] of Object.entries({ status: 'eq.published', visibility: 'eq.public', hidden_at: 'is.null', archived_at: 'is.null' })) assert.equal(url.searchParams.get(key), value);
    assert.ok(options.signal);
    if (outage) throw new Error('recommendations unavailable');
    return Response.json([story, story, article,
      { ...story, id: 'new', slug: 'fresh', canonical_url: '' },
      { ...story, id: 'topic', slug: 'ice-report', topic_key: 'ice', canonical_url: '' },
      { ...story, id: 'private', visibility: 'private', canonical_url: 'https://trrb.net/hot-headlines/private' },
      { ...story, id: 'external', canonical_url: 'https://outside.test/article' },
      { ...story, id: 'future', published_at: '2099-01-01', canonical_url: 'https://trrb.net/hot-headlines/future' },
      { ...story, id: 'hidden', hidden_at: '2026-09-01', canonical_url: 'https://trrb.net/hot-headlines/hidden' }]);
  });
}
const render = () => articlePage(new Request('https://trrb.net/hot-headlines/current'), { next: () => new Response('', { status: 404 }) });
test('raw HTML contains safe source and public same-section links without JavaScript', async t => {
  fixture(t);
  const response = await render();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(html, /class="tag" href="\/hot-headlines"/);
  assert.match(html, /href="https:\/\/example.org\/report\?a=1&amp;b=2"/);
  assert.equal((html.match(/href="https:\/\/trrb.net\/hot-headlines\/other"/g) || []).length, 1);
  assert.match(html, /同栏目报道 &lt;标题&gt;/);
  assert.match(html, /href="https:\/\/trrb.net\/hot-headlines\/fresh"/);
  assert.match(html, /href="https:\/\/trrb.net\/ice\/ice-report"/);
  assert.doesNotMatch(html, /href="https:\/\/(?:outside.test|trrb.net\/hot-headlines\/(?:private|future|hidden))/);
});
test('recommendation failure leaves the article indexable and readable', async t => {
  fixture(t, { outage: true });
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /已核实的新闻正文/);
  assert.match(html, /content="index,follow/);
  assert.doesNotMatch(html, /article-section-stories/);
});
for (const source of ['javascript:alert(1)', 'https://trrb.cc/旧文章/', 'https://trrb.net/old/', 'https://user:password@example.org/', 'invalid']) {
  test(`unsafe or legacy source is not presented as a citation: ${source}`, async t => {
    fixture(t, { source });
    assert.doesNotMatch(await (await render()).text(), /class="article-source"/);
  });
}

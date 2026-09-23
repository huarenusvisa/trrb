import test from 'node:test';
import assert from 'node:assert/strict';
import xiTopic from '../netlify/edge-functions/xi-topic.ts';
const context = {next: async () => new Response('pass')};
function setup(t, count = 21, fail = false) {
  const previous = globalThis.Netlify;
  globalThis.Netlify = {env: {get: key => key === 'SUPABASE_URL' ? 'https://data.test' : 'test-key'}};
  t.after(() => { globalThis.Netlify = previous; });
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('visibility'), 'eq.public');
    assert.match(url.searchParams.get('or'), /title.ilike.\*习近平\*/);
    assert.equal(url.searchParams.get('limit'), '21');
    if (fail) return new Response('unavailable', {status: 500});
    return Response.json(Array.from({length:count}, (_,i) => ({id:String(i),slug:`story-${i}`,title:'习近平相关新闻 <测试>',summary:'报道摘要',category_name:'中国热门头条',published_at:'2026-09-15T10:00:00Z'})));
  });
}
test('topic renders crawlable published news with canonical pagination and escaped content', async t => {
  setup(t);
  const res = await xiTopic(new Request('https://trrb.net/xijinping'), context);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.equal((body.match(/<h1>/g)||[]).length, 1);
  assert.equal((body.match(/<article /g)||[]).length, 20);
  assert.match(body, /href="\/hot-headlines\/story-0"/);
  assert.match(body, /rel="canonical" href="https:\/\/trrb.net\/xijinping"/);
  assert.match(body, /rel="next" href="\/xijinping\?page=2"/);
  assert.match(body, /&lt;测试&gt;/);
  assert.match(body, /"@type":"CollectionPage"/);
});
test('last page has own canonical and previous link, without fabricated next page', async t => {
  setup(t, 2);
  const body = await (await xiTopic(new Request('https://trrb.net/xijinping?page=6'), context)).text();
  assert.match(body, /rel="canonical" href="https:\/\/trrb.net\/xijinping\?page=6"/);
  assert.match(body, /rel="prev" href="\/xijinping\?page=5"/);
  assert.doesNotMatch(body, /rel="next"/);
});
test('empty pages and upstream failures do not become indexable empty shells', async t => {
  setup(t, 0);
  const res = await xiTopic(new Request('https://trrb.net/xijinping?page=999'), context);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  t.mock.restoreAll();
  setup(t, 0, true);
  const failed = await xiTopic(new Request('https://trrb.net/xijinping'), context);
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('retry-after'), '120');
});
test('HEAD remains bodyless and aliases redirect to the same page', async t => {
  setup(t, 1);
  const head = await xiTopic(new Request('https://trrb.net/xijinping', {method:'HEAD'}), context);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const alias = await xiTopic(new Request('https://trrb.net/xijinping/?page=2'), context);
  assert.equal(alias.status, 301);
  assert.equal(alias.headers.get('location'), 'https://trrb.net/xijinping?page=2');
});

test('previous topic URLs redirect to the CMS path without losing pagination', async () => {
  const response = await xiTopic(new Request('https://trrb.net/topic/xi-jinping?page=3'), context);
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), 'https://trrb.net/xijinping?page=3');
});

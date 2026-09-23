import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { articleListQuery, searchTerms } = require('../netlify/functions/_shared/article-search.js');

test('admin defaults to 72 hours but searches all history and preserves status filters', () => {
  const now = Date.parse('2026-09-23T15:00:00Z');
  const recent = articleListQuery({}, { now });
  assert.match(recent.query.and, /2026-09-20T15:00:00.000Z/);
  const history = articleListQuery({ q: '婚姻 绿卡', status: 'published', page: 12 }, { now });
  assert.doesNotMatch(history.query.and, /published_at|created_at/);
  assert.match(history.query.and, /content.ilike.\*婚姻\*/);
  assert.match(history.query.and, /title.ilike.\*绿卡\*/);
  assert.equal(history.query.status, 'eq.published');
  assert.equal(history.query.offset, '550');
});

test('public search cannot reveal drafts, private fields, or bypass predicates with query syntax', () => {
  const result = articleListQuery({ q: 'I-485, 绿卡 (status.eq.hidden) "*%', status: 'hidden', page: 11 }, { publicOnly: true });
  assert.equal(result.query.status, 'eq.published');
  assert.equal(result.query.visibility, 'eq.public');
  assert.equal(result.query.offset, '240');
  assert.equal(result.query.limit, '25');
  assert.doesNotMatch(result.query.select, /metadata|content|visibility/);
  assert.doesNotMatch(result.query.and, /status\.eq\.hidden/);
  assert.deepEqual(searchTerms('Ｎ‑４００，入籍'), ['N-400', '入籍']);
  assert.equal(articleListQuery({q: '*%'}, {publicOnly:true}).emptySearch, true);
});

test('article ID search works without imposing a time limit', () => {
  const result = articleListQuery({q:'1a29e35c-16d5-4a6d-a7cd-da691062c8f9'});
  assert.equal(result.query.id, 'eq.1a29e35c-16d5-4a6d-a7cd-da691062c8f9');
  assert.equal(result.query.and, undefined);
});

test('public endpoint uses all-history query and returns pagination without leaking hidden fields', async t => {
  process.env.SUPABASE_URL = 'https://data.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  const { default: handler } = await import('../netlify/functions/public-article-search.ts');
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('status'), 'eq.published');
    assert.equal(url.searchParams.get('visibility'), 'eq.public');
    assert.equal(url.searchParams.get('published_at'), null);
    return Response.json(Array.from({length:25}, (_,i) => ({id:String(i), title:'正文命中结果', published_at:'2020-01-01'})));
  });
  const response = await handler(new Request('https://trrb.net/.netlify/functions/public-article-search?q=历史报道&page=2'));
  const data = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.articles.length, 24);
  assert.equal(data.page, 2);
  assert.equal(data.has_more, true);
});

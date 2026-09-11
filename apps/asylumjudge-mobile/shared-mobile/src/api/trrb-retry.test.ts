import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchArticle } from './trrb.ts';

test('retries a temporary server failure without reusing the unfinished request', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: 'temporary' }), { status: 503 });
    return new Response(JSON.stringify({ article: { id: 'retry-article', title: 'Recovered' } }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const article = await fetchArticle('retry-article');
  assert.equal(article?.title, 'Recovered');
  assert.equal(calls, 2);
});

test('does not retry a permanent client error', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(() => fetchArticle('missing-article'), /not found/);
  assert.equal(calls, 1);
});

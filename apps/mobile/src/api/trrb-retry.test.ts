import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchArticle, fetchHomepageBundle } from './trrb.ts';

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

test('homepage deadline remains active until the response body finishes', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  const deadlines: number[] = [];
  globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    if (ms === 20000) deadlines.push(ms);
    return originalTimer(callback, ms === 20000 ? 5 : 0, ...args);
  }) as typeof setTimeout;
  globalThis.fetch = async (_url, options) => ({
    ok: true, status: 200,
    json: () => new Promise((_resolve, reject) => {
      const signal = options?.signal;
      const abort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
    })
  }) as Response;
  t.after(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; });
  await assert.rejects(() => fetchHomepageBundle(), /请求超时/);
  assert.equal(deadlines.length, 3);
});

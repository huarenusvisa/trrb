import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function loadHandler(name, fetch) {
  let source = readFileSync(new URL(`../netlify/edge-functions/${name}.ts`, import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace('export const config', 'const config')
    .replace('export default async', 'globalThis.handler = async');
  const context = vm.createContext({ URL, Request, Response, Headers, console, fetch,
    finalHotCanonicalForLegacyId: () => '', Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://database.test' : 'fixture-key' } } });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context.handler;
}

function handler(fetch) {
  const page = loadHandler('article-prerender', fetch);
  const guard = loadHandler('00-legacy-article-query-guard', fetch);
  return (request, context) => page(request, { next: () => guard(request, context) });
}

test('retired numeric IDs return 410 without querying the UUID column', async () => {
  for (const id of ['2465', 'wp-2465']) {
    const run = handler(async input => {
      const url = new URL(input);
      assert.equal(url.searchParams.has('id'), false, 'Numeric IDs cannot query UUID columns');
      if (url.pathname === '/rest/v1/articles') return Response.json([]);
      assert.equal(url.pathname, '/articles-home-index.js');
      return new Response('window.articles = [{"id":"1234"}];');
    });
    const response = await run(new Request(`https://trrb.net/article.html?id=${id}`), {
      next() { throw Error('Retired ID must not fall through'); }
    });
    assert.equal(response.status, 410);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
  }
});

test('valid numeric archives remain available and wp prefixes redirect', async () => {
  for (const id of ['1234', 'wp-1234']) {
    const run = handler(async input => {
      const url = new URL(input);
      assert.equal(url.searchParams.has('id'), false, 'Numeric IDs cannot query UUID columns');
      if (url.pathname === '/rest/v1/articles') return Response.json([]);
      assert.equal(url.pathname, '/articles-home-index.js');
      return new Response('window.articles = [{"id":"1234"}];');
    });
    const response = await run(new Request(`https://trrb.net/article.html?id=${id}`), {
      next: () => new Response('archived article')
    });
    assert.equal(response.status, id === '1234' ? 200 : 301);
    if (id.startsWith('wp-')) assert.equal(response.headers.get('location'), 'https://trrb.net/article.html?id=1234');
  }
});

test('invalid IDs return 404 while real UUID database failures remain retryable', async () => {
  const invalid = handler(async () => { throw Error('Invalid IDs must not query the database'); });
  assert.equal((await invalid(new Request('https://trrb.net/article.html?id=not-an-id'), {})).status, 404);
  const run = handler(async input => {
    assert.equal(new URL(input).searchParams.get('id'), 'eq.00000000-0000-4000-8000-000000000001');
    return new Response('unavailable', { status: 503 });
  });
  const response = await run(new Request('https://trrb.net/article.html?id=00000000-0000-4000-8000-000000000001'), {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '120');
  assert.equal(response.headers.get('x-robots-tag'), null);
});


test('migrated numeric IDs reach their canonical body before archive retirement', async () => {
  const canonical = 'https://trrb.net/hot-headlines/migrated-article';
  const run = handler(async input => {
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/articles');
    assert.equal(url.searchParams.has('id'), false);
    return Response.json([{ id: '00000000-0000-4000-8000-000000000001', canonical_url: canonical }]);
  });
  const response = await run(new Request('https://trrb.net/article.html?id=2465'), {
    next() { throw Error('Migrated article must redirect'); }
  });
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), canonical);
});

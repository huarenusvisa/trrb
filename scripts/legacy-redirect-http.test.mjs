import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const destination = 'https://trrb.net/hot-headlines/小庭刚走完-大庭就压上来-wp112110';
function load(name, fetch) {
  let source = readFileSync(new URL(`../netlify/edge-functions/${name}.ts`, import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '').replace('export const config', 'const config')
    .replace('export default async', 'globalThis.handler = async');
  const context = vm.createContext({ URL, Request, Response, console, fetch,
    Deno: { env: { get: () => undefined } }, finalHotCanonicalForLegacyId: () => '' });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return context;
}

for (const name of ['legacy-url-redirect', '00-wordpress-query-rescue', '00-legacy-article-query-guard']) {
  test(`${name}: Chinese Location is serialized without throwing or double encoding`, () => {
    const context = load(name);
    for (const target of [destination, new URL(destination).href]) {
      const response = context.redirect(target, 'regression');
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), new URL(destination).href);
    }
  });
}

for (const oldPath of ['/小庭刚走完-大庭就压上来/', '/105167-2/']) {
  test(`exact legacy mapping reaches article: ${oldPath}`, async () => {
    const context = load('legacy-url-redirect', async () => Response.json([{ new_path: destination }]));
    const response = await context.handler(new Request(`https://trrb.net${oldPath}`), {
      next() { throw new Error('Known legacy URL must not fall through'); }
    });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), new URL(destination).href);
  });
}

test('decoded stored old paths are recognized', async () => {
  const context = load('legacy-url-redirect', async (url) => {
    const match = url.searchParams.get('old_path') === 'eq./旧文章标题/';
    return Response.json(match ? [{ new_path: destination }] : []);
  });
  const response = await context.handler(new Request('https://trrb.net/旧文章标题/'), {});
  assert.equal(response.status, 301);
});

test('database outage remains retryable, never retires an article', async () => {
  const context = load('legacy-url-redirect', async () => new Response('', { status: 503 }));
  const response = await context.handler(new Request('https://trrb.net/旧文章标题/'), {});
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '300');
});

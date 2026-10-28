import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import articlePage from '../netlify/edge-functions/article-prerender.ts';
import { publicationUrl } from '../netlify/shared/publication.mjs';
import ranking from '../homepage-ranking.js';

const template = '<html><head><title>模板</title></head><body><article class="container article-page" id="article-root"></article></body></html>';
async function render(t, overrides = {}) {
  const row = { id: '00000000-0000-4000-8000-000000000001', slug: 'report', publication_path: '/trump/report', title: '报道标题', category_name: 'ICE执法与警情', author: 'Jessie', content: '已经核实的正文。', published_at: '2026-10-27T15:26:34.824Z', ...overrides };
  const previous = globalThis.Deno;
  globalThis.Deno = { env: { get: key => key === 'SUPABASE_URL' ? 'https://db.test' : 'test' } };
  t.after(() => { globalThis.Deno = previous; });
  t.mock.method(globalThis, 'fetch', async input => {
    const u = new URL(input);
    if (u.pathname === '/article.html') return new Response(template);
    assert.equal(u.pathname, '/rest/v1/articles', 'pinned articles must not need an extra category lookup');
    return Response.json([row]);
  });
  const response = await articlePage(new Request('https://trrb.net' + row.publication_path), { next() { throw Error('unexpected fallback'); } });
  return { response, html: await response.text() };
}
test('pinned section, body link and schemas agree after CMS category changes', async t => {
  const { response, html } = await render(t);
  assert.equal(response.status, 200);
  assert.match(html, /class="tag" href="\/trump">特朗普实时动态<\/a>/);
  assert.match(html, /"articleSection":"特朗普实时动态"/);
  assert.match(html, /"position":2,"name":"特朗普实时动态","item":"https:\/\/trrb.net\/trump"/);
  assert.match(html, /"author":\{"@type":"Person","name":"Jessie"\}/);
  assert.match(html, /<time datetime="2026-10-27T15:26:34.824Z">2026\/10\/27 11:26（纽约时间）<\/time>/);
  assert.match(html, /content="index,follow/);
});
test('editorial organization has a real about link without inventing a person profile', async t => {
  const { html } = await render(t, { author: '唐人日报编辑部' });
  assert.match(html, /"author":\{"@type":"Organization","name":"唐人日报编辑部","url":"https:\/\/trrb.net\/#about"\}/);
});
test('empty-body articles remain noindex', async t => {
  const { response, html } = await render(t, { content: '', summary: '' });
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  assert.match(html, /content="noindex,follow/);
});
test('client enhancement preserves the server section for labels absent from its old map', () => {
  const source = fs.readFileSync(new URL('../article-v31.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  function makeCategoryTagClickable'), source.indexOf('  function resolveImage'));
  const attributes = { href: '/trump' };
  const tag = { tagName: 'A', classList: { add() {} }, getAttribute: k => attributes[k], setAttribute(k, v) { attributes[k] = v; } };
  const context = vm.createContext({ root: { dataset: { prerendered: 'true' } }, categoryHref: () => '/', tag });
  vm.runInContext(fn + ';makeCategoryTagClickable(tag,"特朗普实时动态");', context);
  assert.equal(tag.href, '/trump');
});
function snapshotContext(fetch) {
  const source = fs.readFileSync(new URL('./inject-static-news-links.mjs', import.meta.url), 'utf8');
  const functions = source.slice(0, source.indexOf('const sitemap = await')).replace(/^#!.*\n/, '').replace(/^import .*;\n/gm, '');
  const context = vm.createContext({ process: { cwd: () => '/fixture', env: {} }, URL, AbortSignal, Intl, Date, ranking, publicationUrl, fetch });
  vm.runInContext(functions, context);
  return context;
}
test('first-paint hero uses the curated public focus selection and escapes content', async () => {
  const context = snapshotContext(async () => Response.json({ articles: [{ title: '<安全标题>', publication_path: '/us-politics/curated', cover_image: 'https://img.test/photo.jpg', category_name: '美国时政' }] }));
  const html = await vm.runInContext('homeHeroSnapshot()', context);
  assert.match(html, /data-seo-static-snapshot="build"/);
  assert.match(html, /href="\/us-politics\/curated"/);
  assert.match(html, /width="1200" height="675" loading="eager" fetchpriority="high"/);
  assert.match(html, /<h1>&lt;安全标题&gt;<\/h1>/);
});
test('focus outages and invalid canonical paths leave the normal runtime fallback available', async () => {
  for (const fetch of [async () => { throw Error('outage'); }, async () => Response.json({ articles: [{ title: '标题', publication_path: '//outside.test/a' }] })]) {
    assert.equal(await vm.runInContext('homeHeroSnapshot()', snapshotContext(fetch)), '');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('every surviving legacy article has one valid reviewed destination', () => {
  const plan = JSON.parse(read('data/editorial/asylum-knowledge-distribution-20260923.json'));
  const context = { window: {} };
  vm.runInNewContext(read('config/immigration-knowledge.js'), context);
  const categories = context.window.TRRB_IMMIGRATION_KNOWLEDGE.categories;
  assert.equal(plan.articles.length, 124);
  assert.equal(new Set(plan.articles.map(row => row.legacy_id)).size, 124);
  assert.equal(plan.articles.filter(row => row.path).length, 115);
  for (const row of plan.articles.filter(row => row.path)) {
    assert.ok(categories.find(category => category.slug === row.path)?.items.some(item => item.slug === row.topic), row.title);
  }
  assert.equal(plan.articles.find(row => row.legacy_id === 'wp-113707').topic, 'c08-ead');
  assert.equal(plan.articles.find(row => row.legacy_id === 'wp-111552').topic, 'vawa');
  assert.equal(plan.missing_original.disposition, 'restore-as-private-draft');
});

test('public archive enforces publication, visibility and exact module scope', async () => {
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  const { default: handler } = await import('../netlify/functions/public-knowledge-archive.ts');
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => { requested = new URL(url); return Response.json([]); };
  try {
    const response = await handler(new Request('https://trrb.net/.netlify/functions/public-knowledge-archive?path=humanitarian&topic=c08-ead&status=draft&visibility=private'));
    assert.equal(response.status, 200);
    assert.equal(requested.searchParams.get('status'), 'eq.published');
    assert.equal(requested.searchParams.get('visibility'), 'eq.public');
    assert.equal(requested.searchParams.get('metadata->>knowledge_path'), 'eq.humanitarian');
    assert.equal(requested.searchParams.get('metadata->>knowledge_topic'), 'eq.c08-ead');
    assert.equal(requested.searchParams.get('metadata->>knowledge_migration_batch'), 'eq.20260923-asylum-knowledge');
    assert.ok(!requested.searchParams.get('select').includes('metadata'));
    requested = null;
    await handler(new Request('https://trrb.net/.netlify/functions/public-knowledge-archive?path=humanitarian&topic=asylum,or(status.eq.draft)'));
    assert.equal(requested, null);
    assert.equal((await handler(new Request('https://trrb.net/', { method: 'POST' }))).status, 405);
  } finally { globalThis.fetch = originalFetch; }
});

test('old module articles stay discoverable beyond twenty items and escape titles', async () => {
  let more;
  const root = { hidden: true, innerHTML: '', dataset: {}, querySelector: () => ({ addEventListener: (_event, callback) => { more = callback; } }) };
  const articles = Array.from({ length: 33 }, (_, i) => ({ id: String(i), title: i === 0 ? '<script>test</script>' : `历史文章${i}`, summary: '摘要', canonical_url: `https://trrb.net/news/article-${i}`, published_at: '2026-06-01' }));
  vm.runInNewContext(read('immigrate/knowledge-archive.js'), {
    document: { querySelector: () => root }, location: { search: '?path=humanitarian&topic=asylum-process', origin: 'https://trrb.net' }, URL, URLSearchParams,
    fetch: async () => ({ ok: true, json: async () => ({ articles }) })
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.dataset.loaded, 'true');
  assert.match(root.innerHTML, /33篇/);
  assert.match(root.innerHTML, /&lt;script&gt;test/);
  assert.equal((root.innerHTML.match(/class="article-item"/g) || []).length, 20);
  more();
  assert.equal((root.innerHTML.match(/class="article-item"/g) || []).length, 33);
  assert.doesNotMatch(root.innerHTML, /class="archive-more"/);
});

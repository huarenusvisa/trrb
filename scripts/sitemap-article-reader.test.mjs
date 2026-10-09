import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublishedArticles } from './sitemap-article-reader.mjs';

test('cursor scan retains all rows and newest-first duplicate precedence', async () => {
  const data = [
    { id: '01', published_at: '2026-09-20', created_at: '2026-09-19' },
    { id: '02', published_at: null, created_at: '2026-09-23' },
    { id: '03', published_at: '2026-09-23', created_at: '2026-09-22' },
    { id: '04', published_at: '2026-09-23', created_at: '2026-09-22' }
  ];
  let calls = 0;
  const result = await fetchPublishedArticles(async (table, params) => {
    calls++;
    assert.equal(table, 'articles');
    assert.equal(params.status, 'eq.published');
    assert.equal(params.visibility, 'eq.public');
    assert.equal(params.order, 'id.asc');
    assert.equal(params.offset, undefined);
    return data.filter(row => row.id > (params.id?.slice(3) || '')).slice(0, Number(params.limit));
  }, { pageSize: 2 });
  assert.equal(calls, 3, 'A full final page requires an explicit end-of-data read');
  assert.deepEqual(result.map(row => row.id), ['04', '03', '01', '02']);
});

test('transient query failure retries the same cursor without duplicating records', async () => {
  let calls = 0;
  const rows = await fetchPublishedArticles(async (_table, params) => {
    assert.equal(params.id, undefined);
    if (++calls === 1) throw Object.assign(new Error('statement timeout'), { status: 500 });
    return [{ id: '01' }];
  }, { pause: async () => {} });
  assert.equal(calls, 2);
  assert.equal(rows.length, 1);
});

test('malformed, repeating, truncated or unauthorized results fail closed', async () => {
  await assert.rejects(fetchPublishedArticles(async () => ({})), /Invalid article page/);
  await assert.rejects(fetchPublishedArticles(async () => [{ id: '01' }], { pageSize: 1 }), /cursor did not advance/);
  await assert.rejects(fetchPublishedArticles(async () => [{ id: '01' }, { id: '02' }], { maxRows: 1 }), /safety limit/);
  let calls = 0;
  await assert.rejects(fetchPublishedArticles(async () => { calls++; throw Object.assign(new Error('unauthorized'), { status: 401 }); }), /unauthorized/);
  assert.equal(calls, 1);
});
\n\ntest('reader reduces page size after repeated transient timeouts', async () => {\n  const limits = [];\n  const rows = await fetchPublishedArticles(async (_table, params) => {\n    limits.push(Number(params.limit));\n    if (Number(params.limit) > 25) throw Object.assign(new Error('statement timeout'), { code: '57014' });\n    return [{ id: '01', published_at: '2026-10-09T00:00:00Z' }];\n  }, { pageSize: 100, minPageSize: 25, pause: async () => {} });\n  assert.deepEqual(limits, [100, 100, 100, 50, 50, 50, 25]);\n  assert.equal(rows.length, 1);\n});\n
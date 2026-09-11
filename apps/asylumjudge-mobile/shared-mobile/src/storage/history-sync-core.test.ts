import assert from 'node:assert/strict';
import test from 'node:test';
import { clearHistoryLibrary, syncHistoryLibrary } from './history-sync-core.ts';
import type { CloudHistoryEntry, HistorySyncAdapter } from './history-sync-core.ts';
import type { SavedArticle } from './favorites-sync-core.ts';

function createSyncAdapter(options: {
  userId?: string | null;
  local?: SavedArticle[];
  cloud?: CloudHistoryEntry[];
  articles?: Record<string, SavedArticle | Error | null>;
  failUpload?: boolean;
} = {}) {
  let written: SavedArticle[] | null = null;
  const uploads: CloudHistoryEntry[][] = [];
  let activeResolves = 0;
  let maxConcurrentResolves = 0;
  const adapter: HistorySyncAdapter = {
    getCurrentUserId: async () => options.userId ?? null,
    readLocalHistory: async () => options.local ?? [],
    writeLocalHistory: async (items) => { written = items; },
    listCloudHistory: async () => options.cloud ?? [],
    uploadHistory: async (_userId, entries) => {
      uploads.push(entries);
      if (options.failUpload) throw new Error('cloud unavailable');
    },
    resolveArticle: async (id) => {
      activeResolves += 1;
      maxConcurrentResolves = Math.max(maxConcurrentResolves, activeResolves);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeResolves -= 1;
      const value = options.articles?.[id] ?? null;
      if (value instanceof Error) throw value;
      return value;
    },
    now: () => Date.parse('2026-09-03T09:00:00.000Z'),
  };
  return { adapter, uploads, getWritten: () => written, getMaxConcurrentResolves: () => maxConcurrentResolves };
}

const localOne = { id: 'local-1', title: '刚刚阅读的新闻' };
const localTwo = { id: 'local-2', title: '稍早阅读的新闻' };

test('keeps guest history on the device without cloud writes', async () => {
  const state = createSyncAdapter({ local: [localOne] });
  const result = await syncHistoryLibrary(state.adapter);
  assert.deepEqual(result.items, [localOne]);
  assert.equal(result.signedIn, false);
  assert.deepEqual(state.uploads, []);
  assert.equal(state.getWritten(), null);
});

test('uploads local order and restores cloud-only history without duplicates', async () => {
  const cloudArticle = { id: 'cloud-1', title: '另一设备阅读的新闻' };
  const state = createSyncAdapter({
    userId: 'user-1',
    local: [localOne, localTwo],
    cloud: [
      { articleId: 'cloud-1', lastReadAt: '2026-09-03T08:00:00Z' },
      { articleId: 'local-1', lastReadAt: '2026-09-02T08:00:00Z' },
    ],
    articles: { 'cloud-1': cloudArticle },
  });
  const result = await syncHistoryLibrary(state.adapter);
  assert.deepEqual(result.items.map((item) => item.id), ['local-1', 'local-2', 'cloud-1']);
  assert.deepEqual(state.uploads[0], [
    { articleId: 'local-1', lastReadAt: '2026-09-03T09:00:00.000Z' },
    { articleId: 'local-2', lastReadAt: '2026-09-03T08:59:59.000Z' },
  ]);
  assert.equal(result.downloaded, 1);
});

test('does not overwrite a newer cloud timestamp with stale device history', async () => {
  const staleLocal = { ...localOne, last_read_at: '2026-09-01T09:00:00Z' };
  const state = createSyncAdapter({
    userId: 'user-1',
    local: [staleLocal],
    cloud: [{ articleId: 'local-1', lastReadAt: '2026-09-03T08:00:00Z' }],
  });
  const result = await syncHistoryLibrary(state.adapter);
  assert.deepEqual(state.uploads, []);
  assert.equal(result.items[0].last_read_at, '2026-09-03T08:00:00.000Z');
});

test('caps the merged device list at 100 and resolves at most six articles concurrently', async () => {
  const cloud = Array.from({ length: 110 }, (_, index) => ({ articleId: `cloud-${index}`, lastReadAt: new Date(1000 - index).toISOString() }));
  const articles = Object.fromEntries(cloud.map((entry) => [entry.articleId, { id: entry.articleId, title: entry.articleId }]));
  const state = createSyncAdapter({ userId: 'user-1', cloud, articles });
  const result = await syncHistoryLibrary(state.adapter);
  assert.equal(result.items.length, 100);
  assert.equal(state.getMaxConcurrentResolves(), 6);
});

test('retains local history when a cloud article cannot be restored', async () => {
  const state = createSyncAdapter({
    userId: 'user-1',
    local: [localOne],
    cloud: [{ articleId: 'missing-1', lastReadAt: '2026-09-03T08:00:00Z' }],
    articles: { 'missing-1': new Error('temporary failure') },
  });
  const result = await syncHistoryLibrary(state.adapter);
  assert.deepEqual(result.items.map((item) => item.id), ['local-1']);
  assert.equal(result.unresolved, 1);
});

test('does not overwrite device history when upload fails', async () => {
  const state = createSyncAdapter({ userId: 'user-1', local: [localOne], failUpload: true });
  await assert.rejects(() => syncHistoryLibrary(state.adapter), /cloud unavailable/);
  assert.equal(state.getWritten(), null);
});

test('clears protected cloud history before removing the signed-in device copy', async () => {
  const order: string[] = [];
  await clearHistoryLibrary({
    getCurrentUserId: async () => 'user-1',
    clearCloudHistory: async () => { order.push('cloud'); },
    clearLocalHistory: async () => { order.push('local'); },
  });
  assert.deepEqual(order, ['cloud', 'local']);
});

test('preserves device history when signed-in cloud clearing fails', async () => {
  let localCleared = false;
  await assert.rejects(() => clearHistoryLibrary({
    getCurrentUserId: async () => 'user-1',
    clearCloudHistory: async () => { throw new Error('cloud unavailable'); },
    clearLocalHistory: async () => { localCleared = true; },
  }), /cloud unavailable/);
  assert.equal(localCleared, false);
});

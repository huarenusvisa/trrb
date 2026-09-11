import assert from 'node:assert/strict';
import test from 'node:test';
import { syncFavoriteLibrary } from './favorites-sync-core.ts';
import type { FavoriteSyncAdapter, SavedArticle } from './favorites-sync-core.ts';

function createAdapter(options: {
  userId?: string | null;
  local?: SavedArticle[];
  cloudIds?: string[];
  articles?: Record<string, SavedArticle | Error | null>;
  failUpload?: boolean;
} = {}) {
  let written: SavedArticle[] | null = null;
  const uploads: string[][] = [];
  const adapter: FavoriteSyncAdapter = {
    getCurrentUserId: async () => options.userId ?? null,
    readLocalFavorites: async () => options.local ?? [],
    writeLocalFavorites: async (items) => { written = items; },
    listCloudFavoriteIds: async () => options.cloudIds ?? [],
    uploadFavoriteIds: async (_userId, ids) => {
      uploads.push(ids);
      if (options.failUpload) throw new Error('cloud unavailable');
    },
    resolveArticle: async (id) => {
      const value = options.articles?.[id] ?? null;
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return { adapter, uploads, getWritten: () => written };
}

const localArticle = { id: 'local-1', title: '游客收藏的新闻' };
const cloudArticle = { id: 'cloud-1', title: '另一设备收藏的新闻', category_name: '美国' };

test('keeps guest favorites local without any cloud writes', async () => {
  const state = createAdapter({ local: [localArticle] });
  const result = await syncFavoriteLibrary(state.adapter);
  assert.deepEqual(result.items, [localArticle]);
  assert.equal(result.signedIn, false);
  assert.deepEqual(state.uploads, []);
  assert.equal(state.getWritten(), null);
});

test('uploads guest favorites and downloads a non-destructive cloud union', async () => {
  const state = createAdapter({
    userId: 'user-1',
    local: [localArticle],
    cloudIds: ['cloud-1', 'local-1', 'cloud-1'],
    articles: { 'cloud-1': cloudArticle },
  });
  const result = await syncFavoriteLibrary(state.adapter);
  assert.deepEqual(state.uploads, [['local-1']]);
  assert.deepEqual(result.items, [localArticle, cloudArticle]);
  assert.deepEqual(state.getWritten(), result.items);
  assert.equal(result.downloaded, 1);
  assert.equal(result.unresolved, 0);
});

test('retains local data and reports cloud articles that could not be resolved', async () => {
  const state = createAdapter({
    userId: 'user-1',
    local: [localArticle],
    cloudIds: ['missing-1'],
    articles: { 'missing-1': new Error('temporary network failure') },
  });
  const result = await syncFavoriteLibrary(state.adapter);
  assert.deepEqual(result.items, [localArticle]);
  assert.deepEqual(state.getWritten(), [localArticle]);
  assert.equal(result.unresolved, 1);
});

test('does not overwrite the device copy when the cloud upload fails', async () => {
  const state = createAdapter({ userId: 'user-1', local: [localArticle], failUpload: true });
  await assert.rejects(() => syncFavoriteLibrary(state.adapter), /cloud unavailable/);
  assert.equal(state.getWritten(), null);
});

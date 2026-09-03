import type { SavedArticle } from './favorites-sync-core';

export type CloudHistoryEntry = {
  articleId: string;
  lastReadAt: string;
};

export type HistoryUploadEntry = CloudHistoryEntry;

export type HistorySyncAdapter = {
  getCurrentUserId(): Promise<string | null>;
  readLocalHistory(): Promise<SavedArticle[]>;
  writeLocalHistory(items: SavedArticle[]): Promise<void>;
  listCloudHistory(userId: string, limit: number): Promise<CloudHistoryEntry[]>;
  uploadHistory(userId: string, entries: HistoryUploadEntry[]): Promise<void>;
  resolveArticle(articleId: string): Promise<SavedArticle | null>;
  now(): number;
};

export type HistoryClearAdapter = {
  getCurrentUserId(): Promise<string | null>;
  clearLocalHistory(): Promise<void>;
  clearCloudHistory(userId: string): Promise<void>;
};

export type HistorySyncResult = {
  items: SavedArticle[];
  signedIn: boolean;
  uploaded: number;
  downloaded: number;
  unresolved: number;
};

function uniqueArticles(items: SavedArticle[], limit: number) {
  const seen = new Set<string>();
  const result: SavedArticle[] = [];
  for (const item of items) {
    const id = String(item.id);
    if (!id || !item.title || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

function uniqueCloudEntries(entries: CloudHistoryEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = String(entry.articleId);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolveInBatches(ids: string[], resolveArticle: HistorySyncAdapter['resolveArticle'], batchSize = 6) {
  const results: PromiseSettledResult<SavedArticle | null>[] = [];
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    results.push(...await Promise.allSettled(batch.map((id) => resolveArticle(id))));
  }
  return results;
}

export async function syncHistoryLibrary(adapter: HistorySyncAdapter, limit = 100): Promise<HistorySyncResult> {
  const local = uniqueArticles(await adapter.readLocalHistory(), limit);
  const userId = await adapter.getCurrentUserId();
  if (!userId) {
    return { items: local, signedIn: false, uploaded: 0, downloaded: 0, unresolved: 0 };
  }

  // Fetch the existing account order before promoting this device's recent reads.
  // Both sides are merged as a union; no old cloud row is deleted by synchronization.
  const cloud = uniqueCloudEntries(await adapter.listCloudHistory(userId, limit)).slice(0, limit);
  const cloudTimes = new Map(cloud.map((entry) => [entry.articleId, timestamp(entry.lastReadAt)]));
  const now = adapter.now();
  const localWithTime = local.map((item, index) => ({
    ...item,
    last_read_at: new Date(timestamp(item.last_read_at) || now - index * 1000).toISOString(),
  }));
  const uploads = localWithTime
    .filter((item) => timestamp(item.last_read_at) > (cloudTimes.get(String(item.id)) || 0))
    .map((item) => ({ articleId: String(item.id), lastReadAt: item.last_read_at }));
  if (uploads.length) await adapter.uploadHistory(userId, uploads);

  const localIds = new Set(localWithTime.map((item) => String(item.id)));
  const cloudOnlyIds = cloud.map((entry) => entry.articleId).filter((id) => !localIds.has(id));
  const resolved = await resolveInBatches(cloudOnlyIds, adapter.resolveArticle);
  const downloaded: SavedArticle[] = [];
  let unresolved = 0;

  resolved.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value && String(result.value.id) === cloudOnlyIds[index]) {
      downloaded.push({
        ...result.value,
        last_read_at: cloud.find((entry) => entry.articleId === cloudOnlyIds[index])?.lastReadAt,
      });
    } else {
      unresolved += 1;
    }
  });

  const mergedLocal = localWithTime.map((item) => {
    const cloudTime = cloudTimes.get(String(item.id)) || 0;
    return cloudTime > timestamp(item.last_read_at)
      ? { ...item, last_read_at: new Date(cloudTime).toISOString() }
      : item;
  });
  const items = uniqueArticles(
    [...mergedLocal, ...downloaded].sort((a, b) => timestamp(b.last_read_at) - timestamp(a.last_read_at)),
    limit,
  );
  await adapter.writeLocalHistory(items);
  return {
    items,
    signedIn: true,
    uploaded: uploads.length,
    downloaded: downloaded.length,
    unresolved,
  };
}

export async function clearHistoryLibrary(adapter: HistoryClearAdapter) {
  const userId = await adapter.getCurrentUserId();
  // For signed-in users, clear the protected cloud rows first. If that request fails,
  // preserve the device copy so a later sync cannot unexpectedly restore old history.
  if (userId) await adapter.clearCloudHistory(userId);
  await adapter.clearLocalHistory();
  return { signedIn: Boolean(userId) };
}

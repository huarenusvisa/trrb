export type SavedArticle = {
  id: string | number;
  title: string;
  category_name?: string;
  published_at?: string;
  cover_image?: string;
  last_read_at?: string;
};

export type FavoriteSyncAdapter = {
  getCurrentUserId(): Promise<string | null>;
  readLocalFavorites(): Promise<SavedArticle[]>;
  writeLocalFavorites(items: SavedArticle[]): Promise<void>;
  listCloudFavoriteIds(userId: string): Promise<string[]>;
  uploadFavoriteIds(userId: string, articleIds: string[]): Promise<void>;
  resolveArticle(articleId: string): Promise<SavedArticle | null>;
};

export type FavoriteSyncResult = {
  items: SavedArticle[];
  signedIn: boolean;
  uploaded: number;
  downloaded: number;
  unresolved: number;
};

function uniqueArticles(items: SavedArticle[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = String(item.id);
    if (!id || !item.title || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map(String).filter(Boolean))];
}

export async function syncFavoriteLibrary(adapter: FavoriteSyncAdapter): Promise<FavoriteSyncResult> {
  const local = uniqueArticles(await adapter.readLocalFavorites());
  const userId = await adapter.getCurrentUserId();
  if (!userId) {
    return { items: local, signedIn: false, uploaded: 0, downloaded: 0, unresolved: 0 };
  }

  // Read before uploading so cloud-only rows remain distinguishable. Neither operation
  // deletes data; a failure therefore leaves the device copy untouched for a later retry.
  const cloudIds = uniqueIds(await adapter.listCloudFavoriteIds(userId));
  const localIds = local.map((item) => String(item.id));
  if (localIds.length) await adapter.uploadFavoriteIds(userId, localIds);

  const localIdSet = new Set(localIds);
  const cloudOnlyIds = cloudIds.filter((id) => !localIdSet.has(id));
  const resolved = await Promise.allSettled(cloudOnlyIds.map((id) => adapter.resolveArticle(id)));
  const downloaded: SavedArticle[] = [];
  let unresolved = 0;

  resolved.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value && String(result.value.id) === cloudOnlyIds[index]) {
      downloaded.push(result.value);
    } else {
      unresolved += 1;
    }
  });

  const items = uniqueArticles([...local, ...downloaded]);
  await adapter.writeLocalFavorites(items);
  return {
    items,
    signedIn: true,
    uploaded: localIds.length,
    downloaded: downloaded.length,
    unresolved,
  };
}

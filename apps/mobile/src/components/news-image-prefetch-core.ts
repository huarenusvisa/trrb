type NewsImageItem = { cover_image?: string };

export type NewsImagePrefetchWindow = {
  uris: Array<string | undefined>;
  prefetchedThrough: number;
};

export function nextNewsImagePrefetchWindow(
  items: NewsImageItem[],
  viewableIndexes: Array<number | null>,
  prefetchedThrough: number,
  limit = 4,
): NewsImagePrefetchWindow | null {
  const indexes = viewableIndexes.filter((index): index is number => index != null && index >= 0);
  if (!indexes.length || limit <= 0) return null;
  const start = Math.max(...indexes) + 1;
  if (start <= prefetchedThrough || start >= items.length) return null;
  const end = Math.min(items.length, start + limit);
  return {
    uris: items.slice(start, end).map((item) => item.cover_image),
    prefetchedThrough: end - 1,
  };
}

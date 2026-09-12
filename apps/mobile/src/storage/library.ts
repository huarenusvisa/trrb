import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../auth/supabase';
import { syncFavoriteLibrary } from './favorites-sync-core';
import { clearHistoryLibrary, syncHistoryLibrary } from './history-sync-core';
import { resolveAccountStorageKey } from './account-storage-scope';
import type { SavedArticle } from './favorites-sync-core';

export type { SavedArticle } from './favorites-sync-core';

const FAVORITES_KEY = '@trrb/favorites/v1';
const HISTORY_KEY = '@trrb/history/v1';
const MAX_HISTORY = 100;

async function readList(key: string): Promise<SavedArticle[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, rows: SavedArticle[]) {
  await AsyncStorage.setItem(key, JSON.stringify(rows));
}

async function currentUserIdOrNull() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function mergeStoredLists(accountValue: string, guestValue: string, limit = Number.POSITIVE_INFINITY) {
  const parse = (raw: string) => {
    try {
      const value = JSON.parse(raw);
      return Array.isArray(value) ? value as SavedArticle[] : [];
    } catch { return [] as SavedArticle[]; }
  };
  const seen = new Set<string>();
  return JSON.stringify([...parse(guestValue), ...parse(accountValue)].filter((item) => {
    const id = String(item?.id ?? '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit));
}

async function currentStorageScope(baseKey: string) {
  const userId = await currentUserIdOrNull();
  const limit = baseKey === HISTORY_KEY ? MAX_HISTORY : Number.POSITIVE_INFINITY;
  const key = await resolveAccountStorageKey(AsyncStorage, baseKey, userId, (account, guest) => mergeStoredLists(account, guest, limit));
  return { key, userId };
}

export async function getFavorites() {
  const { key } = await currentStorageScope(FAVORITES_KEY);
  return readList(key);
}
export async function isFavorite(id: string | number) { return (await getFavorites()).some((x) => String(x.id) === String(id)); }

export async function toggleFavorite(article: SavedArticle) {
  const scope = await currentStorageScope(FAVORITES_KEY);
  const rows = await readList(scope.key);
  const exists = rows.some((x) => String(x.id) === String(article.id));
  const next = exists ? rows.filter((x) => String(x.id) !== String(article.id)) : [article, ...rows];
  await writeList(scope.key, next);

  if (scope.userId) {
    if (exists) {
      const { error } = await supabase.from('favorites').delete().eq('user_id', scope.userId).eq('article_id', String(article.id));
      if (error) throw error;
    } else {
      const { error } = await supabase.from('favorites').upsert({ user_id: scope.userId, article_id: String(article.id) }, { onConflict: 'user_id,article_id' });
      if (error) throw error;
    }
  }
  return !exists;
}

export async function getHistory() {
  const { key } = await currentStorageScope(HISTORY_KEY);
  return readList(key);
}
export async function addHistory(article: SavedArticle) {
  const scope = await currentStorageScope(HISTORY_KEY);
  const rows = await readList(scope.key);
  const lastReadAt = new Date().toISOString();
  const next = [{ ...article, last_read_at: lastReadAt }, ...rows.filter((x) => String(x.id) !== String(article.id))].slice(0, MAX_HISTORY);
  await writeList(scope.key, next);
  if (scope.userId) {
    const { error } = await supabase.from('reading_history').upsert({ user_id: scope.userId, article_id: String(article.id), last_read_at: lastReadAt }, { onConflict: 'user_id,article_id' });
    if (error) throw error;
  }
}

export async function clearHistory() {
  const scope = await currentStorageScope(HISTORY_KEY);
  return clearHistoryLibrary({
    getCurrentUserId: async () => scope.userId,
    clearLocalHistory: () => AsyncStorage.removeItem(scope.key),
    clearCloudHistory: async (userId) => {
      const { error } = await supabase.from('reading_history').delete().eq('user_id', userId);
      if (error) throw error;
    },
  });
}

export async function mergeLocalLibraryToCloud() {
  const userId = await currentUserIdOrNull();
  if (!userId) return { favorites: 0, history: 0 };
  const [favoritesKey, historyKey] = await Promise.all([
    resolveAccountStorageKey(AsyncStorage, FAVORITES_KEY, userId, (account, guest) => mergeStoredLists(account, guest)),
    resolveAccountStorageKey(AsyncStorage, HISTORY_KEY, userId, (account, guest) => mergeStoredLists(account, guest, MAX_HISTORY)),
  ]);
  const [favorites, history] = await Promise.all([readList(favoritesKey), readList(historyKey)]);
  if (favorites.length) {
    const { error } = await supabase.from('favorites').upsert(favorites.map((x) => ({ user_id: userId, article_id: String(x.id) })), { onConflict: 'user_id,article_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  if (history.length) {
    const now = Date.now();
    const { error } = await supabase.from('reading_history').upsert(history.map((x, i) => ({
      user_id: userId,
      article_id: String(x.id),
      last_read_at: x.last_read_at || new Date(now - i * 1000).toISOString(),
    })), { onConflict: 'user_id,article_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { favorites: favorites.length, history: history.length };
}

export async function getCloudFavoriteIds() {
  const userId = await currentUserIdOrNull();
  if (!userId) return [] as string[];
  const { data, error } = await supabase.from('favorites').select('article_id').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((x) => String(x.article_id));
}

export async function syncFavoritesWithCloud(resolveArticle: (id: string) => Promise<SavedArticle | null>) {
  const scope = await currentStorageScope(FAVORITES_KEY);
  return syncFavoriteLibrary({
    getCurrentUserId: async () => scope.userId,
    readLocalFavorites: () => readList(scope.key),
    writeLocalFavorites: (items) => writeList(scope.key, items),
    listCloudFavoriteIds: async (userId) => {
      const { data, error } = await supabase
        .from('favorites')
        .select('article_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((item) => String(item.article_id));
    },
    uploadFavoriteIds: async (userId, articleIds) => {
      const { error } = await supabase.from('favorites').upsert(
        articleIds.map((articleId) => ({ user_id: userId, article_id: articleId })),
        { onConflict: 'user_id,article_id', ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    resolveArticle,
  });
}

export async function getCloudHistoryIds() {
  const userId = await currentUserIdOrNull();
  if (!userId) return [] as string[];
  const { data, error } = await supabase.from('reading_history').select('article_id').eq('user_id', userId).order('last_read_at', { ascending: false }).limit(MAX_HISTORY);
  if (error) throw error;
  return (data || []).map((x) => String(x.article_id));
}

export async function syncHistoryWithCloud(resolveArticle: (id: string) => Promise<SavedArticle | null>) {
  const scope = await currentStorageScope(HISTORY_KEY);
  return syncHistoryLibrary({
    getCurrentUserId: async () => scope.userId,
    readLocalHistory: () => readList(scope.key),
    writeLocalHistory: (items) => writeList(scope.key, items),
    listCloudHistory: async (userId, limit) => {
      const { data, error } = await supabase
        .from('reading_history')
        .select('article_id,last_read_at')
        .eq('user_id', userId)
        .order('last_read_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map((item) => ({ articleId: String(item.article_id), lastReadAt: String(item.last_read_at) }));
    },
    uploadHistory: async (userId, entries) => {
      const { error } = await supabase.from('reading_history').upsert(
        entries.map((entry) => ({ user_id: userId, article_id: entry.articleId, last_read_at: entry.lastReadAt })),
        { onConflict: 'user_id,article_id' },
      );
      if (error) throw error;
    },
    resolveArticle,
    now: Date.now,
  }, MAX_HISTORY);
}

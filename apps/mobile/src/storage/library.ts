import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedArticle = {
  id: string | number;
  title: string;
  category_name?: string;
  published_at?: string;
  cover_image?: string;
};

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

export async function getFavorites() { return readList(FAVORITES_KEY); }
export async function isFavorite(id: string | number) { return (await getFavorites()).some((x) => String(x.id) === String(id)); }
export async function toggleFavorite(article: SavedArticle) {
  const rows = await getFavorites();
  const exists = rows.some((x) => String(x.id) === String(article.id));
  const next = exists ? rows.filter((x) => String(x.id) !== String(article.id)) : [article, ...rows];
  await writeList(FAVORITES_KEY, next);
  return !exists;
}

export async function getHistory() { return readList(HISTORY_KEY); }
export async function addHistory(article: SavedArticle) {
  const rows = await getHistory();
  const next = [article, ...rows.filter((x) => String(x.id) !== String(article.id))].slice(0, MAX_HISTORY);
  await writeList(HISTORY_KEY, next);
}

export async function clearHistory() { await AsyncStorage.removeItem(HISTORY_KEY); }

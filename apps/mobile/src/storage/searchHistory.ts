import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'trrb.search.history.v1';
const MAX_ITEMS = 20;

export async function getSearchHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

export async function addSearchHistory(term: string) {
  const value = term.trim();
  if (!value) return getSearchHistory();
  const current = await getSearchHistory();
  const next = [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, MAX_ITEMS);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function clearSearchHistory() {
  await AsyncStorage.removeItem(KEY);
}

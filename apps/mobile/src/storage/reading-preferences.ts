import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'trrb:reading-preferences:v1';
export type ReadingPreferences = { fontScale: 0.9 | 1 | 1.15 | 1.3 };
const DEFAULTS: ReadingPreferences = { fontScale: 1 };
const listeners = new Set<(preferences: ReadingPreferences) => void>();

export async function getReadingPreferences(): Promise<ReadingPreferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return [0.9, 1, 1.15, 1.3].includes(parsed?.fontScale) ? parsed : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export async function setReadingFontScale(fontScale: ReadingPreferences['fontScale']) {
  const next: ReadingPreferences = { fontScale };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeReadingPreferences(listener: (preferences: ReadingPreferences) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

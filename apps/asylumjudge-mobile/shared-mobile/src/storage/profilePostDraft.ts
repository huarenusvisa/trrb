import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseProfilePostDraft } from './profile-post-draft-core';

const KEY = 'trrb:profile-post-draft:v1';

export async function loadProfilePostDraft() {
  const raw = await AsyncStorage.getItem(KEY);
  const draft = parseProfilePostDraft(raw);
  if (!draft && raw) await AsyncStorage.removeItem(KEY);
  return draft;
}

export async function saveProfilePostDraft(caption: string) {
  const safeCaption = caption.slice(0, 2000);
  if (!safeCaption.trim()) return AsyncStorage.removeItem(KEY);
  await AsyncStorage.setItem(KEY, JSON.stringify({ caption: safeCaption, savedAt: Date.now() }));
}

export async function clearProfilePostDraft() {
  await AsyncStorage.removeItem(KEY);
}

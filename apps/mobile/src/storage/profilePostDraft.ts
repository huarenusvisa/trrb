import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveAccountStorageKey } from './account-storage-scope';
import { parseProfilePostDraft } from './profile-post-draft-core';

const KEY = 'trrb:profile-post-draft:v1';

async function draftKey(userId: string) {
  return resolveAccountStorageKey(AsyncStorage, KEY, userId);
}

export async function loadProfilePostDraft(userId: string) {
  const key = await draftKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const draft = parseProfilePostDraft(raw);
  if (!draft && raw) await AsyncStorage.removeItem(key);
  return draft;
}

export async function saveProfilePostDraft(userId: string, caption: string) {
  const key = await draftKey(userId);
  const safeCaption = caption.slice(0, 2000);
  if (!safeCaption.trim()) return AsyncStorage.removeItem(key);
  await AsyncStorage.setItem(key, JSON.stringify({ caption: safeCaption, savedAt: Date.now() }));
}

export async function clearProfilePostDraft(userId: string) {
  await AsyncStorage.removeItem(await draftKey(userId));
}

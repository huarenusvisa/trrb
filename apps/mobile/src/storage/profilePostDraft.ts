import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveAccountStorageKey } from './account-storage-scope';
import { parseProfilePostDrafts, PROFILE_POST_DRAFT_MAX_COUNT, type ProfilePostDraft } from './profile-post-draft-core';

const KEY = 'trrb:profile-post-draft:v1';

async function draftKey(userId: string) {
  return resolveAccountStorageKey(AsyncStorage, KEY, userId);
}

export async function loadProfilePostDrafts(userId: string) {
  const key = await draftKey(userId);
  const raw = await AsyncStorage.getItem(key);
  const drafts = parseProfilePostDrafts(raw);
  if (!drafts.length && raw) await AsyncStorage.removeItem(key);
  else if (raw) await AsyncStorage.setItem(key, JSON.stringify(drafts));
  return drafts;
}

export async function loadProfilePostDraft(userId: string) {
  return (await loadProfilePostDrafts(userId))[0] || null;
}

export async function saveProfilePostDraft(userId: string, caption: string, tagsText = '', draftId?: string | null) {
  const key = await draftKey(userId);
  const safeCaption = caption.slice(0, 2000);
  const safeTagsText = tagsText.slice(0, 220);
  const drafts = await loadProfilePostDrafts(userId);

  if (!safeCaption.trim() && !safeTagsText.trim()) {
    if (draftId) {
      const next = drafts.filter((draft) => draft.id !== draftId);
      if (next.length) await AsyncStorage.setItem(key, JSON.stringify(next));
      else await AsyncStorage.removeItem(key);
    }
    return draftId || null;
  }

  const id = draftId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const saved: ProfilePostDraft = { id, caption: safeCaption, tagsText: safeTagsText, savedAt: Date.now() };
  const next = [saved, ...drafts.filter((draft) => draft.id !== id)]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, PROFILE_POST_DRAFT_MAX_COUNT);
  await AsyncStorage.setItem(key, JSON.stringify(next));
  return id;
}

export async function deleteProfilePostDraft(userId: string, draftId: string) {
  const key = await draftKey(userId);
  const drafts = (await loadProfilePostDrafts(userId)).filter((draft) => draft.id !== draftId);
  if (drafts.length) await AsyncStorage.setItem(key, JSON.stringify(drafts));
  else await AsyncStorage.removeItem(key);
}

export async function clearProfilePostDraft(userId: string, draftId?: string | null) {
  if (draftId) return deleteProfilePostDraft(userId, draftId);
  await AsyncStorage.removeItem(await draftKey(userId));
}

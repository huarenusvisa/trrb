import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunityCategory } from '../api/community';
import { parseCommunityPostDraft } from './community-post-draft-core';
import type { CommunityPostDraft } from './community-post-draft-core';

const KEY = 'trrb:community-post-draft:v1';

export type CommunityDraftInput = {
  category: CommunityCategory;
  title: string;
  content: string;
};

export async function loadCommunityPostDraft(): Promise<(Omit<CommunityPostDraft, 'category'> & { category: CommunityCategory }) | null> {
  const raw = await AsyncStorage.getItem(KEY);
  const draft = parseCommunityPostDraft(raw);
  if (!draft && raw) await AsyncStorage.removeItem(KEY);
  return draft as (Omit<CommunityPostDraft, 'category'> & { category: CommunityCategory }) | null;
}

export async function saveCommunityPostDraft(input: CommunityDraftInput) {
  const title = input.title.slice(0, 120);
  const content = input.content.slice(0, 12_000);
  if (!title.trim() && !content.trim()) return AsyncStorage.removeItem(KEY);
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...input, title, content, savedAt: Date.now() }));
}

export async function clearCommunityPostDraft() {
  await AsyncStorage.removeItem(KEY);
}

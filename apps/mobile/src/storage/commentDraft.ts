import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseCommentDraft } from './comment-draft-core';

export type CommentDraftScope = 'news' | 'community';
export type CommentDraftInput = { text: string; parentId?: string | null; replyLabel?: string | null };

function key(scope: CommentDraftScope, targetId: string) {
  return `trrb:comment-draft:v1:${scope}:${encodeURIComponent(targetId).slice(0, 300)}`;
}

export async function loadCommentDraft(scope: CommentDraftScope, targetId: string) {
  const storageKey = key(scope, targetId);
  const raw = await AsyncStorage.getItem(storageKey);
  const draft = parseCommentDraft(raw);
  if (!draft && raw) await AsyncStorage.removeItem(storageKey);
  return draft;
}

export async function saveCommentDraft(scope: CommentDraftScope, targetId: string, input: CommentDraftInput) {
  const storageKey = key(scope, targetId);
  const text = input.text.slice(0, 3000);
  if (!text.trim()) return AsyncStorage.removeItem(storageKey);
  await AsyncStorage.setItem(storageKey, JSON.stringify({
    text,
    parentId: input.parentId?.slice(0, 200) || null,
    replyLabel: input.parentId ? input.replyLabel?.slice(0, 100) || '用户' : null,
    savedAt: Date.now(),
  }));
}

export async function clearCommentDraft(scope: CommentDraftScope, targetId: string) {
  await AsyncStorage.removeItem(key(scope, targetId));
}

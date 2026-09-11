export const COMMENT_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CommentDraft = {
  text: string;
  parentId: string | null;
  replyLabel: string | null;
  savedAt: number;
};

export function parseCommentDraft(raw: string | null, now = Date.now()): CommentDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CommentDraft>;
    if (typeof value.text !== 'string' || typeof value.savedAt !== 'number') return null;
    if (value.parentId !== null && typeof value.parentId !== 'string') return null;
    if (value.replyLabel !== null && typeof value.replyLabel !== 'string') return null;
    if (!Number.isFinite(value.savedAt) || value.savedAt > now + 60_000 || now - value.savedAt > COMMENT_DRAFT_MAX_AGE_MS) return null;
    const text = value.text.slice(0, 3000);
    if (!text.trim()) return null;
    const parentId = value.parentId?.slice(0, 200) || null;
    const replyLabel = parentId ? value.replyLabel?.slice(0, 100).trim() || '用户' : null;
    return { text, parentId, replyLabel, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

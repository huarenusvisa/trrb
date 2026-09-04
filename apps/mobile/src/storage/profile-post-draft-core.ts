export const PROFILE_POST_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type ProfilePostDraft = {
  caption: string;
  savedAt: number;
};

export function parseProfilePostDraft(raw: string | null, now = Date.now()): ProfilePostDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProfilePostDraft>;
    if (typeof value.caption !== 'string' || typeof value.savedAt !== 'number') return null;
    if (!Number.isFinite(value.savedAt) || value.savedAt > now + 60_000 || now - value.savedAt > PROFILE_POST_DRAFT_MAX_AGE_MS) return null;
    const caption = value.caption.slice(0, 2000);
    return caption.trim() ? { caption, savedAt: value.savedAt } : null;
  } catch {
    return null;
  }
}

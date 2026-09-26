export const PROFILE_POST_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PROFILE_POST_DRAFT_MAX_COUNT = 5;

export type ProfilePostDraft = {
  id: string;
  caption: string;
  tagsText: string;
  savedAt: number;
};

function normalizeDraft(value: Partial<ProfilePostDraft>, now: number): ProfilePostDraft | null {
  if (typeof value.caption !== 'string' || typeof value.savedAt !== 'number') return null;
  if (!Number.isFinite(value.savedAt) || value.savedAt > now + 60_000 || now - value.savedAt > PROFILE_POST_DRAFT_MAX_AGE_MS) return null;
  const caption = value.caption.slice(0, 2000);
  const tagsText = typeof value.tagsText === 'string' ? value.tagsText.slice(0, 220) : '';
  if (!caption.trim() && !tagsText.trim()) return null;
  const id = typeof value.id === 'string' && value.id ? value.id : `legacy-${value.savedAt}`;
  return { id, caption, tagsText, savedAt: value.savedAt };
}

export function parseProfilePostDrafts(raw: string | null, now = Date.now()): ProfilePostDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values
      .map((value) => normalizeDraft((value || {}) as Partial<ProfilePostDraft>, now))
      .filter((value): value is ProfilePostDraft => Boolean(value))
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, PROFILE_POST_DRAFT_MAX_COUNT);
  } catch {
    return [];
  }
}

export function parseProfilePostDraft(raw: string | null, now = Date.now()): ProfilePostDraft | null {
  return parseProfilePostDrafts(raw, now)[0] || null;
}

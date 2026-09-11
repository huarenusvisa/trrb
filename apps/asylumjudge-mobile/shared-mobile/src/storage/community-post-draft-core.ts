export const COMMUNITY_POST_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const categories = new Set([
  'uscis_interview',
  'court_experience',
  'immigration_help',
  'hot_discussion',
  'ice_experience',
  'lawyer_review',
  'tipoff',
]);

export type CommunityPostDraft = {
  category: string;
  title: string;
  content: string;
  savedAt: number;
};

export function parseCommunityPostDraft(raw: string | null, now = Date.now()): CommunityPostDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CommunityPostDraft>;
    if (typeof value.category !== 'string' || !categories.has(value.category)) return null;
    if (typeof value.title !== 'string' || typeof value.content !== 'string' || typeof value.savedAt !== 'number') return null;
    if (!Number.isFinite(value.savedAt) || value.savedAt > now + 60_000 || now - value.savedAt > COMMUNITY_POST_DRAFT_MAX_AGE_MS) return null;
    const title = value.title.slice(0, 120);
    const content = value.content.slice(0, 12_000);
    return title.trim() || content.trim() ? { category: value.category, title, content, savedAt: value.savedAt } : null;
  } catch {
    return null;
  }
}

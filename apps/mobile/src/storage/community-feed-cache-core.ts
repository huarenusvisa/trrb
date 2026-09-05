import type { CommunityPost } from '../api/community-core';

export const COMMUNITY_FEED_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const COMMUNITY_FEED_CACHE_MAX_POSTS = 20;

export type CommunityFeedSnapshot = {
  posts: CommunityPost[];
  nextOffset: number | null;
};

type CommunityFeedCacheEnvelope = {
  savedAt: number;
  snapshot: CommunityFeedSnapshot;
};

function validPublicPost(post: CommunityPost) {
  return Boolean(
    post && post.status === 'published' && String(post.id || '').trim()
      && String(post.title || '').trim() && String(post.created_at || '').trim(),
  );
}

export function parseCommunityFeedCache(raw: string | null, now = Date.now()): CommunityFeedCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as CommunityFeedCacheEnvelope;
    if (!Number.isFinite(payload?.savedAt) || payload.savedAt <= 0 || now - payload.savedAt > COMMUNITY_FEED_CACHE_MAX_AGE_MS) return null;
    const snapshot = payload.snapshot;
    if (!Array.isArray(snapshot?.posts) || !snapshot.posts.every(validPublicPost)) return null;
    if (snapshot.nextOffset !== null && !Number.isFinite(snapshot.nextOffset)) return null;
    return { savedAt: payload.savedAt, snapshot };
  } catch {
    return null;
  }
}

export function publicCommunityFeedSnapshot(posts: CommunityPost[], nextOffset: number | null): CommunityFeedSnapshot {
  return {
    posts: posts.filter(validPublicPost).slice(0, COMMUNITY_FEED_CACHE_MAX_POSTS),
    nextOffset,
  };
}

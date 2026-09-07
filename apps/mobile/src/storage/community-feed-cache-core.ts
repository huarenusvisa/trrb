import type { CommunityPost } from '../api/community-core';

export const COMMUNITY_FEED_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const COMMUNITY_FEED_CACHE_MAX_POSTS = 60;
const COMMUNITY_FEED_CACHE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const COMMUNITY_FEED_CACHE_KEY = 'trrb.community.feed.v1';

export type CommunityFeedSnapshot = {
  posts: CommunityPost[];
  nextOffset: number | null;
  truncated?: boolean;
};

type CommunityFeedCacheEnvelope = {
  savedAt: number;
  snapshot: CommunityFeedSnapshot;
};

export type CommunityFeedCacheInspection = {
  payload: CommunityFeedCacheEnvelope | null;
  discardReason: 'expired' | 'invalid' | null;
};

export function communityFeedCacheKey(category = '') {
  const scope = category.trim();
  return scope ? `${COMMUNITY_FEED_CACHE_KEY}.category.${encodeURIComponent(scope)}` : COMMUNITY_FEED_CACHE_KEY;
}

function validPublicPost(post: CommunityPost) {
  return Boolean(
    post && post.status === 'published' && String(post.id || '').trim()
      && String(post.title || '').trim() && String(post.created_at || '').trim(),
  );
}

export function inspectCommunityFeedCache(raw: string | null, now = Date.now()): CommunityFeedCacheInspection {
  if (!raw) return { payload: null, discardReason: null };
  try {
    const payload = JSON.parse(raw) as CommunityFeedCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + COMMUNITY_FEED_CACHE_FUTURE_TOLERANCE_MS) {
      return { payload: null, discardReason: 'invalid' };
    }
    if (now - savedAt > COMMUNITY_FEED_CACHE_MAX_AGE_MS) {
      return { payload: null, discardReason: 'expired' };
    }
    const snapshot = payload.snapshot;
    if (!Array.isArray(snapshot?.posts) || snapshot.posts.length > COMMUNITY_FEED_CACHE_MAX_POSTS || !snapshot.posts.every(validPublicPost)) {
      return { payload: null, discardReason: 'invalid' };
    }
    if (snapshot.nextOffset !== null && (!Number.isInteger(snapshot.nextOffset) || snapshot.nextOffset < 0)) {
      return { payload: null, discardReason: 'invalid' };
    }
    if ((snapshot.truncated !== undefined && typeof snapshot.truncated !== 'boolean') || (snapshot.truncated === true && snapshot.nextOffset !== null)) {
      return { payload: null, discardReason: 'invalid' };
    }
    return { payload: { savedAt, snapshot }, discardReason: null };
  } catch {
    return { payload: null, discardReason: 'invalid' };
  }
}

export function parseCommunityFeedCache(raw: string | null, now = Date.now()): CommunityFeedCacheEnvelope | null {
  return inspectCommunityFeedCache(raw, now).payload;
}

export function publicCommunityFeedSnapshot(posts: CommunityPost[], nextOffset: number | null): CommunityFeedSnapshot {
  const seen = new Set<string>();
  const publicPosts = posts.filter((post) => {
    const id = String(post?.id || '').trim();
    if (!validPublicPost(post) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const truncated = publicPosts.length > COMMUNITY_FEED_CACHE_MAX_POSTS;
  return {
    posts: publicPosts.slice(0, COMMUNITY_FEED_CACHE_MAX_POSTS),
    nextOffset: !truncated && nextOffset !== null && Number.isInteger(nextOffset) && nextOffset >= 0 ? nextOffset : null,
    truncated,
  };
}

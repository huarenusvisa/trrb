type LikeableCommunityPost = {
  like_count: number;
  viewer_has_liked: boolean;
};

export function optimisticCommunityPostLike<T extends LikeableCommunityPost>(post: T): T {
  const liked = !post.viewer_has_liked;
  return {
    ...post,
    viewer_has_liked: liked,
    like_count: Math.max(0, Number(post.like_count || 0) + (liked ? 1 : -1)),
  };
}

export function resolveCommunityPostLike<T extends LikeableCommunityPost>(
  post: T,
  result: { liked: boolean; like_count: number },
): T {
  return {
    ...post,
    viewer_has_liked: result.liked,
    like_count: Math.max(0, Number(result.like_count || 0)),
  };
}

type LikeableCommunityComment = {
  like_count: number;
  viewer_has_liked: boolean;
};

export function optimisticCommunityCommentLike<T extends LikeableCommunityComment>(comment: T, liked: boolean): T {
  if (comment.viewer_has_liked === liked) return comment;
  return {
    ...comment,
    viewer_has_liked: liked,
    like_count: Math.max(0, Number(comment.like_count || 0) + (liked ? 1 : -1)),
  };
}

export function resolveCommunityCommentLike<T extends LikeableCommunityComment>(
  comment: T,
  result: { liked: boolean; like_count: number },
): T {
  return {
    ...comment,
    viewer_has_liked: result.liked,
    like_count: Math.max(0, Number(result.like_count || 0)),
  };
}

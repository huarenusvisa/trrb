export type LikeAggregateRow = {
  id: string;
  comment_likes?: Array<{ count?: number | null }> | null;
};

export type CommentLikeState = {
  id: string;
  like_count: number;
  viewer_has_liked: boolean;
};

export function hydrateCommentLikeState<T extends LikeAggregateRow>(rows: T[], likedCommentIds: Iterable<string>) {
  const liked = new Set(likedCommentIds);
  return rows.map((row) => {
    const { comment_likes, ...comment } = row;
    const rawCount = Number(comment_likes?.[0]?.count || 0);
    return {
      ...comment,
      like_count: Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0,
      viewer_has_liked: liked.has(row.id),
    };
  });
}

export function updateCommentLikeState<T extends CommentLikeState>(rows: T[], commentId: string, liked: boolean) {
  return rows.map((row) => {
    if (row.id !== commentId || row.viewer_has_liked === liked) return row;
    return {
      ...row,
      viewer_has_liked: liked,
      like_count: Math.max(0, row.like_count + (liked ? 1 : -1)),
    };
  });
}

import type { CommunityComment, CommunityPostDetail } from '../api/community-core';

export type CommunityCommentDisplayRow = {
  item: CommunityComment;
  depth: number;
  replyToLabel: string | null;
};

export type CommunityCommentPage = {
  rows: CommunityCommentDisplayRow[];
  hiddenThreadCount: number;
  totalThreadCount: number;
};

export function communityCommentDisplayName(comment: CommunityComment) {
  return comment.profiles?.display_name?.trim() || '唐人用户';
}

export function appendCreatedCommunityComment(detail: CommunityPostDetail, comment: CommunityComment, pending: boolean) {
  if (detail.comments.some((item) => item.id === comment.id)) return detail;
  return {
    ...detail,
    post: {
      ...detail.post,
      comment_count: pending ? detail.post.comment_count : detail.post.comment_count + 1,
    },
    comments: [...detail.comments, {
      ...comment,
      profiles: comment.profiles || { display_name: '我' },
    }],
  };
}

export function removeUnpublishedCommunityComment(detail: CommunityPostDetail, commentId: string, commentCount: number) {
  if (!detail.comments.some((item) => item.id === commentId)) return detail;
  return {
    ...detail,
    post: { ...detail.post, comment_count: Math.max(0, commentCount) },
    comments: detail.comments.filter((item) => item.id !== commentId),
  };
}

export function visibleThreadCountForComment(comments: CommunityComment[], commentId: string, minimumCount: number) {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  let target = byId.get(commentId);
  if (!target) return Math.max(1, Math.floor(minimumCount));

  const visited = new Set<string>();
  while (target.parent_id && target.parent_id !== target.id && !visited.has(target.id)) {
    visited.add(target.id);
    const parent = byId.get(target.parent_id);
    if (!parent) break;
    target = parent;
  }

  const roots = comments.filter((comment) => !comment.parent_id || comment.parent_id === comment.id || !byId.has(comment.parent_id));
  const rootIndex = roots.findIndex((comment) => comment.id === target?.id);
  if (rootIndex < 0) return Math.max(1, Math.floor(minimumCount));
  return Math.max(1, Math.floor(minimumCount), roots.length - rootIndex);
}

export function paginateCommunityCommentThreads(comments: CommunityComment[], visibleThreadCount: number): CommunityCommentPage {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const children = new Map<string, CommunityComment[]>();
  const roots: CommunityComment[] = [];

  for (const comment of comments) {
    if (comment.parent_id && comment.parent_id !== comment.id && byId.has(comment.parent_id)) {
      children.set(comment.parent_id, [...(children.get(comment.parent_id) || []), comment]);
    } else {
      roots.push(comment);
    }
  }

  const safeCount = Math.max(1, Math.floor(visibleThreadCount));
  const visibleRoots = roots.slice(-safeCount);
  const rows: CommunityCommentDisplayRow[] = [];
  const visited = new Set<string>();
  const append = (comment: CommunityComment, depth: number, parent: CommunityComment | null) => {
    if (visited.has(comment.id)) return;
    visited.add(comment.id);
    rows.push({
      item: comment,
      depth,
      replyToLabel: comment.parent_id
        ? (parent ? communityCommentDisplayName(parent) : '原评论作者')
        : null,
    });
    for (const reply of children.get(comment.id) || []) append(reply, depth + 1, comment);
  };

  for (const root of visibleRoots) append(root, root.parent_id ? 1 : 0, null);

  return {
    rows,
    hiddenThreadCount: Math.max(0, roots.length - visibleRoots.length),
    totalThreadCount: roots.length,
  };
}

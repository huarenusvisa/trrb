import type { CommunityComment } from '../api/community-core';

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

import type { CommentRow } from '../api/comments';

export type CommentNode = CommentRow & { replies: CommentRow[] };

export function buildCommentThreads(rows: CommentRow[]): CommentNode[] {
  const roots: CommentNode[] = [];
  const byId = new Map<string, CommentNode>();
  for (const row of rows) byId.set(row.id, { ...row, replies: [] });
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

export function commentDisplayName(row: CommentRow) {
  return row.profiles?.display_name?.trim() || '唐人读者';
}

export function isOwnComment(row: CommentRow, userId: string | null) {
  return Boolean(userId && row.user_id === userId);
}

import type { CommentRow } from '../api/comments';

export type CommentNode = CommentRow & { replies: CommentRow[] };
export type CommentDisplayRow = { item: CommentRow; depth: number; replyToLabel: string | null };

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

export function buildCommentDisplayRows(rows: CommentRow[]): CommentDisplayRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, CommentRow[]>();
  const roots: CommentRow[] = [];
  for (const row of rows) {
    if (row.parent_id && byId.has(row.parent_id) && row.parent_id !== row.id) {
      children.set(row.parent_id, [...(children.get(row.parent_id) || []), row]);
    } else roots.push(row);
  }

  const result: CommentDisplayRow[] = [];
  const visited = new Set<string>();
  const append = (row: CommentRow, depth: number, parent: CommentRow | null) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    result.push({
      item: row,
      depth,
      replyToLabel: row.parent_id ? (parent ? commentDisplayName(parent) : row.parent_author_name?.trim() || '原评论作者') : null,
    });
    for (const child of children.get(row.id) || []) append(child, depth + 1, row);
  };
  for (const root of roots) append(root, root.parent_id ? 1 : 0, null);
  for (const row of rows) append(row, row.parent_id ? 1 : 0, null);
  return result;
}

export function commentDisplayName(row: CommentRow) {
  return row.profiles?.display_name?.trim() || '唐人读者';
}

export function isOwnComment(row: CommentRow, userId: string | null) {
  return Boolean(userId && row.user_id === userId);
}

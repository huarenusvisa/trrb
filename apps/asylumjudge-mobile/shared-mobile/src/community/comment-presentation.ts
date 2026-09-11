import type { CommentRow } from '../api/comments';

export type CommentNode = CommentRow & { replies: CommentRow[] };
export type CommentDisplayRow = { item: CommentRow; depth: number; replyToLabel: string | null; threadRootId: string; replyCount: number; expanded: boolean };

export function prependCreatedComment(rows: CommentRow[], created: CommentRow) {
  return [created, ...rows.filter((row) => row.id !== created.id)];
}

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

export function commentThreadRootId(rows: CommentRow[], commentId: string) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let current = byId.get(commentId);
  const visited = new Set<string>();
  while (current?.parent_id && current.parent_id !== current.id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current?.id || commentId;
}

export function buildCommentDisplayRows(rows: CommentRow[], expandedThreadIds: ReadonlySet<string> = new Set()): CommentDisplayRow[] {
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
  const descendantCount = (row: CommentRow, visiting = new Set<string>()): number => {
    if (visiting.has(row.id)) return 0;
    const next = new Set(visiting); next.add(row.id);
    return (children.get(row.id) || []).reduce((count, child) => count + 1 + descendantCount(child, next), 0);
  };
  const markDescendantsVisited = (row: CommentRow) => {
    for (const child of children.get(row.id) || []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id); markDescendantsVisited(child);
    }
  };
  const append = (row: CommentRow, depth: number, parent: CommentRow | null, rootId: string) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    result.push({
      item: row,
      depth,
      replyToLabel: row.parent_id ? (parent ? commentDisplayName(parent) : row.parent_author_name?.trim() || '原评论作者') : null,
      threadRootId: rootId,
      replyCount: depth === 0 ? descendantCount(row) : 0,
      expanded: expandedThreadIds.has(rootId),
    });
    if (expandedThreadIds.has(rootId)) for (const child of children.get(row.id) || []) append(child, depth + 1, row, rootId);
    else if (depth === 0) markDescendantsVisited(row);
  };
  for (const root of roots) append(root, root.parent_id ? 1 : 0, null, root.id);
  for (const row of rows) append(row, row.parent_id ? 1 : 0, null, row.id);
  return result;
}

export function commentDisplayName(row: CommentRow) {
  return row.profiles?.display_name?.trim() || '唐人读者';
}

export function isOwnComment(row: CommentRow, userId: string | null) {
  return Boolean(userId && row.user_id === userId);
}

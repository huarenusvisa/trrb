import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommentRow } from '../api/comments';
import { buildCommentThreads, commentDisplayName, isOwnComment } from './comment-presentation.ts';

const row = (overrides: Partial<CommentRow> = {}): CommentRow => ({
  id: 'root', article_id: 'article-1', user_id: 'user-1', parent_id: null,
  content: '测试评论', status: 'published', is_pinned: false,
  like_count: 0, viewer_has_liked: false,
  created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z',
  profiles: { display_name: '测试用户' }, ...overrides,
});

test('only exposes author deletion for the current comment owner', () => {
  assert.equal(isOwnComment(row(), 'user-1'), true);
  assert.equal(isOwnComment(row(), 'user-2'), false);
  assert.equal(isOwnComment(row(), null), false);
});

test('keeps replies attached and provides a safe display-name fallback', () => {
  const threads = buildCommentThreads([row(), row({ id: 'reply', parent_id: 'root', user_id: 'user-2' })]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].replies[0].id, 'reply');
  assert.equal(commentDisplayName(row({ profiles: { display_name: '  ' } })), '唐人读者');
});

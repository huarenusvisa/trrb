import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommunityComment } from '../api/community-core';
import { communityCommentDisplayName, paginateCommunityCommentThreads } from './community-comment-presentation.ts';

const comment = (overrides: Partial<CommunityComment> = {}): CommunityComment => ({
  id: 'root', post_id: 'post-1', user_id: 'user-1', parent_id: null,
  content: '测试评论', status: 'published', risk_level: 'low',
  created_at: '2026-09-04T00:00:00Z', profiles: { display_name: '测试用户' },
  ...overrides,
});

test('keeps nested replies immediately below their parent with reply labels', () => {
  const page = paginateCommunityCommentThreads([
    comment(),
    comment({ id: 'reply-1', parent_id: 'root', user_id: 'user-2', profiles: { display_name: '回复者' } }),
    comment({ id: 'reply-2', parent_id: 'reply-1', user_id: 'user-3' }),
  ], 10);

  assert.deepEqual(page.rows.map(({ item }) => item.id), ['root', 'reply-1', 'reply-2']);
  assert.deepEqual(page.rows.map(({ depth }) => depth), [0, 1, 2]);
  assert.equal(page.rows[1].replyToLabel, '测试用户');
  assert.equal(page.rows[2].replyToLabel, '回复者');
});

test('shows the newest complete threads first and reports earlier threads', () => {
  const page = paginateCommunityCommentThreads([
    comment({ id: 'old-root' }),
    comment({ id: 'old-reply', parent_id: 'old-root' }),
    comment({ id: 'new-root' }),
    comment({ id: 'new-reply', parent_id: 'new-root' }),
  ], 1);

  assert.deepEqual(page.rows.map(({ item }) => item.id), ['new-root', 'new-reply']);
  assert.equal(page.hiddenThreadCount, 1);
  assert.equal(page.totalThreadCount, 2);
});

test('keeps orphaned replies visible and provides safe author fallbacks', () => {
  const page = paginateCommunityCommentThreads([
    comment({ id: 'orphan', parent_id: 'missing', profiles: { display_name: '  ' } }),
  ], 10);

  assert.equal(page.rows[0].depth, 1);
  assert.equal(page.rows[0].replyToLabel, '原评论作者');
  assert.equal(communityCommentDisplayName(page.rows[0].item), '唐人用户');
});

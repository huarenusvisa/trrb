import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMENT_DRAFT_MAX_AGE_MS, parseCommentDraft } from './comment-draft-core.ts';

test('restores a recent top-level comment draft', () => {
  const now = 30_000_000;
  assert.deepEqual(parseCommentDraft(JSON.stringify({ text: '尚未发布的评论', parentId: null, replyLabel: null, savedAt: now - 500 }), now), {
    text: '尚未发布的评论', parentId: null, replyLabel: null, savedAt: now - 500,
  });
});

test('restores reply context without allowing oversized fields', () => {
  const draft = parseCommentDraft(JSON.stringify({
    text: '文'.repeat(3100), parentId: 'p'.repeat(220), replyLabel: `用户${'名'.repeat(120)}`, savedAt: 100,
  }), 200);
  assert.equal(draft?.text.length, 3000);
  assert.equal(draft?.parentId?.length, 200);
  assert.equal(draft?.replyLabel?.length, 100);
});

test('rejects expired, empty, future and malformed drafts', () => {
  const now = 30_000_000;
  assert.equal(parseCommentDraft(JSON.stringify({ text: '过期', parentId: null, replyLabel: null, savedAt: now - COMMENT_DRAFT_MAX_AGE_MS - 1 }), now), null);
  assert.equal(parseCommentDraft(JSON.stringify({ text: ' ', parentId: null, replyLabel: null, savedAt: now }), now), null);
  assert.equal(parseCommentDraft(JSON.stringify({ text: '未来', parentId: null, replyLabel: null, savedAt: now + 60_001 }), now), null);
  assert.equal(parseCommentDraft('{not-json', now), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProfilePostDraft, PROFILE_POST_DRAFT_MAX_AGE_MS } from './profile-post-draft-core.ts';

test('restores a valid recent profile-post caption', () => {
  const now = 10_000_000;
  assert.deepEqual(parseProfilePostDraft(JSON.stringify({ caption: '尚未发布的文字', savedAt: now - 1_000 }), now), {
    caption: '尚未发布的文字', savedAt: now - 1_000,
  });
});

test('rejects expired, empty and malformed profile-post drafts', () => {
  const now = 10_000_000;
  assert.equal(parseProfilePostDraft(JSON.stringify({ caption: '过期', savedAt: now - PROFILE_POST_DRAFT_MAX_AGE_MS - 1 }), now), null);
  assert.equal(parseProfilePostDraft(JSON.stringify({ caption: '  ', savedAt: now }), now), null);
  assert.equal(parseProfilePostDraft('{not-json', now), null);
  assert.equal(parseProfilePostDraft(JSON.stringify({ caption: '未来', savedAt: now + 60_001 }), now), null);
});

test('caps restored captions at the publishing limit', () => {
  const draft = parseProfilePostDraft(JSON.stringify({ caption: '字'.repeat(2100), savedAt: 100 }), 200);
  assert.equal(draft?.caption.length, 2000);
});

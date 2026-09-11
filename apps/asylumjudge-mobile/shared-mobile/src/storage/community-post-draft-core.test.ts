import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMUNITY_POST_DRAFT_MAX_AGE_MS, parseCommunityPostDraft } from './community-post-draft-core.ts';

test('restores a recent community post draft', () => {
  const now = 20_000_000;
  assert.deepEqual(parseCommunityPostDraft(JSON.stringify({
    category: 'immigration_help', title: '还没发出的标题', content: '还没发出的正文', savedAt: now - 2_000,
  }), now), {
    category: 'immigration_help', title: '还没发出的标题', content: '还没发出的正文', savedAt: now - 2_000,
  });
});

test('rejects expired, empty, malformed and unknown-category drafts', () => {
  const now = 20_000_000;
  assert.equal(parseCommunityPostDraft(JSON.stringify({ category: 'uscis_interview', title: '过期', content: '', savedAt: now - COMMUNITY_POST_DRAFT_MAX_AGE_MS - 1 }), now), null);
  assert.equal(parseCommunityPostDraft(JSON.stringify({ category: 'not-real', title: '标题', content: '正文', savedAt: now }), now), null);
  assert.equal(parseCommunityPostDraft(JSON.stringify({ category: 'uscis_interview', title: ' ', content: ' ', savedAt: now }), now), null);
  assert.equal(parseCommunityPostDraft('{not-json', now), null);
  assert.equal(parseCommunityPostDraft(JSON.stringify({ category: 'uscis_interview', title: '未来', content: '', savedAt: now + 60_001 }), now), null);
});

test('caps restored fields at publishing limits', () => {
  const draft = parseCommunityPostDraft(JSON.stringify({
    category: 'tipoff', title: '题'.repeat(140), content: '文'.repeat(12_100), savedAt: 100,
  }), 200);
  assert.equal(draft?.title.length, 120);
  assert.equal(draft?.content.length, 12_000);
});

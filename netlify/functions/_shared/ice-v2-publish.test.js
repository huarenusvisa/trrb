const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isV2Story,
  publishableStory,
  publicationIdentity,
  normalizeEvidence
} = require("./ice-v2-publish");

test("只允许ICE v2事件进入发布器", () => {
  assert.equal(isV2Story({ event_fingerprint: "v2-abc" }), true);
  assert.equal(isV2Story({ ai_payload: { v2_event_engine: true } }), true);
  assert.equal(isV2Story({ event_fingerprint: "fast-abc" }), false);
});

test("拒绝旧事件、失败事件和已拒绝事件", () => {
  assert.equal(publishableStory({ event_fingerprint: "fast-1" }).ok, false);
  assert.equal(publishableStory({ event_fingerprint: "v2-1", status: "failed" }).ok, false);
  assert.equal(publishableStory({ event_fingerprint: "v2-1", status: "rejected" }).ok, false);
});

test("已发布事件保持幂等", () => {
  assert.deepEqual(publishableStory({ event_fingerprint: "v2-1", article_id: "a1" }), { ok: true, already_published: true });
});

test("文章唯一身份使用事件指纹而非单条帖子ID", () => {
  const identity = publicationIdentity({ event_fingerprint: "v2-abc123" });
  assert.equal(identity.source_platform, "ice_v2_event");
  assert.equal(identity.source_post_id, "v2-abc123");
  assert.equal(identity.slug, "ice-v2-abc123");
});

test("证据按独立信源去重", () => {
  const rows = normalizeEvidence([
    { x_post_id: "1", x_url: "a", source_type: "official", independence_key: "official:ice" },
    { x_post_id: "2", x_url: "b", source_type: "official", independence_key: "official:ice" },
    { x_post_id: "3", x_url: "c", source_type: "major_media", independence_key: "newsroom:reuters" }
  ]);
  assert.equal(rows.length, 2);
});

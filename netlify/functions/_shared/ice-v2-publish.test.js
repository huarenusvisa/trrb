const test = require("node:test");
const assert = require("node:assert/strict");
const {
  publishableStory,
  publicationIdentity,
  normalizeEvidence
} = require("./ice-v2-publish");

test("旧事件不能通过v2发布器", () => {
  assert.deepEqual(publishableStory({ event_fingerprint: "legacy-1" }), {
    ok: false,
    reason: "not_ice_v2_story"
  });
});

test("已发布事件保持幂等", () => {
  assert.deepEqual(publishableStory({ event_fingerprint: "v2-1", article_id: "article-1" }), {
    ok: true,
    already_published: true
  });
});

test("发布身份使用事件指纹", () => {
  const identity = publicationIdentity({ event_fingerprint: "v2-new-york-arrest-1" });
  assert.equal(identity.source_platform, "ice_v2_event");
  assert.equal(identity.source_post_id, "v2-new-york-arrest-1");
  assert.match(identity.slug, /^ice-v2-new-york-arrest-1$/);
});

test("证据按独立信源去重", () => {
  const rows = normalizeEvidence([
    { independence_key: "ice", x_post_id: "1" },
    { independence_key: "ice", x_post_id: "2" },
    { independence_key: "reuters", x_post_id: "3" }
  ]);
  assert.equal(rows.length, 2);
});
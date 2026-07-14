const test = require("node:test");
const assert = require("node:assert/strict");
const { isV2Post } = require("./ice-v2-health");

test("health queue includes only ICE v2 collector posts", () => {
  assert.equal(isV2Post({ raw_payload: { collector: "ice-v2" } }), true);
  assert.equal(isV2Post({ raw_payload: { collector: "legacy" } }), false);
  assert.equal(isV2Post({ raw_payload: null }), false);
});

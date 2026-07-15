const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isV2Story,
  filterReviewScope,
  evidenceSummary
} = require("./ice-v2-review");

test("识别ICE v2事件", () => {
  assert.equal(isV2Story({ event_fingerprint: "v2-abc" }), true);
  assert.equal(isV2Story({ ai_payload: { v2_event_engine: true } }), true);
  assert.equal(isV2Story({ event_fingerprint: "legacy-abc" }), false);
});

test("默认审核范围只返回v2", () => {
  const rows = [
    { id: "1", event_fingerprint: "v2-a" },
    { id: "2", event_fingerprint: "legacy-b" }
  ];
  assert.deepEqual(filterReviewScope(rows).map((row) => row.id), ["1"]);
  assert.deepEqual(filterReviewScope(rows, "legacy").map((row) => row.id), ["2"]);
  assert.equal(filterReviewScope(rows, "all").length, 2);
});

test("个人账号不计入独立信源", () => {
  const result = evidenceSummary([
    { source_type: "official", independence_key: "ice" },
    { source_type: "newsroom", independence_key: "reuters" },
    { source_type: "individual", independence_key: "blogger" }
  ]);
  assert.equal(result.independent_source_count, 2);
  assert.equal(result.official_source_count, 1);
  assert.equal(result.media_source_count, 1);
});
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isV2Story,
  filterReviewScope,
  evidenceSummary,
  attachEvidenceSummaries
} = require("./ice-v2-review");

test("recognizes ICE v2 stories", () => {
  assert.equal(isV2Story({ event_fingerprint: "v2-abc", ai_payload: {} }), true);
  assert.equal(isV2Story({ event_fingerprint: "legacy", ai_payload: { v2_event_engine: true } }), true);
  assert.equal(isV2Story({ event_fingerprint: "legacy", ai_payload: {} }), false);
});

test("defaults review scope to v2", () => {
  const rows = [
    { id: "1", event_fingerprint: "v2-a" },
    { id: "2", event_fingerprint: "fast-b" }
  ];
  assert.deepEqual(filterReviewScope(rows).map((row) => row.id), ["1"]);
  assert.equal(filterReviewScope(rows, "all").length, 2);
  assert.deepEqual(filterReviewScope(rows, "legacy").map((row) => row.id), ["2"]);
});

test("counts only approved official and newsroom source classes", () => {
  const summary = evidenceSummary([
    { source_type: "official", independence_key: "official:ice" },
    { source_type: "major_media", independence_key: "newsroom:reuters" },
    { source_type: "individual", independence_key: "x:blogger" },
    { source_type: "verified_discovered", independence_key: "x:commentator" }
  ]);
  assert.equal(summary.evidence_count, 4);
  assert.equal(summary.independent_source_count, 2);
  assert.equal(summary.official_source_count, 1);
  assert.equal(summary.media_source_count, 1);
});

test("attaches evidence summaries to each story", () => {
  const map = new Map([["1", [{ source_type: "official", independence_key: "official:ice" }]]]);
  const [story] = attachEvidenceSummaries([{ id: "1", event_fingerprint: "v2-a" }], map);
  assert.equal(story.is_v2, true);
  assert.equal(story.evidence_count, 1);
  assert.equal(story.independent_source_count, 1);
});

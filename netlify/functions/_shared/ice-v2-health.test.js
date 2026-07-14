const test = require("node:test");
const assert = require("node:assert/strict");
const { ageMinutes, classifyKey, summarizeStates } = require("./ice-v2-health");

test("classifies ICE v2 collector keys", () => {
  assert.equal(classifyKey("ice-v2:official_agency:icegov"), "official");
  assert.equal(classifyKey("ice-v2:official_office:whitehouse"), "official");
  assert.equal(classifyKey("ice-v2:newsroom:reuters"), "newsroom");
});

test("calculates source age", () => {
  const now = new Date("2026-07-14T12:30:00Z");
  assert.equal(ageMinutes("2026-07-14T12:00:00Z", now), 30);
  assert.equal(ageMinutes(null, now), null);
});

test("reports failed and stale sources", () => {
  const now = new Date("2026-07-14T12:30:00Z");
  const result = summarizeStates([
    { query_key: "ice-v2:official_agency:icegov", last_success_at: "2026-07-14T12:25:00Z", last_error: null },
    { query_key: "ice-v2:newsroom:reuters", last_success_at: "2026-07-14T11:00:00Z", last_error: null },
    { query_key: "ice-v2:official_office:whitehouse", last_success_at: "2026-07-14T12:20:00Z", last_error: "rate limited" }
  ], 30, now);
  assert.equal(result.status, "failed");
  assert.equal(result.groups.official.healthy, 1);
  assert.equal(result.groups.official.failed, 1);
  assert.equal(result.groups.newsroom.stale, 1);
});

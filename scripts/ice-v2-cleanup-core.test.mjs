import test from "node:test";
import assert from "node:assert/strict";
import { cleanupDecision, cleanupPatch, summarizeCleanup } from "./ice-v2-cleanup-core.mjs";

const policy = {
  sources: [
    { handle: "ICEgov", enabled: true, verified: true },
    { handle: "Reuters", enabled: true, verified: true }
  ]
};

test("keeps ICE v2 records", () => {
  assert.equal(cleanupDecision(policy, { source_username: "RandomBlog", raw_payload: { collector: "ice-v2" } }).action, "keep");
});

test("excludes personal and discovered sources", () => {
  assert.equal(cleanupDecision(policy, { source_username: "SomeBlogger", source_type: "discovered_individual" }).action, "exclude");
  assert.equal(cleanupDecision(policy, { source_username: "SomeBlogger", source_type: "commentator" }).action, "exclude");
});

test("keeps legacy rows only when source is whitelisted", () => {
  assert.equal(cleanupDecision(policy, { source_username: "ICEgov", source_type: "official" }).action, "keep");
  assert.equal(cleanupDecision(policy, { source_username: "Reuters", source_type: "major_media" }).action, "keep");
  assert.equal(cleanupDecision(policy, { source_username: "UnknownMedia", source_type: "major_media" }).action, "exclude");
});

test("cleanup patch hides but does not delete source evidence", () => {
  assert.deepEqual(cleanupPatch("source_not_in_v2_whitelist"), {
    relevant: false,
    processing_status: "irrelevant",
    last_error: "ice_v2_cleanup:source_not_in_v2_whitelist"
  });
});

test("summarizes cleanup decisions", () => {
  const summary = summarizeCleanup([
    { source_username: "ICEgov", source_type: "official" },
    { source_username: "BadBlog", source_type: "blogger" }
  ], policy);
  assert.equal(summary.scanned, 2);
  assert.equal(summary.keep, 1);
  assert.equal(summary.exclude, 1);
});

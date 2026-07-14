import test from "node:test";
import assert from "node:assert/strict";
import { classifyMainChange, assertProtectedSubmissionPolicy } from "./ice-v2-main-sync-policy.mjs";

test("blocks direct replacement of protected user report files", () => {
  assert.equal(classifyMainChange("admin/ice-review-v2.js").action, "manual_merge");
  assert.equal(classifyMainChange("netlify/functions/ice-report-editor.js").action, "manual_merge");
});

test("allows ICE statistics files only after testing", () => {
  assert.equal(classifyMainChange("topic/ice/ice-stats-enhanced.js").action, "sync_after_test");
});

test("accepts original-submission protection wording", () => {
  assert.equal(assertProtectedSubmissionPolicy("用户投稿完全绕过AI，按数据库原文审核发布。"), true);
});

test("rejects administrator rewrite logic", () => {
  assert.throws(() => assertProtectedSubmissionPolicy("用户投稿可由管理员编辑后发布。"), /违反用户投稿原文保护/);
  assert.throws(() => assertProtectedSubmissionPolicy("const title = input.title || report.admin_title;"), /违反用户投稿原文保护/);
});

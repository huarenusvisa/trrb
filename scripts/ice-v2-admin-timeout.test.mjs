import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../admin/ice-review-v2.js", import.meta.url), "utf8");

test("uses AbortController for ICE v2 admin requests", () => {
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(source, /响应超时，请刷新后重试/);
});

test("keeps user submission original-content protection", () => {
  assert.match(source, /用户投稿完全绕过AI，按数据库原文审核发布/);
  assert.doesNotMatch(source, /用户投稿可由管理员编辑后发布/);
  assert.doesNotMatch(source, /input\.title\s*\|\|\s*report\.admin_title/);
});

test("keeps manual publication decision", () => {
  assert.match(source, /人工立即发布/);
  assert.match(source, /法律风险及是否发布由工作人员最终判断/);
});

import fs from "node:fs";

const protectedFiles = new Map([
  ["admin/ice-review-v2.js", "ICE v2审核与用户投稿原文保护存在语义冲突，禁止直接采用main版本"],
  ["admin/ice-report-raw-lock.js", "用户投稿原文锁定文件，禁止被允许管理员改写的版本覆盖"],
  ["netlify/functions/ice-report-editor.js", "允许编辑投稿标题正文，违反当前原文保留约定"],
  ["netlify/functions/ice-report-admin.js", "发布路径必须继续以数据库原始投稿为唯一内容来源"]
]);

const safeFiles = new Set([
  "topic/ice/ice-stats-enhanced.js",
  "topic/ice/ice-stats-guard.js",
  "topic/ice/index.html"
]);

export function classifyMainChange(path) {
  const value = String(path || "");
  if (protectedFiles.has(value)) return { action: "manual_merge", reason: protectedFiles.get(value) };
  if (safeFiles.has(value)) return { action: "sync_after_test", reason: "与采集发布链路解耦，可在测试后同步" };
  return { action: "review", reason: "未知改动必须人工审查，不能直接覆盖测试分支" };
}

export function assertProtectedSubmissionPolicy(source) {
  const text = String(source || "");
  const forbidden = [
    /用户投稿可由管理员编辑后发布/,
    /input\.title\s*\|\|\s*report\.admin_title/,
    /input\.content\s*\|\|\s*report\.admin_content/,
    /suggested_title/
  ];
  const hits = forbidden.filter((pattern) => pattern.test(text)).map(String);
  if (hits.length) throw new Error(`检测到违反用户投稿原文保护的逻辑：${hits.join("；")}`);
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("ice-v2-main-sync-policy.mjs")) {
  const reviewFile = fs.readFileSync(new URL("../admin/ice-review-v2.js", import.meta.url), "utf8");
  assertProtectedSubmissionPolicy(reviewFile);
  console.log("ICE v2 main同步保护策略检查通过");
}

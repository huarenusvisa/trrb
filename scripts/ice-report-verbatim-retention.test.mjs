import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const check = (file) => execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });

test("ICE用户投稿标题摘要正文全部来自数据库原文", () => {
  const backend = read("netlify/functions/ice-report-integrated.js");
  const lock = read("admin/ice-report-raw-lock.js");

  check("netlify/functions/ice-report-integrated.js");
  check("admin/ice-report-raw-lock.js");

  assert.match(backend, /function publicationTitle\(report\) \{\s*return originalSubmission\(report\);\s*\}/s);
  assert.match(backend, /title: publicationTitle\(report\)/);
  assert.match(backend, /summary: content/);
  assert.match(backend, /content,/);
  assert.match(backend, /admin_title: editorial\.title/);
  assert.match(backend, /original_title_locked: true/);
  assert.doesNotMatch(backend, /return `\$\{location\}ICE现场投稿`/);

  assert.match(lock, /用户原始标题（原样发布，只读）/);
  assert.match(lock, /AI与管理员都不能生成、改写、删减或补充用户原文/);
  assert.doesNotMatch(lock, /依据用户填写地点自动生成/);
});

test("超过12小时且从未审核的draft投稿自动删除", () => {
  const cleanup = read("scripts/ice-report-expire-unreviewed.mjs");
  const workflow = read(".github/workflows/ice-report-expire-unreviewed.yml");

  check("scripts/ice-report-expire-unreviewed.mjs");

  assert.match(cleanup, /const RETENTION_HOURS = 12/);
  assert.match(cleanup, /status: "eq\.draft"/);
  assert.match(cleanup, /reviewed_at: "is\.null"/);
  assert.match(cleanup, /created_at: `lt\.\$\{cutoffIso\(\)\}`/);
  assert.match(cleanup, /method: "DELETE"/);
  assert.match(cleanup, /ice_report_upload_tokens/);
  assert.match(cleanup, /ice_user_reports/);
  assert.match(cleanup, /storage\/v1\/object/);

  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow, /node scripts\/ice-report-expire-unreviewed\.mjs/);
});

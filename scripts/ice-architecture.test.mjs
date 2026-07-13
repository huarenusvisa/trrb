import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("ICE信源为50至100个且不重复", () => {
  const rows = JSON.parse(read("data/ice-source-registry.json"));
  assert.ok(rows.length >= 50 && rows.length <= 100, `count=${rows.length}`);
  const names = rows.map((row) => row.username.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("成本控制、多信源和80分门槛存在", () => {
  const text = read("scripts/ice-multisource.mjs");
  assert.match(text, /source_registry/);
  assert.match(text, /ice_story_evidence/);
  assert.match(text, /independent_source_count/);
  assert.match(text, /ICE_AUTO_PUBLISH_SCORE/);
  assert.match(text, /ICE_MONTHLY_X_POST_READ_CAP/);
  assert.match(text, /selectQueriesForRun/);
  assert.match(text, /max_results", "10"/);
  assert.doesNotMatch(text, /data\/ice-live\.json/);
  assert.doesNotMatch(text, /git push/);
});

test("非官方内容必须进入人工审核", () => {
  const collector = read("scripts/ice-multisource.mjs");
  const publisher = read("scripts/ice-publish-due.mjs");
  assert.match(collector, /非官方内容即使达到80分/);
  assert.match(collector, /human_review_status/);
  assert.match(collector, /humanReviewStatus = "required"/);
  assert.match(publisher, /humanApproved/);
  assert.match(publisher, /!officialEligible && !humanApproved/);
});

test("trrb.net/admin包含ICE审核中心", () => {
  const html = read("admin/index.html");
  const js = read("admin/admin.js");
  const css = read("admin/styles.css");
  assert.match(html, /ICE人工审核中心/);
  assert.match(html, /data-review-action="approve"/);
  assert.match(html, /data-review-action="publish_now"/);
  assert.match(js, /\/\.netlify\/functions\/ice-review/);
  assert.match(js, /loadReviewQueue/);
  assert.match(css, /\.review-modal/);
});

test("审核API仅在服务端使用service role并验证管理员", () => {
  const fn = read("netlify/functions/ice-review.js");
  assert.match(fn, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(fn, /admin_users/);
  assert.match(fn, /auth\/v1\/user/);
  assert.match(fn, /approvalEligibility/);
  assert.doesNotMatch(read("admin/admin.js"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("SQL包含人工审核字段和审计日志", () => {
  const sql = read("SUPABASE-ICE-MULTISOURCE.sql");
  assert.match(sql, /human_review_status/);
  assert.match(sql, /ice_review_logs/);
  assert.match(sql, /original_ai_title/);
  assert.match(sql, /final_content/);
  assert.match(sql, /revoke all on table public\.ice_review_logs from anon, authenticated/);
});

test("抓取和前端发布已经分离", () => {
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-multisource.mjs")));
  assert.ok(fs.existsSync(path.join(root, "scripts/ice-publish-due.mjs")));
  const workflow = read(".github/workflows/ice-auto-publish.yml");
  assert.match(workflow, /ice-multisource\.mjs/);
  assert.doesNotMatch(workflow, /git add -A/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
});

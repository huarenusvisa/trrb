import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("用户投稿审核融合到主后台", () => {
  const js = read("admin/ice-report-integrated.js");
  const css = read("admin/ice-report-integrated.css");
  const loader = read("admin/ice-review-v2.js");
  const redirect = read("admin/ice-report-review/index.html");
  const api = read("netlify/functions/ice-report-integrated.js");

  assert.match(js, /const PAGE = "ice-reports"/);
  assert.match(js, /用户投稿不进入AI/);
  assert.match(js, /人工立即发布/);
  assert.match(css, /grid-template-columns: 150px minmax\(0, 1fr\) 132px/);
  assert.match(loader, /ice-report-integrated\.js/);
  assert.match(redirect, /\/admin\/#ice-reports/);
  assert.match(api, /human_verified_user_report/);
  assert.match(api, /ai_intervention: false/);
  assert.match(api, /TRRB_OWNER_UID/);
  assert.match(api, /这个账号没有主后台管理权限/);
  assert.match(api, /sb_publishable_/);
});

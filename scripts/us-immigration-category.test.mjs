import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isUsImmigrationText } = require("../netlify/functions/_shared/us-immigration-category.js");
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("US immigration category accepts US immigration processes and BIA law", () => {
  const allowed = [
    ["K-1未婚夫签证完整办理说明", "申请人准备赴美结婚"],
    ["工卡与调整身份申请步骤", "I-765和I-485如何递交"],
    ["BIA判例：Matter of BEST", "移民上诉委员会解释入境资格"],
    ["Advance Parole旅行许可", "回美证与身份维持说明"],
    ["职业移民EB-2 NIW排期更新", "美国移民签证公告"]
  ];
  for (const [title, lead] of allowed) assert.equal(isUsImmigrationText(title, lead), true, title);
});

test("US immigration category rejects ICE enforcement and unrelated migration", () => {
  const rejected = [
    ["科罗拉多奥罗拉ICE疑似餐厅前拘捕两人", "ICE在餐厅前拘捕"],
    ["ICE执飞161人遣返海地航班", "从弗吉尼亚起飞"],
    ["美国国土安全部宣布加强遣返数百万非法移民", "推动遣返并要求离境"],
    ["美国终止临时保护身份政策涉数万人面临驱逐", "终止TPS后启动遣返"],
    ["驱逐令激增：多州移民家庭面临强制离境", "递解程序已经启动"],
    ["ICE宣布查获OPT项目诈骗案", "涉及一万名留学生"],
    ["海地接收首批161名TPS遣返者", "遣返航班抵达"],
    ["佐治亚州起诉非法取得公民身份者", "联邦刑事案件"],
    ["加拿大技术移民评分调整", "加拿大公布快速通道新分数"],
    ["警方拘捕餐厅盗窃嫌疑人", "普通刑事案件"],
    ["佛州警方破获假结婚骗绿卡诈骗案", "抓捕11人"],
    ["加州非法移民获释后涉嫌杀害男子", "普通刑事新闻"]
  ];
  for (const [title, lead] of rejected) assert.equal(isUsImmigrationText(title, lead), false, title);
});

test("ICE immediate publish writes the dedicated category", () => {
  const source = read("netlify/functions/ice-review-v2.js");
  assert.match(source, /category_name: "ICE执法动态"/);
  assert.doesNotMatch(source, /category_name: "移民美国"/);
});

test("database firewall reroutes ICE and blocks unrelated published rows", () => {
  const source = read("supabase/migrations/20260822150000_enforce_us_immigration_category_only.sql");
  assert.match(source, /new\.category_name = '移民美国'/);
  assert.match(source, /new\.category_name = 'ICE执法动态'|new\.category_name := target\.name/);
  assert.match(source, /errcode = '23514'/);
  assert.match(source, /immigration_text := article_text/);
  assert.match(source, /non_process_event/);
  assert.match(source, /set search_path = ''/);
  assert.match(source, /as \$\$\s*\ndeclare/);
  assert.doesNotMatch(source, /as \$\s*\ndeclare/);
  assert.match(source, /\[\^A-Za-z\]\)ICE/);
});

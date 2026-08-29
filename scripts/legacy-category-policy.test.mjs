import assert from "node:assert/strict";
import { resolveLegacyDisposition } from "./legacy-category-policy.mjs";

assert.deepEqual(resolveLegacyDisposition({ category: "中国官场", title: "旧闻" }), {
  action: "publish", targetCategory: "中国热门头条", reason: "retired-china-category"
});
assert.equal(resolveLegacyDisposition({ category: "热门头条", title: "中国社会新闻" }).targetCategory, "中国热门头条");
assert.equal(resolveLegacyDisposition({ category: "庇护百科", title: "庇护申请说明" }).targetCategory, "移民美国");
assert.equal(resolveLegacyDisposition({ category: "驱逐快报", title: "ICE抓捕行动" }).action, "manual_review");
assert.equal(resolveLegacyDisposition({ category: "移民美国", title: "ICE特工拘留移民" }).action, "manual_review");
assert.equal(resolveLegacyDisposition({ category: "移民美国", title: "亲属移民绿卡申请流程" }).action, "publish");
assert.equal(resolveLegacyDisposition({ category: "移民美国", title: "黄仁勋谈创业经历" }).action, "manual_review");
assert.equal(resolveLegacyDisposition({ category: "纽约华人律师事务所", title: "律师目录" }).action, "retire");
assert.equal(resolveLegacyDisposition({ category: "不存在的栏目", title: "测试" }).action, "unknown");
assert.equal(resolveLegacyDisposition({
  category: "旧测试栏目",
  title: "测试",
  overrides: new Map([["旧测试栏目", "重要新闻"]])
}).targetCategory, "重要新闻");

console.log("legacy category policy tests passed");

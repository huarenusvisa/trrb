import test from "node:test";
import assert from "node:assert/strict";
import helper from "../netlify/functions/_shared/ice-review-list.js";

const { prepareStories, keywords, sameEvent, firstSentence } = helper;

test("关键词集合可以识别同一ICE事件", () => {
  const a = { text: "ICE Baltimore arrested Walter Barahona Mejia, an MS-13 member with a final order of removal.", words: keywords("ICE Baltimore arrested Walter Barahona Mejia, an MS-13 member with a final order of removal."), event_type: "arrest", state_code: "MD", event_date: "2026-07-10" };
  const b = { text: "ERO Baltimore arrests Walter Barahona Mejia. The Salvadoran MS-13 member had a final removal order.", words: keywords("ERO Baltimore arrests Walter Barahona Mejia. The Salvadoran MS-13 member had a final removal order."), event_type: "arrest", state_code: "MD", event_date: "2026-07-10" };
  assert.equal(sameEvent(a, b), true);
});

test("不同地点事件不会被错误合并", () => {
  const a = { text: "ICE arrested a fugitive in Baltimore", words: keywords("ICE arrested a fugitive in Baltimore"), event_type: "arrest", state_code: "MD", event_date: "2026-07-10" };
  const b = { text: "ICE arrested a fugitive in Chicago", words: keywords("ICE arrested a fugitive in Chicago"), event_type: "arrest", state_code: "IL", event_date: "2026-07-10" };
  assert.equal(sameEvent(a, b), false);
});

test("收集中新闻直接进入待人工审核且无图也保留标题正文", () => {
  const stories = [{ id: "1", event_fingerprint: "abc", event_type: "arrest", status: "collecting", title: "", summary: "", content: "", cover_image: "", official_source_count: 1 }];
  const posts = new Map([["abc", { source_text: "ICE Baltimore announced an arrest involving a final order of removal.", source_username: "EROBaltimore", media: [] }]]);
  const output = prepareStories(stories, posts);
  assert.equal(output.length, 1);
  assert.equal(output[0].status, "pending_review");
  assert.equal(output[0].human_review_status, "required");
  assert.equal(output[0].cover_image, "");
  assert.ok(output[0].title.length > 0);
  assert.ok(output[0].content.includes("ICE Baltimore"));
});

test("重复候选只显示一条并记录合并数量", () => {
  const stories = [
    { id: "1", event_fingerprint: "a", event_type: "arrest", status: "pending_review", title: "ICE Baltimore arrested Walter Barahona Mejia", summary: "MS-13 member with final removal order", content: "", cover_image: "", official_source_count: 1 },
    { id: "2", event_fingerprint: "b", event_type: "arrest", status: "collecting", title: "ERO Baltimore arrests Walter Barahona Mejia", summary: "Salvadoran MS-13 member had final order of removal", content: "", cover_image: "", official_source_count: 1 }
  ];
  const posts = new Map([
    ["a", { source_text: "ICE Baltimore arrested Walter Barahona Mejia, MS-13 member with final removal order.", state_code: "MD", event_date: "2026-07-10", media: [] }],
    ["b", { source_text: "ERO Baltimore arrests Walter Barahona Mejia. MS-13 member had a final order of removal.", state_code: "MD", event_date: "2026-07-10", media: [] }]
  ]);
  const output = prepareStories(stories, posts);
  assert.equal(output.length, 1);
  assert.equal(output[0].duplicate_count, 1);
});

test("标题从原始正文截取", () => {
  assert.ok(firstSentence("ICE reported an arrest. More details follow.").startsWith("ICE reported"));
});

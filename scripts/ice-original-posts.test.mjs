import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  referencedReply,
  startsAsReply,
  isReplyOrComment
} from "./ice-filter-replies.mjs";
import {
  hasChinese,
  chineseRatio,
  needsTranslation,
  targetLength
} from "./ice-translate-title-body.mjs";

test("X referenced_tweets replied_to is rejected", () => {
  assert.equal(referencedReply({ referenced_tweets: [{ type: "replied_to", id: "1" }] }), true);
  assert.equal(referencedReply({ referenced_tweets: [{ type: "quoted", id: "1" }] }), false);
});

test("text beginning with mentions is treated as a reply or comment", () => {
  assert.equal(startsAsReply("@samstein @PressHerald Don’t want to be shot by ICE?"), true);
  assert.equal(startsAsReply("ICE announced a new enforcement operation."), false);
});

test("post filter accepts original posts and rejects replies", () => {
  assert.equal(isReplyOrComment({ source_text: "@user This is a reply", raw_payload: {} }), true);
  assert.equal(isReplyOrComment({ source_text: "Now it is in Maine.", raw_payload: { tweet: { referenced_tweets: [] } } }), false);
  assert.equal(isReplyOrComment({ source_text: "Original post", raw_payload: { tweet: { referenced_tweets: [{ type: "replied_to" }] } } }), true);
});

test("Chinese detector distinguishes translated and English content", () => {
  assert.equal(hasChinese("ICE在缅因州通报一起执法事件"), true);
  assert.equal(hasChinese("ICE reported an enforcement event"), false);
  assert.ok(chineseRatio("ICE在缅因州通报一起执法事件") > 0.45);
});

test("English or overly short story requires Chinese title and body generation", () => {
  assert.equal(needsTranslation({ title: "Now it is in Maine", content: "ICE reported a shooting.", ai_payload: {} }), true);
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法枪击事件", content: "ICE表示，执法人员执行最终驱逐令期间，一名男子驾车试图逃离现场。", ai_payload: {} }, 100, 0), true);
  const body = "据ICE发布的信息，" + "执法人员在现场核对身份并说明行动安排。".repeat(16);
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法行动事件", content: body, ai_payload: { translation_version: "zh-title-body-v4-300-800-image", translated_to_chinese: true, old_news_checked: true, target_min_chars: 300, target_max_chars: 360 } }, 100, 0), false);
});

test("ICE source length maps to mandatory Chinese article length", () => {
  assert.deepEqual(targetLength(299), { min: 300, max: 360, band: "300字" });
  assert.deepEqual(targetLength(300), { min: 500, max: 800, band: "500-800字" });
});

test("ICE publisher hard-gates Chinese length, image reading, duplicate and old-news checks", () => {
  const source = fs.readFileSync(new URL("./ice-publish-due.mjs", import.meta.url), "utf8");
  const translator = fs.readFileSync(new URL("./ice-translate-title-body.mjs", import.meta.url), "utf8");
  const manualPublish = fs.readFileSync(new URL("../netlify/functions/ice-review-v2.js", import.meta.url), "utf8");
  const manualApprove = fs.readFileSync(new URL("../netlify/functions/ice-review-actions-v4.js", import.meta.url), "utf8");
  assert.match(source, /zh-title-body-v4-300-800-image/);
  assert.match(source, /image_grounding_used/);
  assert.match(source, /old_news_checked/);
  assert.match(source, /recentSimilarArticle/);
  assert.match(translator, /minLength: schemaMin/);
  assert.match(translator, /maxLength: target\.max/);
  assert.match(manualPublish, /assertEditorialReady/);
  assert.match(manualApprove, /assertEditorialReady/);
});

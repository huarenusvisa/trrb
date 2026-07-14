import test from "node:test";
import assert from "node:assert/strict";
import {
  referencedReply,
  startsAsReply,
  isReplyOrComment
} from "./ice-filter-replies.mjs";
import {
  hasChinese,
  chineseRatio,
  needsTranslation
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
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法枪击事件", content: "ICE表示，执法人员执行最终驱逐令期间，一名男子驾车试图逃离现场，事件造成一人死亡。有关部门已启动调查，具体经过仍待官方进一步通报。", ai_payload: {} }), false);
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法枪击事件", content: "ICE表示，执法人员执行最终驱逐令期间，一名男子驾车试图逃离现场，事件造成一人死亡。有关部门已启动调查，具体经过仍待官方进一步通报。", ai_payload: { translation_version: "zh-title-body-v1" } }), false);
});

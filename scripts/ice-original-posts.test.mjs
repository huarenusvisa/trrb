import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  referencedReply,
  startsAsReply,
  isReplyOrComment
} from "./ice-filter-replies.mjs";
import {
  hasChinese,
  chineseRatio,
  chineseCharCount,
  needsTranslation,
  fitTitle,
  editorialBand,
  schemaFor,
  translate,
  patchStory
} from "./ice-translate-title-body.mjs";
import { editorialReady as publisherReady } from "./ice-publish-due.mjs";
import { editorialReady as promoterReady, blocksAutomaticPublish } from "./ice-trusted-source-promote.mjs";
import manualPublish from "../netlify/functions/ice-review-v2.js";
import manualApprove from "../netlify/functions/ice-review-actions-v4.js";
import { clampBulletin, clampTitle, hasSavedChineseEditorial, looksNormalized } from "./ice-editorial-normalize.mjs";

import {EDITORIAL_POLICY_VERSION,ICE_TRANSLATION_VERSION,DEEP_REVIEW_FIELDS,contentDigest} from './news-editorial-policy.mjs';
const passingReview=Object.fromEntries(['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct','fresh_event','image_grounded',...DEEP_REVIEW_FIELDS].map(k=>[k,true]));
function reviewed(story) { const n=chineseCharCount(story.content); return {...story,ai_payload:{...story.ai_payload,translation_version:ICE_TRANSLATION_VERSION,editorial_policy_version:EDITORIAL_POLICY_VERSION,editorial_depth:n<800?'brief':'standard',editorial_review:passingReview,reviewed_content_sha256:contentDigest(story.title,story.content)}}; }
const checkedPayload = { translation_version: "zh-title-body-v10-official-context-flex-300-1500", translated_to_chinese: true, old_news_checked: true, manual_old_news_confirmation: true, appears_old_news: false };
const shortStory = { title: "ICE通报", content: "ICE通报在纽约拘捕一人。", ai_payload: checkedPayload };


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

test("untranslated or unchecked stories require Chinese editorial processing", () => {
  assert.equal(needsTranslation({ title: "Now it is in Maine", content: "ICE reported a shooting.", ai_payload: {} }), true);
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法枪击事件", content: "ICE表示，执法人员执行最终驱逐令期间，一名男子驾车试图逃离现场。", ai_payload: {} }, 100, 0), true);
  const body = "据ICE发布的信息，" + "执法人员在现场核对身份并说明行动安排。".repeat(16);
  assert.equal(needsTranslation({ title: "缅因州发生ICE执法行动事件", content: body, ai_payload: { translation_version: "zh-title-body-v7-300-600-800-context-image", translated_to_chinese: true, old_news_checked: true, target_min_chars: 300, target_max_chars: 600 } }, 100, 0), true);
});

test("reviewed Chinese articles pass their actual brief or standard band", () => {
  for (const content of ["据ICE通报，执法人员在纽约拘捕一名等待递解人员并说明行动安排。".repeat(25), "据ICE通报，执法人员在纽约拘捕一名等待递解人员并说明行动安排。".repeat(55)]) {
    const story = reviewed({ ...shortStory, content });
    assert.equal(needsTranslation(story, 10, 0), false);
    assert.equal(needsTranslation({ ...story, ai_payload: { ...checkedPayload, translation_version: "zh-title-body-v7-300-600-800-context-image", target_min_chars: 500, target_max_chars: 800 } }, 900, 0), true);
    assert.equal(publisherReady(story, {}), true);
    assert.equal(promoterReady(story, []), true);
    assert.doesNotThrow(() => manualPublish.assertEditorialReady(story, story.title, content));
    assert.doesNotThrow(() => manualApprove.assertEditorialReady(story, story));
  }
  assert.equal(fitTitle("ICE通报"), "ICE通报");
  const longTitle = "ICE通报纽约执法详情".repeat(30);
  assert.equal(fitTitle(longTitle), longTitle);
});

test("empty, English, old-news and unreviewed-image stories remain blocked", () => {
  for (const story of [
    { ...shortStory, title: "" },
    { ...shortStory, content: " " },
    { ...shortStory, content: "ICE announced an arrest." },
    { ...shortStory, ai_payload: { ...checkedPayload, old_news_checked: false, manual_old_news_confirmation: false } },
    { ...shortStory, ai_payload: { ...checkedPayload, appears_old_news: true } },
    { ...shortStory, ai_payload: { ...checkedPayload, image_count: 1, image_grounding_used: false } }
  ]) {
    const evidence = story.ai_payload.image_count ? [{ media: [{ url: "https://example.com/evidence.jpg" }] }] : [];
    assert.equal(publisherReady(story, evidence[0] || {}), false);
    assert.equal(promoterReady(story, evidence), false);
    assert.throws(() => manualPublish.assertEditorialReady(story, story.title, story.content));
    assert.throws(() => manualApprove.assertEditorialReady(story, story));
  }
  const unrelated = { ...shortStory, title: "天气预报", content: "纽约明天有雨。" };
  assert.throws(() => manualPublish.assertEditorialReady(unrelated, unrelated.title, unrelated.content), /不是明确的ICE/);
  assert.throws(() => manualApprove.assertEditorialReady(unrelated, unrelated), /不是明确的ICE/);
});

test("translation writes a factual brief and separately reviews it without padding", async (t) => {
  const content="据ICE通报，执法人员在纽约拘捕一人，案件仍在处理中。";
  let requests=0;
  t.mock.method(globalThis,"fetch",async (_url,options)=>{
    requests++;
    const body=JSON.parse(options.body);
    if(body.text?.format?.name==='unified_news_review')return Response.json({output_text:JSON.stringify(passingReview)});
    assert.match(body.instructions,/2500至3500/);
    return Response.json({output_text:JSON.stringify({title:shortStory.title,content,summary:content,source_sufficient:true,editorial_depth:'brief',depth_reason:'单一官方事件，资料只支持短讯',source_language:'en',image_observations:'',appears_old_news:false,old_news_reason:''})});
  });
  const article=await translate(shortStory,[{source_text:'ICE arrested one person in New York.'}]);
  assert.equal(article.content,content);assert.equal(article.editorial_depth,'brief');assert.equal(requests,2);
});

test("translation persistence records pure Chinese count and automatic old-news check", async (t) => {
  const originalUrl = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = "https://example.com";
  t.after(() => { if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl; });
  let written;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    written = JSON.parse(options.body);
    return Response.json([{id:"saved"}]);
  });
  const title = "ICE通报纽约执法详情".repeat(30);
  const content = "ICE通报在纽约核对身份并说明行动安排。".repeat(35);
  await patchStory(shortStory, { title, content, summary: "执法通报", sourceLength: 60, imageCount: 0,editorial_depth:"brief",editorial_review:passingReview,targetMin:1,targetMax:799 }, [{}]);
  assert.equal(written.title, title);
  assert.equal(written.content, content);
  assert.equal(written.ai_payload.target_min_chars, 1);
  assert.equal(written.ai_payload.target_max_chars, 799);
  assert.equal(written.ai_payload.body_chinese_character_count, chineseCharCount(content));
  assert.equal(written.ai_payload.old_news_checked, true);
  assert.equal(written.ai_payload.automatic_old_news_check_passed, true);
  assert.equal(written.ai_payload.manual_old_news_confirmation, false);
  await assert.rejects(() => patchStory(shortStory, { title, content: " " }, [{}]), /非空中文/);
});

test("tier-one ICE or DHS evidence may use automatic old-news confirmation but other sources may not", () => {
  const content = "据ICE通报，执法人员在纽约核对身份并说明行动安排。".repeat(32);
  const story = reviewed({ title: "纽约ICE执法通报", content, ai_payload: { translation_version: "zh-title-body-v10-official-context-flex-300-1500", translated_to_chinese: true, old_news_checked: true, automatic_old_news_check_passed: true, manual_old_news_confirmation: false, appears_old_news: false } });
  const official = { source_type: "official", source_username: "ICEgov", trust_tier: 1, source_text: "ICE announced an immigration arrest in New York." };
  const unverified = { ...official, trust_tier: 2 };
  assert.equal(promoterReady(story, [official]), true);
  assert.equal(publisherReady(story, official), true);
  assert.equal(promoterReady(story, [unverified]), false);
  assert.equal(publisherReady(story, unverified), false);
  assert.equal(blocksAutomaticPublish({ conflict_detected: true, privacy_risk: true, fabrication_risk: true }, story.ai_payload, true), true);
  assert.equal(blocksAutomaticPublish({ conflict_detected: true }, story.ai_payload, false), true);
  assert.equal(blocksAutomaticPublish({}, { ...story.ai_payload, appears_old_news: true }, true), true);
});

test("brief normalization does not pad, truncate or reprocess valid Chinese text by length", () => {
  const short = "纽约ICE拘捕一人。";
  const long = short.repeat(100);
  assert.equal(clampBulletin(short), short);
  assert.equal(clampBulletin(long), long);
  assert.equal(clampBulletin(""), "");
  assert.equal(clampTitle("ICE通报"), "ICE通报");
  assert.equal(clampTitle(long.slice(0, -1)), long.slice(0, -1));
  for (const content of [short, long]) {
    assert.equal(hasSavedChineseEditorial({ final_title: "ICE通报", final_content: content }), true);
    assert.equal(looksNormalized({ title: "ICE通报", content, ai_payload: { editorial_version: "zh-brief-v2", location_text: "纽约" } }), true);
  }
  assert.equal(hasSavedChineseEditorial({ final_title: "ICE通报", final_content: "" }), false);
});

test("ICE publisher retains image reading, duplicate and old-news checks", () => {
  const source = fs.readFileSync(new URL("./ice-publish-due.mjs", import.meta.url), "utf8");
  const translator = fs.readFileSync(new URL("./ice-translate-title-body.mjs", import.meta.url), "utf8");
  const manualPublish = fs.readFileSync(new URL("../netlify/functions/ice-review-v2.js", import.meta.url), "utf8");
  const manualApprove = fs.readFileSync(new URL("../netlify/functions/ice-review-actions-v4.js", import.meta.url), "utf8");
  const promoter = fs.readFileSync(new URL("./ice-trusted-source-promote.mjs", import.meta.url), "utf8");
  assert.match(source, /zh-title-body-v7-300-600-800-context-image/);
  assert.match(source, /image_grounding_used/);
  assert.match(source, /old_news_checked/);
  assert.match(source, /recentSimilarArticle/);
  assert.doesNotMatch(translator, /minLength|maxLength/);
  assert.match(translator, /VERIFIED_ICE_EDITORIAL_CONTEXT/);
  assert.match(translator, /verified_editorial_background/);
  assert.match(translator, /国籍只可在信源明确记载时写入/);
  assert.match(translator, /不能用模型记忆补写/);
  assert.doesNotMatch(translator, /story\.reviewed_at \|\|/);
  assert.match(translator, /attempt < 1/);
  assert.match(manualPublish, /assertEditorialReady/);
  assert.match(manualPublish, /payload\.manual_old_news_confirmation !== true/);
  assert.match(manualPublish, /payload\.image_grounding_used !== true/);
  assert.match(manualPublish, /patchPublishedArticle\(articleId/);
  assert.match(manualApprove, /assertEditorialReady/);
  assert.match(manualApprove, /payload\.manual_old_news_confirmation !== true/);
  assert.match(manualApprove, /payload\.image_grounding_used !== true/);
  assert.match(promoter, /zh-title-body-v7-300-600-800-context-image/);
  assert.match(promoter, /isIceEnforcementText/);
  assert.match(source, /isIceEnforcementText/);
  assert.match(manualPublish, /isIceEnforcementText/);
  assert.match(manualApprove, /isIceEnforcementText/);
});

test("ICE后台审核只保留一个前端请求入口和一个发布接口", () => {
  const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const admin = fs.readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
  const featureModules = [
    "admin-stability-v3.js",
    "admin-publisher-v2.js",
    "ice-report-integrated.js",
    "ice-report-controls-v2.js"
  ].map((name) => fs.readFileSync(new URL(`../admin/${name}`, import.meta.url), "utf8")).join("\n");
  const router = fs.readFileSync(new URL("../netlify/functions/ice-review.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /ice-review-v2\.js/);
  assert.match(admin, /fetch\("\/\.netlify\/functions\/ice-review"/);
  assert.equal((admin.match(/async function reviewApi\s*\(/g) || []).length, 1);
  assert.doesNotMatch(featureModules, /reviewApi\s*=/);
  assert.doesNotMatch(featureModules, /window\.fetch\s*=/);
  assert.doesNotMatch(featureModules, /(?:window\.)?showPage\s*=(?!=)/);
  assert.match(router, /action === 'publish_now'/);
});


test("admin approval accepts short and long articles while enforcing nonempty and review confirmations", async () => {
  const source = fs.readFileSync(new URL("../admin/admin.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function handleReviewAction(action)"), source.indexOf("function generateSummary(content"));
  let confirmations = 0;
  const elements = {
    "review-title": { value: "ICE通报", focus() {} },
    "review-content": { value: shortStory.content, focus() {} },
    "review-action-message": { textContent: "" },
    "review-not-old": { checked: true, focus() {} },
    "review-image-reviewed": { disabled: false, checked: true, focus() {} }
  };
  const context = vm.createContext({ activeReview: { story: { id: "sample" } }, el: (id) => elements[id], window: { confirm() { confirmations += 1; return false; } } });
  vm.runInContext(handler, context);
  for (const content of [shortStory.content, shortStory.content.repeat(3000)]) {
    elements["review-content"].value = content;
    await context.handleReviewAction("approve");
    await context.handleReviewAction("publish_now");
  }
  assert.equal(confirmations, 4);
  elements["review-content"].value = " ";
  await context.handleReviewAction("approve");
  assert.equal(confirmations, 4);
  assert.match(elements["review-action-message"].textContent, /不能为空/);
  elements["review-content"].value = shortStory.content;
  elements["review-not-old"].checked = false;
  await context.handleReviewAction("approve");
  assert.equal(confirmations, 4);
  assert.match(elements["review-action-message"].textContent, /不是旧闻/);
  elements["review-not-old"].checked = true;
  elements["review-image-reviewed"].checked = false;
  await context.handleReviewAction("publish_now");
  assert.equal(confirmations, 4);
  assert.match(elements["review-action-message"].textContent, /核对图片/);
});

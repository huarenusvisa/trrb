#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCandidate, buildChrtRecord, buildPublishedArticle, buildReviewDraft, containsBoilerplate, qualifyTweet, similarity, targetLength } from "./china-hot-li-teacher-ingest.mjs";

const chinaTweet = {
  id: "123", created_at: "2026-08-23T08:00:00.000Z", lang: "zh",
  text: "8月23日，重庆市一所中学发布通知，因持续高温天气调整开学安排。当地教育部门表示将根据天气情况继续评估。",
  public_metrics: { like_count: 20 }, media: [],
};

test("中国新闻及中国政治人物内容进入中国热门头条池", () => {
  const result = qualifyTweet(chinaTweet);
  assert.equal(result.accepted, true);
  assert.equal(qualifyTweet({ id: "politics", text: "中央纪委国家监委通报，一名省级官员因严重违纪违法接受纪律审查和监察调查，相关程序正在进行。具体调查结果仍以官方后续公布为准。" }).accepted, true);
  const candidate = buildCandidate(chinaTweet, result, "2026-08-23T09:00:00.000Z");
  assert.equal(candidate.proposed_section, "中国热门头条");
  assert.equal(candidate.decision, "processing");
  assert.equal(candidate.pipeline, "china-hot-li-teacher-v2");
});

test("不足300字扩写到300字以上，原文已足300字则不强迫扩成800字", () => {
  assert.deepEqual(targetLength("短文"), { min: 300, max: 650, band: "short" });
  assert.deepEqual(targetLength("中".repeat(300)), { min: 300, max: 650, band: "source-led" });
});

test("识别并阻止提醒、呼吁和宣传式凑字", () => {
  assert.equal(containsBoilerplate("画面显示路口停有两辆救护车，店铺招牌位于道路北侧。"), false);
  assert.equal(containsBoilerplate("警方提醒公众提高警惕，增强自我保护意识。"), true);
  assert.equal(containsBoilerplate("该事件凸显了加强公共安全的必要性。"), true);
  assert.equal(containsBoilerplate("书架显示视频制作者知识储备丰富，增强了说服力。"), true);
  assert.equal(containsBoilerplate("关键词：重庆 现场 新闻"), true);
  assert.equal(containsBoilerplate("seo_keywords: 湖北, 高三, 补课"), true);
  assert.equal(containsBoilerplate("该企业是知名大型央企。"), true);
  assert.equal(containsBoilerplate("视频中的声音昭示爆炸过程可能涉及多次燃爆。"), true);
  assert.equal(containsBoilerplate("现场整体氛围紧张，环境整洁、设施完善。"), true);
});

test("中国热门头条按内容查重并执行旧闻门禁", () => {
  assert.ok(similarity("西藏吉隆县泥石流救援行动持续推进", "西藏吉隆泥石流灾区救援持续推进") > 0.4);
  const script = fs.readFileSync(new URL("./china-hot-li-teacher-ingest.mjs", import.meta.url), "utf8");
  assert.match(script, /appears_old_news/);
  assert.match(script, /old_news_checked: true/);
  assert.match(script, /duplicate_check_days: 30/);
  assert.match(script, /与近30天已发布中国热门头条重复/);
});

test("发布稿自动公开且不在前台暴露抓取来源", () => {
  const qualified = qualifyTweet(chinaTweet);
  const article = buildPublishedArticle(chinaTweet, qualified, { title: "重庆一所中学因高温调整开学安排", summary: "重庆当地一所中学发布通知，调整开学安排。", content: "正文".repeat(160), seo_keywords: "重庆,高温,开学", target: targetLength(qualified.text) }, "2026-08-23T09:00:00.000Z");
  assert.equal(article.status, "published");
  assert.equal(article.visibility, "public");
  assert.equal(article.metadata.automatic_publish, true);
  assert.equal(article.metadata.unverified_public_claim, true);
  assert.equal(article.metadata.public_source_attribution, false);
  assert.doesNotMatch(article.content, /李老师|X平台|x\.com/);
});

test("视频原帖使用预览缩略图作为发布封面", () => {
  const videoTweet = {
    ...chinaTweet,
    id: "video-123",
    media: [{
      type: "video",
      url: "https://pbs.twimg.com/amplify_video_thumb/video.jpg",
      preview_image_url: "https://pbs.twimg.com/amplify_video_thumb/video.jpg",
    }],
  };
  const qualified = qualifyTweet(videoTweet);
  const article = buildPublishedArticle(videoTweet, qualified, {
    title: "重庆一处现场视频引发关注",
    summary: "现场视频记录了相关情况。",
    content: "正文".repeat(160),
    seo_keywords: "重庆,现场",
    target: targetLength(qualified.text),
  }, "2026-08-23T09:00:00.000Z");
  assert.equal(article.cover_image, videoTweet.media[0].preview_image_url);
  assert.equal(article.image_alt, article.title);
});

test("已发布的X中国热门头条生成CHRT原生入站记录", () => {
  const qualified = qualifyTweet(chinaTweet);
  const article = buildPublishedArticle(chinaTweet, qualified, { title: "重庆维权人士被拘留，相关地点仍待核实", summary: "重庆一名维权人士被拘留，公开材料暂未提供更多细节。", content: "正文".repeat(160), seo_keywords: "重庆,维权,拘留", target: targetLength(qualified.text) }, "2026-08-23T09:00:00.000Z");
  const record = buildChrtRecord(article);
  assert.equal(record.sourcePlatform, "x");
  assert.equal(record.sourcePostId, "123");
  assert.equal(record.section, "中国热门头条");
  assert.equal(record.title, "重庆维权人士被拘留,相关地点仍待核实");
  assert.equal(record.originalText, qualified.text);
});

test("未自动发布的内容仍是可编辑、可人工发布的后台草稿", () => {
  const draft = buildReviewDraft(chinaTweet, "需要编辑核对", "2026-08-23T09:00:00.000Z");
  assert.equal(draft.status, "draft");
  assert.equal(draft.visibility, "private");
  assert.equal(draft.review_status, "manual_review");
  assert.equal(draft.metadata.editable, true);
  assert.equal(draft.metadata.manual_publish_allowed, true);
  assert.match(draft.metadata.review_reason, /需要编辑核对/);
});

test("拒绝美国主导、回复、转帖和低信息片段", () => {
  assert.equal(qualifyTweet({ id: "us", text: "8月23日，美国佛罗里达州警方宣布将与ICE开展联合执法行动，并公布新的移民拘留安排。" }).accepted, false);
  assert.equal(qualifyTweet({ id: "reply", text: chinaTweet.text, referenced_tweets: [{ type: "replied_to" }] }).accepted, false);
  assert.equal(qualifyTweet({ id: "rt", text: `RT @example: ${chinaTweet.text}` }).accepted, false);
  assert.equal(qualifyTweet({ id: "thin", text: "北京突发，稍后更新。" }).accepted, false);
});

test("中国热门头条打开开关立即采集，并由每小时唤醒器补漏24小时内容", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/china-hot-li-teacher-ingest.yml", import.meta.url), "utf8");
  const control = fs.readFileSync(new URL("../.github/workflows/operations-control-plane.yml", import.meta.url), "utf8");
  assert.match(workflow, /OPENAI_API_KEY/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /CHRT_INGEST_URL/);
  assert.match(workflow, /recover_archived/);
  assert.match(workflow, /repair_today/);
  assert.match(workflow, /--repair-today/);
  assert.match(workflow, /LI_TEACHER_LOOKBACK_HOURS:.*24/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /collection-cadence-gate/);
  assert.doesNotMatch(workflow, /COLLECTION_CADENCE_MINUTES/);
  assert.match(control, /cron: "7 \\* \\* \\* \\*"/);
  assert.match(control, /must never be blocked by an internal cadence lock/);
  assert.match(control, /github\.event_name == 'schedule'[\s\S]*inputs\.module == 'china-hot'/);
  assert.match(control, /china-hot-li-teacher:/);
  assert.match(control, /ice:/);
  assert.match(control, /uses: \.\/\.github\/workflows\/china-hot-li-teacher-ingest\.yml/);
  assert.doesNotMatch(workflow, /-\s+["']?scripts\/\*\*/);
});

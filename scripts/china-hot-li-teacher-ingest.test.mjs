#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCandidate, buildChrtRecord, buildPublishedArticle, buildReviewDraft, containsBoilerplate, deriveDraftTitle, qualifyTweet, shouldRetryCandidate, similarity, targetLength } from "./china-hot-li-teacher-ingest.mjs";

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
  assert.equal(candidate.ai_payload.processing_version, "adaptive-editorial-v1");
});

test("正文篇幅跟随事实密度和图片素材，不再强迫短消息凑到300字", () => {
  assert.deepEqual(targetLength("短文"), { min: 80, max: 200, band: "brief" });
  assert.deepEqual(targetLength("中".repeat(120)), { min: 120, max: 280, band: "short" });
  assert.deepEqual(targetLength("中".repeat(120), 1), { min: 120, max: 360, band: "short" });
  assert.deepEqual(targetLength("中".repeat(220)), { min: 160, max: 420, band: "short" });
  assert.deepEqual(targetLength("中".repeat(300)), { min: 300, max: 650, band: "source-led" });
});

test("失败草稿使用短标题并明确阻止未经编辑直接发布", () => {
  const raw = "9月12日，有博主直播测试理想最新版智驾，从小路汇入主路时未预留足够安全反应时间，直播随后被封禁。";
  const title = deriveDraftTitle(raw);
  assert.ok(title.length <= 42);
  assert.doesNotMatch(title, /^9月12日/);
  const draft = buildReviewDraft({ ...chinaTweet, text: raw }, "需要编辑核对", "2026-08-23T09:00:00.000Z");
  assert.notEqual(draft.title, draft.content);
  assert.notEqual(draft.summary, draft.content);
  assert.equal(draft.metadata.publication_blocked_until_edited, true);
  assert.match(draft.content, /编辑提示/);
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

test("直接涉及中国的跨国新闻进入中国热门，纯美国新闻仍被拒绝", () => {
  assert.equal(qualifyTweet({ id: "china-cars", text: "美国车企联盟致信国会，要求立法禁销中国车，并称此举涉及中国制造商在美国市场的销售、生产和进口安排。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "xinhua", text: "新华社时评关注农村高额彩礼问题，小红书相关讨论引发网友关注，话题直接涉及中国农村青年婚恋负担。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "security", text: "环球时报报道，国家安全部披露有人深夜翻进快递站偷取数据，国安部提示相关案件涉及数据安全。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "us", text: "8月23日，美国佛罗里达州警方宣布将与ICE开展联合执法行动，并公布新的移民拘留安排。" }).accepted, false);
  assert.equal(qualifyTweet({ id: "reply", text: chinaTweet.text, referenced_tweets: [{ type: "replied_to" }] }).accepted, false);
  assert.equal(qualifyTweet({ id: "rt", text: `RT @example: ${chinaTweet.text}` }).accepted, false);
  assert.equal(qualifyTweet({ id: "thin", text: "北京突发，稍后更新。" }).accepted, false);
});

test("中国平台、城市、教育软件和国产汽车线索不会被错误过滤", () => {
  assert.equal(qualifyTweet({ id: "bilibili", text: "9月12日，B站一网友发布视频，用德国普通保安两小时的到手工资测试当地物价和购买力，引发中文网友讨论。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "zhidao", text: "9月11日，一名大学生发帖称，高校学习软件知到在开启VPN时提示检测到相关网络环境，担心使用记录被学校看到。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "dongguan", text: "9月11日，东莞实验中学高三学生因晚下课导致夜宵被抢完，校方随后在公告栏回应学生反映的问题。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "ningbo", text: "9月11日晚，宁波大学新生开学典礼突遇大雨，校长临时缩短讲稿并提前结束致辞。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "li-auto", text: "9月12日，有博主直播测试理想智驾，从小路汇入主路时未预留足够安全反应时间，随后紧急刹车。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "ai", text: "9月12日，Anthropic与OpenAI首席执行官就人工智能发展速度发表意见，并讨论第三方评估机制和安全实践。" }).accepted, false);
});

test("自动失败草稿可有界重试，人工复核决定不会被自动覆盖", () => {
  const qualified = qualifyTweet(chinaTweet);
  assert.equal(shouldRetryCandidate({
    decision: "review_required",
    decision_reason: "自动发布复核未通过：outside-china-hot；保留为可编辑草稿，由编辑决定是否发布",
    ai_payload: {},
  }, qualified), true);
  assert.equal(shouldRetryCandidate({
    decision: "review_required",
    decision_reason: "自动扩写或发布失败：生成稿未明确中国新闻主体；保留为可编辑草稿，由编辑决定是否发布",
    ai_payload: { processing_version: "adaptive-editorial-v1", automatic_retry_attempts: 3 },
  }, qualified), false);
  assert.equal(shouldRetryCandidate({
    decision: "review_required",
    decision_reason: "自动扩写或发布失败：生成正文长度150，未达到300-650字；保留为可编辑草稿，由编辑决定是否发布",
    ai_payload: { processing_version: "grounded-image-v6", automatic_retry_attempts: 3 },
  }, qualified), true);
  assert.equal(shouldRetryCandidate({
    decision: "review_required",
    decision_reason: "编辑要求人工核对来源",
    ai_payload: {},
  }, qualified), false);
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
  assert.match(control, /cron: "7 \* \* \* \*"/);
  assert.match(control, /netlify\/functions\/_shared\/china-hot-headlines\.js/);
  assert.match(control, /scripts\/china-hot-li-teacher-ingest\.mjs/);
  assert.match(control, /must never be blocked by an internal cadence lock/);
  assert.match(control, /github\.event_name == 'schedule'[\s\S]*inputs\.module == 'china-hot'/);
  assert.match(control, /china-hot-li-teacher:/);
  assert.match(control, /ice:/);
  assert.match(control, /uses: \.\/\.github\/workflows\/china-hot-li-teacher-ingest\.yml/);
  assert.doesNotMatch(workflow, /-\s+["']?scripts\/\*\*/);
});

test("后台显示中文处理原因，审核草稿不能通过恢复按钮直接发布", () => {
  const ingest = fs.readFileSync(new URL("./china-hot-li-teacher-ingest.mjs", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../admin/content-center.js", import.meta.url), "utf8");
  const api = fs.readFileSync(new URL("../netlify/functions/china-hot-pool-admin.js", import.meta.url), "utf8");
  assert.match(html, /未通过加工的材料只能重新加工或编辑/);
  assert.match(ui, /review_required:\s*"需要重新加工"/);
  assert.match(ui, /处理说明：/);
  assert.match(ui, /data-pool-action="retry"/);
  assert.match(ui, /data-pool-edit/);
  assert.doesNotMatch(ui, /published \? "take_down" : "restore"/);
  assert.match(api, /未经加工的审核草稿不能直接恢复发布/);
  assert.match(api, /candidate\.decision !== "taken_down"/);
  assert.match(api, /action === "retry"/);
  assert.match(ingest, /async function reprocessableCandidates\(\)/);
  assert.match(ingest, /decision: "in\.\(failed,review_required\)"/);
  assert.match(ingest, /tweetsById/);
});

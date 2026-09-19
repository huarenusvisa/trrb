#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertPublicationQuality, bodyCharacterCount, isHeadlineDigest, buildCandidate, buildChrtRecord, buildPublishedArticle, buildReviewDraft, containsBoilerplate, deriveDraftTitle, editorialTarget, generateArticle, isThinSourceMaterial, qualifyTweet, shouldRetryCandidate, similarity, targetLength } from "./china-hot-li-teacher-ingest.mjs";

// Distinct characters isolate length/transport tests from the repetition gate.
const qualityBody = "重庆学校公布安排。" + Array.from({ length: 820 }, (_, i) => String.fromCharCode(0x4e00 + i)).join("");
const editorial_review = { single_event: true, grounded: true, sufficient: true, image_relevant: true, depth_appropriate: true, analysis_grounded: true, source_chain_complete: true, cover_index: 0, image_description: "校方公布的开学安排通知", reason: "输入材料支持成稿" };

const chinaTweet = {
  id: "123", created_at: "2026-08-23T08:00:00.000Z", lang: "zh",
  text: "8月23日，重庆市一所中学发布通知，因持续高温天气调整开学安排。当地教育部门表示将根据天气情况继续评估。",
  public_metrics: { like_count: 20 }, media: [{ type: "photo", url: "https://pbs.twimg.com/media/school.jpg", width: 1200, height: 800 }],
};

test("中国新闻及中国政治人物内容进入中国热门头条池", () => {
  const result = qualifyTweet(chinaTweet);
  assert.equal(result.accepted, true);
  assert.equal(qualifyTweet({ id: "politics", text: "中央纪委国家监委通报，一名省级官员因严重违纪违法接受纪律审查和监察调查，相关程序正在进行。具体调查结果仍以官方后续公布为准。" }).accepted, true);
  const candidate = buildCandidate(chinaTweet, result, "2026-08-23T09:00:00.000Z");
  assert.equal(candidate.proposed_section, "中国热门头条");
  assert.equal(candidate.decision, "processing");
  assert.equal(candidate.pipeline, "china-hot-li-teacher-v2");
  assert.equal(candidate.ai_payload.processing_version, "editorial-depth-source-chain-v9");
});

test("中国热门头条采用600至3500字目标且不截断事实", () => {
  for (const source of ["短文", "中".repeat(300), "中".repeat(1200)]) {
    assert.deepEqual(targetLength(source, 1), { min: 600, max: 3500, band: "正文600至3500个中文字符，依据同一事件素材，不凑字" });
  }
});

test("总编辑可按选题价值选择1500至3000字深度稿，标题型素材强制补链", () => {
  assert.deepEqual(editorialTarget("deep"), { min: 1500, max: 3000, band: "深度稿1500至3000个中文字符，解释因果、节点、数据与可能方向" });
  assert.equal(isThinSourceMaterial("北京国家信访局门口：两名访民喝农药自杀"), true);
  assert.equal(isThinSourceMaterial(chinaTweet.text), false);
});

test("栏目资格同时检查原文与成稿，拒绝把无关外国稿标为中国头条", () => {
  const tweet = { ...chinaTweet, text: "9月13日，胖东来创始人于东来发文称，新员工将为学员性质，合同四年不续签。" };
  const qualified = qualifyTweet(tweet);
  const copy = { title: "胖东来新员工将为学员性质", summary: "于东来公布员工培养安排。", content: qualityBody, editorial_review };
  const body = buildPublishedArticle(tweet, qualified, copy);
  assert.equal(body.metadata.source_category_qualified, true);
  assert.equal(body.metadata.category_policy_version, "source-social-v3");
  assert.equal(body.metadata.human_category_override, undefined);
  const unrelated = { title: "美国国会讨论预算", summary: "美国讨论财政安排。", content: qualityBody, editorial_review };
  assert.equal(buildPublishedArticle(tweet, qualified, unrelated).metadata.source_category_qualified, false);
  assert.equal(buildPublishedArticle(tweet, { ...qualified, accepted: false }, copy).metadata.source_category_qualified, false);
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
  assert.match(script, /duplicate_check_days: source\.topicKey === REN_ZHENGFEI_TOPIC \? 180 : 30/);
  assert.match(script, /与近30天跨栏目已发布内容重复/);
});

test("发布稿保留媒体归因及原帖证据", () => {
  const qualified = qualifyTweet(chinaTweet);
  const article = buildPublishedArticle(chinaTweet, qualified, { title: "重庆一所中学因高温调整开学安排", summary: "重庆当地一所中学发布通知，调整开学安排。", content: qualityBody, editorial_review, seo_keywords: "重庆,高温,开学", target: targetLength(qualified.text) }, "2026-08-23T09:00:00.000Z");
  assert.equal(article.status, "published");
  assert.equal(article.visibility, "public");
  assert.equal(article.metadata.automatic_publish, true);
  assert.equal(article.metadata.unverified_public_claim, true);
  assert.equal(article.metadata.public_source_attribution, true);
  assert.equal(article.metadata.duplicate_check_days, 30);
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
    content: qualityBody, editorial_review,
    seo_keywords: "重庆,现场",
    target: targetLength(qualified.text),
  }, "2026-08-23T09:00:00.000Z");
  assert.equal(article.cover_image, videoTweet.media[0].preview_image_url);
  assert.equal(article.image_alt, editorial_review.image_description);
});

test("已发布的X中国热门头条生成CHRT原生入站记录", () => {
  const qualified = qualifyTweet(chinaTweet);
  const article = buildPublishedArticle(chinaTweet, qualified, { title: "重庆维权人士被拘留，相关地点仍待核实", summary: "重庆一名维权人士被拘留，公开材料暂未提供更多细节。", content: qualityBody, editorial_review, seo_keywords: "重庆,维权,拘留", target: targetLength(qualified.text) }, "2026-08-23T09:00:00.000Z");
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

test("跨国新闻按主体分流，美国ICE新闻不再丢弃", () => {
  assert.equal(qualifyTweet({ id: "china-cars", text: "美国车企联盟致信国会，要求立法禁销中国车，并称此举涉及中国制造商在美国市场的销售、生产和进口安排。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "xinhua", text: "新华社时评关注农村高额彩礼问题，小红书相关讨论引发网友关注，话题直接涉及中国农村青年婚恋负担。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "security", text: "环球时报报道，国家安全部披露有人深夜翻进快递站偷取数据，国安部提示相关案件涉及数据安全。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "us", text: "8月23日，美国佛罗里达州警方宣布将与ICE开展联合执法行动，并公布新的移民拘留安排。" }).route, "ice");
  assert.equal(qualifyTweet({ id: "reply", text: chinaTweet.text, referenced_tweets: [{ type: "replied_to" }] }).accepted, false);
  assert.equal(qualifyTweet({ id: "rt", text: `RT @example: ${chinaTweet.text}` }).accepted, false);
  assert.equal(qualifyTweet({ id: "short", text: "北京地铁恢复运营。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "empty", text: "https://example.com" }).accepted, false);
});

test("短稿和缺图在发布前拦截，合格稿必须通过独立事实与图片复核", async (t) => {
  // This case verifies the long-report path; fresh brief fallback is tested separately.
  const tweet = { ...chinaTweet, text: qualityBody, created_at: "2000-01-01T00:00:00Z" };
  const qualified = qualifyTweet(tweet);
  let generated = { title: "重庆学校开学安排", summary: "学校公布时间安排", content: qualityBody, seo_keywords: "重庆", appears_old_news: false, old_news_reason: "", source_sufficient: true, rejection_reason: "" };
  let verdict = editorial_review;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    // CI has an X token; local runs may not. Model-call budget excludes optional thread reads.
    if (String(_url).startsWith("https://api.x.com/")) return new Response(JSON.stringify({ data: [] }), {status: 200});
    requests += 1;
    const input = JSON.parse(options.body);
    if (input.tools) return new Response(JSON.stringify({output: []}), {status: 200});
    const reviewing = input.text.format.name === "china_hot_editorial_review";
    if (!reviewing) {
      assert.match(input.instructions, /至少600/);
      assert.match(input.instructions, /不得拼接不同事件/);
      assert.ok(input.max_output_tokens >= 5000);
    }
    return new Response(JSON.stringify({ output_text: JSON.stringify(reviewing ? verdict : generated) }), { status: 200 });
  });
  await assert.rejects(generateArticle(qualified, { ...tweet, media: [] }), /合适配图/);
  assert.equal(requests, 0, "缺图不浪费模型调用");
  generated = { ...generated, content: "重庆学校公布开学安排。" };
  await assert.rejects(generateArticle(qualified, tweet), /至少需要600字/);
  assert.equal(requests, 2, "短稿先进行一次资料检索，没有可核查来源则不反复凑字");
  generated = { ...generated, source_sufficient: false, rejection_reason: "只有标题，缺少报道事实" };
  await assert.rejects(generateArticle(qualified, tweet), /缺少报道事实/);
  generated = { ...generated, source_sufficient: true, content: qualityBody };
  for (const field of ["single_event", "grounded", "sufficient", "image_relevant"]) {
    verdict = { ...editorial_review, [field]: false, reason: "独立质检未通过" };
    await assert.rejects(generateArticle(qualified, tweet), /独立质检未通过/);
  }
  verdict = editorial_review;
  const result = await generateArticle(qualified, tweet);
  assert.equal(result.content, qualityBody.normalize("NFKC"));
  assert.deepEqual(result.editorial_review, verdict);
});

test("截图中的多主题宣传标题直接过滤，普通单事件报道保留为线索", () => {
  const raw = "深层巨变!AI末日警报炸响,科技巨头罕见喊煞车;川习会逼近,川普先给习近平下马威!「中南海保镳头子」罕见曝光,任正非家族失联疑云越挖越深【红朝禁闻";
  assert.equal(isHeadlineDigest(raw), true);
  assert.equal(qualifyTweet({ ...chinaTweet, text: raw }).reason, "headline-digest");
  assert.equal(isHeadlineDigest("习近平印度之行空手而回/华为任正非出事了?/王剑每日观察/20260914 来自 @YouTube"), true);
  assert.equal(isHeadlineDigest(chinaTweet.text), false);
});

test("发布边界不能绕过长度、质检及选图要求", () => {
  const article = { title: "重庆学校开学安排", content: qualityBody, editorial_review };
  const chars = Array.from({ length: 800 }, (_, i) => String.fromCharCode(0x4e00 + i)).join("");
  assert.equal(bodyCharacterCount(`<p>${chars}</p>`), 800);
  assert.equal(bodyCharacterCount(`正文<img alt="${chars}" src="https://example.com/cover.jpg">`), 2);
  assert.throws(() => assertPublicationQuality(chinaTweet, { ...article, content: chars.slice(0,299) }), /至少需要600/);
  assert.equal(assertPublicationQuality(chinaTweet, { ...article, content: chars }), chinaTweet.media[0].url);
  assert.throws(() => assertPublicationQuality(chinaTweet, { ...article, content: "重庆地铁恢复正常运行，现场乘客陆续进站。".repeat(80) }), /重复句/);
  assert.throws(() => assertPublicationQuality(chinaTweet, { ...article, editorial_review: undefined }), /缺少单一主题/);
  assert.throws(() => assertPublicationQuality(chinaTweet, { ...article, editorial_review: { ...editorial_review, cover_index: 10 } }), /合适配图/);
  assert.throws(() => buildPublishedArticle(chinaTweet, qualifyTweet(chinaTweet), { ...article, appears_old_news: true }), /旧闻/);
  const tweet = { ...chinaTweet, media: [{ type: "photo", url: "https://pbs.twimg.com/media/unrelated.jpg" }, ...chinaTweet.media] };
  const saved = buildPublishedArticle(tweet, qualifyTweet(tweet), { ...article, editorial_review: { ...editorial_review, cover_index: 1 } });
  assert.equal(saved.cover_image, chinaTweet.media[0].url, "采用质检选择的相关图片而不是第一张图片");
  assert.equal(shouldRetryCandidate({ decision: "failed", ai_payload: { quality_hold: true } }, { accepted: true }), false);
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
    ai_payload: { processing_version: "editorial-depth-source-chain-v9", automatic_retry_attempts: 3 },
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

const socialExamples = [
  { id: 'work-exit', text: '“亲手砸掉铁饭碗 亲手解开铁镣铐”\n9月9日，一位网友因为工作单位限制出境、无法自由出国旅游，决定辞职。但由于所在单位规定5年内不能主动辞职，只能通过“被辞退”的方式离开，她只好和领导商量如何走辞退流程。在得到领导理解后，她开始旷工。' },
  { id: 'school-rails', text: '“真的像鸟笼”\n9月11日，一位学生分享自己高中学校的教学楼，从楼梯间向上全是密密麻麻的栅栏。视频迅速引发其他学校学生分享和讨论，网友评论道这是哪里的监狱。' }
];
test('截图中的单位限制出境和校园栅栏报道不再因缺少地名被过滤', () => {
  for (const tweet of socialExamples) {
    const qualified = qualifyTweet(tweet);
    assert.equal(qualified.accepted, true, tweet.id);
    assert.equal(shouldRetryCandidate({ decision: 'rejected', article_id: null, collected_at: new Date().toISOString(),
      decision_reason: '自动分类过滤：不属于中国热门头条栏目；未创建或发布文章',
      ai_payload: { status: 'filtered', filter_reason: 'outside-china-hot' }
    }, qualified), true);
  }
  for (const text of ['美国高中学生分享教学楼视频。', '日本工人发帖反映辞职规定。', '纽约一名网友拍摄学校的围栏。', '今天的心情真的像鸟笼', '学校课程招生广告，欢迎报名。']) {
    assert.equal(qualifyTweet({ id: 'foreign-or-not-report', text }).accepted, false, text);
  }
});

test('分类回补不会重新发布人工拒绝、下架、旧闻或已有文章', () => {
  const qualified = qualifyTweet(socialExamples[0]);
  const row = { decision: 'rejected', article_id: null,
    decision_reason: '自动分类过滤：不属于中国热门头条栏目；未创建或发布文章',
    ai_payload: { status: 'filtered', filter_reason: 'outside-china-hot' } };
  for (const patch of [
    { decision_reason: '编辑决定不发布' }, { decision: 'taken_down' },
    { article_id: 'existing-article' }, { ai_payload: { status: 'filtered_old_news' } },
    { decision: 'duplicate' }, { ai_payload: { status: 'filtered', filter_reason: 'not-original' } }
  ]) assert.equal(shouldRetryCandidate({ ...row, ...patch }, qualified), false);
});

test('社会事件生成稿同样接受真实主体，不强迫补造中国地名', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++;
    const input = JSON.parse(options.body);
    if (input.text.format.name === 'china_hot_editorial_review') return Response.json({ output_text: JSON.stringify(editorial_review) });
    assert.match(input.instructions, /原文未交代地名时不得补造/);
    return Response.json({ output_text: JSON.stringify({ title: '高中教学楼密集栅栏引发讨论', summary: '学生分享教学楼画面。', content: '一位学生分享高中学校教学楼的视频，楼梯间向上可见密集栅栏。' + qualityBody.slice(10), seo_keywords: '校园,教学楼', appears_old_news: false, old_news_reason: '', source_sufficient: true, rejection_reason: '' }) });
  });
  const article = await generateArticle(qualifyTweet(socialExamples[1]), { ...socialExamples[1], media: chinaTweet.media });
  assert.equal(calls, 2);
  assert.doesNotMatch(article.content, /中国|北京|上海/);
});


test('中国企业、消费、香港和海外华人报道属于栏目范围', () => {
  for (const text of [
    '胖东来创始人于东来发文称新员工为学员性质，合同四年。',
    '凤凰记者再访奥斯马电诈园，报道园区运作方式。',
    '国产手机弹窗广告使老人无法联系家人，网友上前帮忙。',
    '视频中戴红领巾的女孩坐在布满尖状物的书桌前。',
    '在德华人反映法兰克福汽配展中餐盒饭疑似食物中毒。',
    '香港政府回应支联会判刑相关评论。',
    '博主晒出带有南通中集标签的工资条，累计出勤352小时。'
  ]) assert.equal(qualifyTweet({ id: 'china-related', text }).accepted, true, text);
  assert.equal(qualifyTweet({ id: 'unrelated', text: '德国一家餐厅宣布调整营业时间。' }).accepted, false);
});


test("短稿检索同一事件背景，扩写后将资料交给独立质检并保存来源", async (t) => {
  const tweet = { ...chinaTweet, text: qualityBody };
  const source = {url: "https://example.com/original-report", title: "原始报道"};
  let writes = 0, researches = 0, reviews = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const input = JSON.parse(options.body);
    if (input.tools) { researches++;
      assert.equal(input.tools[0].type, "web_search");
      return Response.json({output: [{type:"web_search_call",status:"completed"},{type:"message",content:[{type:"output_text",text:"学校公布同一事件的详细安排与后续，以原始报道为据。",annotations:[{type:"url_citation",...source}]}]}]});
    }
    if (input.text.format.name === "china_hot_editorial_review") {
      reviews++; assert.match(JSON.stringify(input.input), /original-report/);
      return Response.json({output_text: JSON.stringify(editorial_review)});
    }
    writes++; if (writes > 1) assert.match(JSON.stringify(input.input), /original-report/);
    return Response.json({output_text: JSON.stringify({title:"重庆学校开学安排",summary:"学校公布时间安排",content:writes===1?"重庆学校公布开学安排。":qualityBody,seo_keywords:"重庆",appears_old_news:false,old_news_reason:"",source_sufficient:true,rejection_reason:""})});
  });
  const article=await generateArticle(qualifyTweet(tweet),tweet);
  assert.equal(writes,2);assert.equal(researches,1);assert.equal(reviews,1);
  assert.deepEqual(buildPublishedArticle(tweet,qualifyTweet(tweet),article).supporting_sources,[source]);
});

test("高价值选题由总编辑判定为深度稿后，必须补足双来源并写到1500至3000字", async (t) => {
  const tweet = {...chinaTweet, text: qualityBody};
  const deepBody = "重庆学校发布通知，因持续高温调整开学安排。这是一篇基于公开资料的深度报道。" + Array.from({length: 1650}, (_, i) => String.fromCodePoint(0x4e00 + i)).join("");
  const sources = [
    {url:"https://example.com/primary", title:"原始文件"},
    {url:"https://example.org/data", title:"统计资料"},
  ];
  let writes = 0, researches = 0, reviews = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const input = JSON.parse(options.body);
    if (input.tools) {
      researches += 1;
      assert.match(input.input, /"editorial_depth":"deep"/);
      return Response.json({output:[{type:"web_search_call",status:"completed"},{type:"message",content:[{type:"output_text",text:"原始文件和统计资料共同说明事件背景。",annotations:sources.map((source)=>({type:"url_citation",...source}))}]}]});
    }
    if (input.text.format.name === "china_hot_editorial_review") {
      reviews += 1;
      return Response.json({output_text:JSON.stringify(editorial_review)});
    }
    writes += 1;
    return Response.json({output_text:JSON.stringify({title:"重庆学校高温期开学安排的节点与走向",summary:"公开文件与统计资料解释重庆学校调整安排的背景。",content:writes < 3 ? qualityBody : deepBody,seo_keywords:"重庆学校,高温,数据",appears_old_news:false,old_news_reason:"",source_sufficient:true,rejection_reason:"",image_evidence:[],editorial_depth:"deep",depth_reason:"具有公共影响、历史数据和多种后续方向",analysis_angles:["为何此刻发生","历史规律与年度数据","后续情景"]})});
  });
  const article = await generateArticle(qualifyTweet(tweet), tweet);
  assert.equal(article.editorial_depth, "deep");
  assert.equal(article.target.min, 1500);
  assert.ok(bodyCharacterCount(article.content) >= 1500);
  assert.equal(researches, 1);
  assert.equal(writes, 3);
  assert.equal(reviews, 1);
  assert.equal(buildPublishedArticle(tweet, qualifyTweet(tweet), article).metadata.article_format, "deep_analysis");
});

test("只有标题的线索找不到原始出处和上下游资料时不得成稿", async (t) => {
  const tweet = {...chinaTweet, text:"北京国家信访局门口：两名访民喝农药自杀"};
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const input = JSON.parse(options.body);
    if (input.tools) return Response.json({output:[]});
    return Response.json({output_text:JSON.stringify({title:tweet.text,summary:"",content:"",seo_keywords:"",appears_old_news:false,old_news_reason:"",source_sufficient:false,rejection_reason:"未找到可核对原始出处",image_evidence:[],editorial_depth:"standard",depth_reason:"只有标题",analysis_angles:[]})});
  });
  await assert.rejects(generateArticle({accepted:true,reason:"china-news",route:"china",text:tweet.text,title:tweet.text}, tweet), /只有标题或一句话/);
});

test('无法可靠扩至800字的新热点经过独立核对可发布为选题短讯', async t => {
 const tweet={...chinaTweet,created_at:new Date().toISOString()};
 const brief={title:'重庆学校调整开学安排',summary:'校方发布高温期间的教学通知。',content:chinaTweet.text,seo_keywords:'重庆,学校',appears_old_news:false,old_news_reason:'',source_sufficient:true,rejection_reason:''};
 let writes=0,researches=0,reviews=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const input=JSON.parse(options.body);
  if(input.tools){researches++;return Response.json({output:[]});}
  if(input.text.format.name==='china_hot_editorial_review'){
   reviews++;assert.match(input.instructions,/短讯例外/);
   return Response.json({output_text:JSON.stringify({...editorial_review,fresh_hot_event:true,freshness_evidence:'测试材料明确记载学校今日公布新的开学安排'})});
  }
  writes++;return Response.json({output_text:JSON.stringify(writes===1?{...brief,content:'',source_sufficient:false,rejection_reason:'素材不足以扩写800字'}:brief)});
 });
 const qualified=qualifyTweet(tweet);const generated=await generateArticle(qualified,tweet);
 assert.equal(researches,1);assert.equal(writes,2);assert.equal(reviews,1);
 assert.equal(generated.publication_scope,'topic_only');
 const saved=buildPublishedArticle(tweet,qualified,generated);
 assert.equal(saved.category_name,'热门头条');assert.equal(saved.status,'published');
 assert.equal(saved.metadata.publication_scope,'topic_only');assert.equal(saved.metadata.homepage_focus_override,'exclude');
 assert.ok(saved.metadata.body_character_count<800);
 for(const patch of [{fresh_hot_event:false},{freshness_evidence:''},{grounded:false}]){
  assert.throws(()=>buildPublishedArticle(tweet,qualified,{...generated,editorial_review:{...generated.editorial_review,...patch}}),/采编质量拦截/);
 }
 assert.throws(()=>buildPublishedArticle({...tweet,created_at:new Date(Date.now()-73*3600000).toISOString()},qualified,generated),/短讯仅限/);
 assert.throws(()=>buildPublishedArticle({...tweet,context_research_attempted:false},qualified,generated),/短讯仅限/);
 assert.throws(()=>buildPublishedArticle({...tweet,created_at:new Date(Date.now()+3600000).toISOString()},qualified,generated),/短讯仅限/);
});

test('同一新闻不能用短讯版本绕过长稿去重', async()=>{
 const {duplicateArticle}=await import('./china-hot-li-teacher-ingest.mjs');
 const brief={title:'重庆某中学发布高温期开学安排调整通知',summary:'学校公布新学期开学安排',content:'学校公布新学期开学安排，调整报到时间。'};
 assert.equal(duplicateArticle(brief,[{...brief,id:'existing',content:qualityBody}]).id,'existing');
 assert.equal(duplicateArticle(brief,[{id:'other',title:'重庆地铁线路恢复运营',summary:'运营部门公布班次',content:'地铁班次已经调整。'}]),null);
});

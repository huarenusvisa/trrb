#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCandidate, buildChrtRecord, buildPublishedArticle, buildReviewDraft, containsBoilerplate, deriveDraftTitle, generateArticle, qualifyTweet, shouldRetryCandidate, similarity, targetLength } from "./china-hot-li-teacher-ingest.mjs";

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
  assert.equal(candidate.ai_payload.processing_version, "source-led-no-length-v2");
});

test("正文不设字数上下限，元数据不再声明强制篇幅区间", () => {
  for (const source of ["短文", "中".repeat(300), "中".repeat(1200)]) {
    assert.deepEqual(targetLength(source, 1), { min: null, max: null, band: "不限字数" });
  }
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
  assert.equal(qualifyTweet({ id: "short", text: "北京地铁恢复运营。" }).accepted, true);
  assert.equal(qualifyTweet({ id: "empty", text: "https://example.com" }).accepted, false);
});

test("中国热门短原帖和不在建议篇幅区间的稿件不会因字数重试或拒绝", async (t) => {
  const tweet = { ...chinaTweet, text: "北京地铁恢复运营。" };
  const qualified = qualifyTweet(tweet);
  assert.equal(qualified.accepted, true);
  let generated;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests += 1;
    const input = JSON.parse(options.body);
    const fields = input.text.format.schema.properties;
    assert.equal(fields.title.minLength, 1);
    assert.equal(fields.content.minLength, 1);
    assert.equal(fields.content.maxLength, undefined);
    assert.equal(fields.title.maxLength, undefined);
    return new Response(JSON.stringify({ output_text: JSON.stringify(generated) }), { status: 200 });
  });
  for (const content of ["北京地铁恢复运营。", "北京地铁恢复运营，线路已重新开放。".repeat(800)]) {
    generated = { title: "北京地铁", summary: "线路开放", content, seo_keywords: "北京", appears_old_news: false, old_news_reason: "" };
    const result = await generateArticle(qualified, tweet);
    assert.equal(result.content, content.normalize("NFKC"));
    assert.equal(result.title, "北京地铁");
  }
  assert.equal(requests, 2, "valid short and long articles each need only one model request");
  generated = { ...generated, content: " " };
  await assert.rejects(generateArticle(qualified, tweet), /标题和正文不能为空/);
  generated = { ...generated, title: "纽约地铁", content: "纽约地铁恢复运营。" };
  await assert.rejects(generateArticle(qualified, tweet), /未明确中国新闻主体/);
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
    ai_payload: { processing_version: "source-led-no-length-v2", automatic_retry_attempts: 3 },
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
    assert.equal(shouldRetryCandidate({ decision: 'rejected', article_id: null,
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
    assert.match(input.instructions, /原文未交代地名时不得补造/);
    return Response.json({ output_text: JSON.stringify({ title: '高中教学楼密集栅栏引发讨论', summary: '学生分享教学楼画面。', content: '一位学生分享高中学校教学楼的视频，楼梯间向上可见密集栅栏，其他学生也分享了各自学校的情况。', seo_keywords: '校园,教学楼', appears_old_news: false, old_news_reason: '' }) });
  });
  const article = await generateArticle(qualifyTweet(socialExamples[1]), socialExamples[1]);
  assert.equal(calls, 1);
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

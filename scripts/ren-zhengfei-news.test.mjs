#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCandidate, buildPublishedArticle, isRenZhengfeiCollectionPaused, isRenZhengfeiTweet, qualifyTweet, targetLength } from "./china-hot-li-teacher-ingest.mjs";
import { findRenEventDuplicate, hasSubstantiveRenUpdate, sameRenEvent } from "./ren-zhengfei-event-dedupe.mjs";

const renTweet = {
  id: "2099504575149642078",
  text: "任正非在最新公开交流中谈到华为研发与人才培养安排。",
  created_at: "2026-09-14T23:00:00.000Z",
  source_username: "newsroom",
  source_name: "News Room",
  source_level: "verified_social",
  source_verified: true,
  topic_key: "ren-zhengfei",
  media: [{ type: "photo", url: "https://pbs.twimg.com/media/ren-event.jpg" }],
};

test("任正非专题保留原有数据结构，但采集入口已暂停", () => {
  assert.equal(isRenZhengfeiTweet(renTweet), true);
  assert.equal(isRenZhengfeiTweet({ ...renTweet, text: "任正非课程报名返现，欢迎参加抽奖" }), false);
  const qualified = qualifyTweet(renTweet);
  assert.equal(qualified.accepted, true);
  const candidate = buildCandidate(renTweet, qualified, "2026-09-15T00:00:00.000Z");
  assert.equal(candidate.pipeline, "china-hot-li-teacher-v2");
  assert.equal(candidate.proposed_section, "中国热门头条");
  assert.equal(candidate.source_account, "@newsroom");
  assert.equal(candidate.external_id, "x:ren-zhengfei:2099504575149642078");
  assert.equal(candidate.ai_payload.topic_key, "ren-zhengfei");
  assert.equal(isRenZhengfeiCollectionPaused(renTweet), true);
  assert.equal(isRenZhengfeiCollectionPaused({ id: "li-source", text: "李老师原账号提到任正非今日露面", topic_key: "china" }), true);
  assert.equal(isRenZhengfeiCollectionPaused({ id: "china", text: "北京一所学校发布开学通知", topic_key: "china" }), false);
});

test("任正非时间线按事件去重，但保留官方回应和真实进展", () => {
  const rumor = { id: "published-rumor", title: "网传任正非已经出逃海外", summary: "多个账号转述任正非疑似跑路的传闻。", metadata: { source_text_original: "网传任正非已经离开中国，疑似跑路海外。" } };
  assert.equal(sameRenEvent("消息称华为创始人任正非出逃，已经跑路海外", rumor), true);
  assert.equal(findRenEventDuplicate("换一个账号转发：任正非疑似逃离中国", [rumor])?.id, "published-rumor");
  assert.equal(hasSubstantiveRenUpdate("华为今日回应并否认任正非出逃传闻", rumor.metadata.source_text_original), true);
  assert.equal(sameRenEvent("华为今日回应并否认任正非出逃传闻", rumor), false);
  assert.equal(sameRenEvent("任正非9月15日在深圳公开露面", rumor), false);
});

test("任正非发布稿带稳定主题标记并留在中国热门头条", () => {
  const qualified = qualifyTweet(renTweet);
  const article = buildPublishedArticle(renTweet, qualified, {
    title: "任正非谈华为研发与人才培养",
    summary: "任正非在公开交流中谈到华为研发与人才培养安排。",
    content: "任正非在公开交流中谈到华为研发与人才培养安排。" + Array.from({length: 800}, (_,i) => String.fromCharCode(0x4e00+i)).join(""),
    editorial_review: { single_event: true, grounded: true, sufficient: true, image_relevant: true, depth_appropriate: true, analysis_grounded: true, source_chain_complete: true, cover_index: 0, image_description: "公开交流活动现场", reason: "材料支持" },
    seo_keywords: "任正非,华为,研发,人才",
    target: targetLength(),
  }, "2026-09-15T00:00:00.000Z");
  assert.equal(article.category_name, "热门头条");
  assert.equal(article.topic_key, "ren-zhengfei");
  assert.equal(article.slug, "ren-zhengfei-x-2099504575149642078");
  assert.equal(article.metadata.person_topic, "任正非");
  assert.equal(article.metadata.duplicate_check_days, 180);
  assert.equal(article.metadata.duplicate_policy, "ren-event-v1");
  assert.deepEqual(article.related_sections, ["中国热门头条", "任正非动态"]);
});

test("任正非时间线使用主题键并按原始消息时间倒序", () => {
  const timeline = fs.readFileSync(new URL("../ren-zhengfei/timeline.js", import.meta.url), "utf8");
  const seeds = fs.readFileSync(new URL("../ren-zhengfei/seed-posts.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../ren-zhengfei/index.html", import.meta.url), "utf8");
  const redirects = fs.readFileSync(new URL("../_redirects", import.meta.url), "utf8");
  const workflow = fs.readFileSync(new URL("../.github/workflows/china-hot-li-teacher-ingest.yml", import.meta.url), "utf8");
  assert.match(timeline, /topic_key.*eq\.ren-zhengfei/s);
  assert.match(timeline, /source_created_at\.desc\.nullslast/);
  assert.ok(seeds.indexOf("2099687565767131308") < seeds.indexOf("2099441894149198225"), "手工加入的原帖应按发布时间倒序排列");
  assert.match(timeline, /fetchedIds/);
  assert.match(timeline, /dedupeFetched/);
  assert.match(timeline, /local_path/);
  assert.match(timeline, /https\?:\\\/\\\/\|\\\//, "时间线应支持站内托管图片");
  assert.match(html, /<h1>任正非真的跑了吗？<\/h1>/);
  assert.doesNotMatch(html, /REN ZHENGFEI NEWS|来自 X 公开信息源/);
  assert.match(html, /property="og:image" content="https:\/\/trrb\.net\/assets\/people\/ren-zhengfei-xi-news-hero\.jpg/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(redirects, /^\/ren-zhengfei \/ren-zhengfei\/index\.html 200!$/m);
  const ingest = fs.readFileSync(new URL("./china-hot-li-teacher-ingest.mjs", import.meta.url), "utf8");
  assert.match(ingest, /REN_ZHENGFEI_COLLECTION_ENABLED = false/);
  assert.match(ingest, /renZhengfeiCollection: "paused_by_editor"/);
  assert.doesNotMatch(workflow, /REN_ZHENGFEI_MAX_FETCH/);
  assert.doesNotMatch(workflow, /Clean duplicate Ren Zhengfei timeline stories/);
  assert.doesNotMatch(workflow, /schedule:/);
});

test("两条指定 X 原帖及全部五张图片已归档", () => {
  const first = fs.readFileSync(new URL("../ren-zhengfei/posts/2099441894149198225/index.html", import.meta.url), "utf8");
  const second = fs.readFileSync(new URL("../ren-zhengfei/posts/2099687565767131308/index.html", import.meta.url), "utf8");
  assert.match(first, /5xyxh\/status\/2099441894149198225/);
  assert.match(second, /lenscn\/status\/2099687565767131308/);
  assert.equal((first.match(/assets\/ren-zhengfei\/posts\/2099441894149198225\/\d\d\.jpg/g) || []).length, 1);
  assert.equal((second.match(/assets\/ren-zhengfei\/posts\/2099687565767131308\/\d\d\.jpg/g) || []).length, 4);
  for (const page of [first, second]) {
    assert.match(page, /真实性提示/);
    assert.match(page, /property="og:image"/);
  }
});

test("赛力斯与华为合作调整新闻进入任正非时间线", () => {
  const seeds = fs.readFileSync(new URL("../ren-zhengfei/seed-posts.js", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../ren-zhengfei/posts/seres-huawei-separation-20260915/index.html", import.meta.url), "utf8");
  assert.match(seeds, /赛力斯主动与华为切割，疑似佐证任正非跑路？/);
  assert.match(page, /assets\/ren-zhengfei\/posts\/seres-huawei-separation-20260915\/cover-v2\.jpeg/);
  assert.match(page, /真实性提示/);
  assert.match(page, /property="og:image"/);
});

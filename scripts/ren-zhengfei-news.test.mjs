#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildCandidate, buildPublishedArticle, isRenZhengfeiTweet, qualifyTweet, targetLength } from "./china-hot-li-teacher-ingest.mjs";

const renTweet = {
  id: "2099504575149642078",
  text: "任正非在最新公开交流中谈到华为研发与人才培养安排。",
  created_at: "2026-09-14T23:00:00.000Z",
  source_username: "newsroom",
  source_name: "News Room",
  source_level: "verified_social",
  source_verified: true,
  topic_key: "ren-zhengfei",
  media: [],
};

test("任正非全站关键词内容进入原中国热门头条流水线", () => {
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
});

test("任正非发布稿带稳定主题标记并留在中国热门头条", () => {
  const qualified = qualifyTweet(renTweet);
  const article = buildPublishedArticle(renTweet, qualified, {
    title: "任正非谈华为研发与人才培养",
    summary: "任正非在公开交流中谈到华为研发与人才培养安排。",
    content: "任正非在公开交流中谈到华为研发与人才培养安排。",
    seo_keywords: "任正非,华为,研发,人才",
    target: targetLength(),
  }, "2026-09-15T00:00:00.000Z");
  assert.equal(article.category_name, "热门头条");
  assert.equal(article.topic_key, "ren-zhengfei");
  assert.equal(article.slug, "ren-zhengfei-x-2099504575149642078");
  assert.equal(article.metadata.person_topic, "任正非");
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
  assert.match(timeline, /local_path/);
  assert.match(timeline, /https\?:\\\/\\\/\|\\\//, "时间线应支持站内托管图片");
  assert.match(html, /<h1>任正非真的跑了吗？<\/h1>/);
  assert.doesNotMatch(html, /REN ZHENGFEI NEWS|来自 X 公开信息源/);
  assert.match(html, /property="og:image" content="https:\/\/trrb\.net\/assets\/people\/ren-zhengfei-xi-news-hero\.jpg/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(redirects, /^\/ren-zhengfei \/ren-zhengfei\/index\.html 200!$/m);
  assert.match(workflow, /REN_ZHENGFEI_MAX_FETCH/);
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

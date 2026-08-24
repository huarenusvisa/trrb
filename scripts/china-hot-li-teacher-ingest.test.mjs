#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildDraft, qualifyTweet } from "./china-hot-li-teacher-ingest.mjs";

test("accepts informative mainland China original posts", () => {
  const tweet = {
    id: "123",
    created_at: "2026-08-23T08:00:00.000Z",
    lang: "zh",
    text: "8月23日，重庆市一所中学发布通知，因持续高温天气调整开学安排。当地教育部门表示将根据天气情况继续评估。",
    public_metrics: { like_count: 20 },
    media: [],
  };
  const result = qualifyTweet(tweet);
  assert.equal(result.accepted, true);
  const draft = buildDraft(tweet, result, "2026-08-23T09:00:00.000Z");
  assert.equal(draft.category_name, "热门头条");
  assert.equal(draft.status, "draft");
  assert.equal(draft.visibility, "private");
  assert.equal(draft.review_status, "pending_review");
  assert.equal(draft.metadata.automatic_publish, false);
  assert.equal(draft.external_id, "x:whyyoutouzhele:123");
  assert.match(draft.content, /李老师不是你老师/);
  assert.match(draft.content, /x\.com\/whyyoutouzhele\/status\/123/);
});

test("rejects US-led, replies, retweets, and low-information fragments", () => {
  assert.equal(qualifyTweet({ id: "us", text: "8月23日，美国佛罗里达州警方宣布将与ICE开展联合执法行动，并公布新的移民拘留安排。" }).accepted, false);
  assert.equal(qualifyTweet({ id: "reply", text: "8月23日，北京有关部门发布了新的工作通知，详细说明了后续的执行安排。", referenced_tweets: [{ type: "replied_to" }] }).accepted, false);
  assert.equal(qualifyTweet({ id: "rt", text: "RT @example: 8月23日，北京有关部门发布了新的工作通知，详细说明了后续的执行安排。" }).accepted, false);
  assert.equal(qualifyTweet({ id: "thin", text: "北京突发，稍后更新。" }).accepted, false);
});

test("workflow keeps collection inside the unified control plane", () => {
  const workflow = fs.readFileSync(new URL("../.github/workflows/china-hot-li-teacher-ingest.yml", import.meta.url), "utf8");
  const control = fs.readFileSync(new URL("../.github/workflows/operations-control-plane.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /china-hot-li-teacher-ingest\.mjs/);
  assert.match(control, /china-hot-li-teacher:/);
  assert.match(control, /china-hot-li-teacher-ingest\.yml/);
});

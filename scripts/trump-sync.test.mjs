import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultQuery,
  buildTrumpQueryLanes,
  compareSnowflakes,
  contentTokens,
  jaccard,
  validateArticle,
} from "./trump-sync.mjs";

test("default query contains primary, trusted, review and exclusions", () => {
  const query = buildDefaultQuery(
    ["realDonaldTrump"],
    ["realDonaldTrump", "WhiteHouse", "Reuters"],
    ["CNN"]
  );
  assert.match(query, /from:realDonaldTrump/);
  assert.match(query, /from:WhiteHouse/);
  assert.match(query, /from:Reuters/);
  assert.match(query, /from:CNN/);
  assert.match(query, /-is:retweet/);
  assert.match(query, /-is:reply/);
  assert.ok(query.length < 500);
});

test("radar query lanes include official, media and open search", () => {
  const lanes = buildTrumpQueryLanes();
  assert.ok(lanes.some((lane) => lane.id === "official"));
  assert.ok(lanes.some((lane) => lane.id.startsWith("trusted-")));
  assert.ok(lanes.some((lane) => lane.id === "radar"));
  assert.ok(lanes.every((lane) => lane.query.length < 500));
});

test("snowflake comparison does not lose integer precision", () => {
  assert.equal(compareSnowflakes("2075567019064168475", "2075567019064168474"), 1);
  assert.equal(compareSnowflakes("2075567019064168474", "2075567019064168475"), -1);
  assert.equal(compareSnowflakes("2075567019064168475", "2075567019064168475"), 0);
});

test("content similarity identifies near duplicate Chinese news", () => {
  const a = contentTokens("特朗普宣布新的移民执法政策，白宫公布实施安排");
  const b = contentTokens("白宫公布新的移民执法政策，特朗普宣布实施安排");
  assert.ok(jaccard(a, b) > 0.5);
});

test("validation accepts grounded neutral article", () => {
  const source = "X原文：President Trump announced a meeting on July 10 in Washington. 2026";
  const post = {
    text: "President Trump announced a meeting on July 10 in Washington. 2026",
    possibly_sensitive: false,
    source_mode: "auto",
  };
  const ai = {
    title: "特朗普宣布将在华盛顿举行公开会议",
    summary: "特朗普在公开帖子中表示，将于7月10日在华盛顿举行会议，帖子未进一步说明会议议程。",
    body_paragraphs: [
      "特朗普在公开帖子中宣布，将于7月10日在华盛顿举行一场会议。帖子披露了会议时间和地点，但没有列出完整议程。",
      "目前公开信息主要来自该帖本身，会议安排如有进一步变化，应以相关机构随后发布的正式通知为准。帖子没有披露其他可核实细节。",
    ],
    category: "白宫动态",
    importance: 6,
    relevance_score: 94,
    publishable: true,
    needs_review: false,
    review_reason: "",
    confidence: 92,
    verified_level: "official",
  };
  assert.deepEqual(validateArticle(ai, source, post), { ok: true, reason: "" });
});

test("validation rejects invented Arabic numbers", () => {
  const source = "X原文：President Trump announced a meeting in Washington.";
  const post = {
    text: "President Trump announced a meeting in Washington.",
    possibly_sensitive: false,
    source_mode: "auto",
  };
  const ai = {
    title: "特朗普宣布将在华盛顿举行公开会议",
    summary: "特朗普发布消息称，将在华盛顿举行会议，但没有公布更多具体安排或正式议程。",
    body_paragraphs: [
      "特朗普通过公开帖子宣布将在华盛顿举行会议，帖子没有说明与会人员和完整议题。",
      "相关安排仍以正式通知为准，目前公开材料没有提供更多可核实细节，也没有披露后续程序、与会人员名单或其他安排。",
    ],
    category: "白宫动态",
    importance: 6,
    relevance_score: 94,
    publishable: true,
    needs_review: false,
    review_reason: "",
    confidence: 92,
    verified_level: "official",
  };
  ai.summary += " 会议预计有25人参加。";
  const result = validateArticle(ai, source, post);
  assert.equal(result.ok, false);
  assert.match(result.reason, /25/);
});

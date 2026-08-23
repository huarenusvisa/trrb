#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import ranking from "../homepage-ranking.js";

const hour = 60 * 60 * 1000;
const now = Date.parse("2026-08-21T20:00:00Z");
const at = (hoursAgo) => new Date(now - hoursAgo * hour).toISOString();
const article = (id, title, category, hoursAgo, score, extra = {}) => ({
  id,
  title,
  category,
  category_name: category,
  status: "published",
  visibility: "public",
  published_at: at(hoursAgo),
  rank_score: score,
  ...extra
});

const selected = ranking.select24hRank([
  article("crime", "美国警情样本", "美国警情", 2, 80),
  article("bia", "[BIA先例] 庇护案件证据标准", "移民美国·人道主义庇护·政治庇护·BIA先例判决", 1, 999),
  article("immigration", "移民美国样本", "移民美国", 3, 998),
  article("asylum", "庇护百科样本", "庇护百科", 2, 997),
  article("important", "重要新闻样本", "重要新闻", 2, 996),
  article("china", "中国热门头条样本", "热门头条", 4, 60),
  article("china-display", "中国热门头条显示名样本", "中国热门头条", 4.5, 55),
  article("ice", "ICE样本", "ICE执法动态", 5, 50),
  article("ice-legacy", "ICE旧分类样本", "驱逐快报", 5.5, 45),
  article("politics", "美国时政样本", "美国时政", 6, 40),
  article("duplicate-low", "美国警情样本", "美国警情", 1, 1),
  article("old", "超过24小时", "美国时政", 25, 999),
  article("draft", "草稿", "热门头条", 1, 999, { status: "draft" }),
  article("private", "私有", "热门头条", 1, 999, { visibility: "private" }),
  article("future", "未来时间", "热门头条", -1, 999)
], { now, limit: 20 });

assert.deepEqual(selected.map((item) => item.id), ["crime", "china", "china-display", "ice", "ice-legacy", "politics"]);
assert.deepEqual(ranking.RANK_ALLOWED_CATEGORIES, ["热门头条", "美国时政", "美国警情", "ICE执法动态"]);
assert.ok(selected.every(ranking.isAllowedRankCategory), "only the four approved homepage categories may enter the rank");
assert.ok(!selected.some((item) => ["bia", "immigration", "asylum", "important"].includes(item.id)), "BIA and all non-whitelisted categories must be excluded");
assert.ok(selected.every((item) => now - Date.parse(item.published_at) <= ranking.RANK_MAX_AGE_MS));

const home = fs.readFileSync(new URL("../articles-home.js", import.meta.url), "utf8");
const compat = fs.readFileSync(new URL("../articles-home-live-fix.js", import.meta.url), "utf8");
const bundle = fs.readFileSync(new URL("../netlify/functions/public-home-bundle.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const snapshot = fs.readFileSync(new URL("./inject-static-news-links.mjs", import.meta.url), "utf8");

assert.match(home, /TRRB_HOME_RANKING\?\.select24hRank/);
assert.match(home, /allowedCategories = new Set\(\["热门头条", "美国时政", "美国警情", "ICE执法动态"\]\)/, "fallback rank must enforce the same whitelist");
assert.match(home, /window\.TRRB_render24hRank = renderRank/);
assert.doesNotMatch(home, /generateHeat\(/, "rank must not display invented traffic counts");
assert.doesNotMatch(compat, /function buildMixedRank|RANK_CATEGORY_KEYS/, "compatibility shim must not own a second rank algorithm");
assert.match(compat, /TRRB_renderMixed24hRank = \(articles\) => window\.TRRB_render24hRank/);
assert.match(bundle, /is_breaking,rank_score/);
assert.ok(index.indexOf("homepage-ranking.js") < index.indexOf("articles-home.js"), "ranking helper must load before the renderer");
assert.match(snapshot, /ranking\.select24hRank\(rows, \{ limit: 10 \}\)/, "build-time rank snapshot must use the same strict selector");

console.log("homepage-ranking-contract: PASS");

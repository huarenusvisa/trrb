#!/usr/bin/env node
import fs from "node:fs";

const files = {
  build: fs.readFileSync("scripts/generate-sitemaps.mjs", "utf8"),
  live: fs.readFileSync("netlify/edge-functions/sitemap-live.ts", "utf8"),
  news: fs.readFileSync("netlify/edge-functions/news-sitemap-live.ts", "utf8"),
  article: fs.readFileSync("netlify/edge-functions/article-prerender.ts", "utf8"),
  audit: fs.readFileSync("scripts/seo-integrity-audit.mjs", "utf8"),
  productionAudit: fs.readFileSync("scripts/round12-production-audit.mjs", "utf8"),
  freshnessAudit: fs.readFileSync("scripts/round13-publish-freshness-audit.mjs", "utf8"),
  feedBuild: fs.readFileSync("scripts/generate-feed.mjs", "utf8"),
  feedLive: fs.readFileSync("netlify/edge-functions/feed-live.ts", "utf8")
};

const failures = [];
const requireAll = (label, names, pattern) => {
  for (const name of names) if (!pattern.test(files[name])) failures.push(`${label}: ${name}`);
};
const forbidAll = (label, names, pattern) => {
  for (const name of names) if (pattern.test(files[name])) failures.push(`${label}: ${name}`);
};

requireAll("300-character index threshold missing", ["build", "live", "news", "article", "productionAudit", "freshnessAudit"], /MIN_INDEXABLE_BODY_LENGTH\s*=\s*300/);
requireAll("short-title gate missing", ["build", "live", "news", "article", "productionAudit", "freshnessAudit"], /MIN_INDEXABLE_TITLE_LENGTH\s*=\s*8/);
requireAll("5,000 article crawl-budget cap missing", ["build", "live", "productionAudit"], /MAX_SITEMAP_ARTICLES\s*=\s*5000/);
forbidAll("short ICE indexing exception must not return", ["build", "live", "news", "article"], /preservedShortIce|preserved-short-ice|if\s*\(isIceArticle\([^)]*\)\)\s*return/i);
if (!/STRICT_INDEXABLE_SEO_GATE_V2/.test(files.audit)) failures.push("strict indexable SEO gate marker missing");
if (!/live-supabase-v9-quality-budget-canonical/.test(files.live)) failures.push("live sitemap quality-budget version marker missing");
requireAll("legacy category-name to canonical-slug compatibility missing", ["build", "live", "news", "feedBuild", "feedLive"], /fallbackSlug/);

if (failures.length) {
  console.error(`SEO quality contract failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("SEO quality contract passed: 300-character body, 8-character title, 5,000-article sitemap cap, no short-ICE exception, strict metadata gate.");

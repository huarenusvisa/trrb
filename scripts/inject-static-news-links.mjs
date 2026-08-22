#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ranking from "../homepage-ranking.js";

const ROOT = process.cwd();
const SITE = "https://trrb.net";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const FALLBACK_CATEGORY_SLUGS = new Map([
  ["重要新闻", "important-news"],
  ["热门头条", "hot-headlines"],
  ["美国时政", "us-politics"],
  ["美国警情", "us-crime"],
  ["中国官场", "china-officialdom"],
  ["移民美国", "immigration"],
  ["庇护百科", "asylum"],
  ["驱逐快报", "deport"],
  ["ICE执法动态", "ice"],
  ["ICE执法", "ice"]
]);
const SECTION_ALIASES = new Map([
  ["important", "important-news"], ["hot", "hot-headlines"], ["politics", "us-politics"],
  ["crime", "us-crime"], ["china", "china-officialdom"]
]);

function decodeXml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attr(value = "") { return escapeHtml(value); }
function clean(value = "") { return String(value || "").replace(/\s+/g, " ").trim(); }
function canonicalSection(value = "") { return SECTION_ALIASES.get(clean(value)) || clean(value); }

function extract(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}

function parseNewsSitemap(xml) {
  const rows = [];
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const loc = extract(block, "loc");
    const title = extract(block, "news:title");
    const date = extract(block, "news:publication_date");
    if (!loc || !title) continue;
    let url;
    try { url = new URL(loc, SITE); } catch { continue; }
    if (url.hostname !== "trrb.net" && url.hostname !== "www.trrb.net") continue;
    rows.push({ loc: `${url.pathname}${url.search}`, title, date, ts: Date.parse(date) || 0 });
  }
  return dedupeRows(rows);
}

function dedupeRows(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : [])
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .filter((row) => {
      if (!row?.loc || !row?.title || seen.has(row.loc)) return false;
      seen.add(row.loc);
      return true;
    });
}

async function rest(table, params) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`${table} ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function latestDatabaseRows(limit = 120) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const [categories, articles] = await Promise.all([
    rest("categories", { select: "id,name,slug", is_active: "eq.true", limit: "500" }),
    rest("articles", {
      select: "id,title,slug,category_id,category_name,topic_key,published_at,created_at,status,visibility,is_breaking,rank_score",
      status: "eq.published",
      visibility: "eq.public",
      order: "published_at.desc.nullslast,created_at.desc",
      limit: String(limit)
    })
  ]);
  const byId = new Map(categories.map((row) => [String(row.id || ""), row]));
  const byName = new Map(categories.map((row) => [clean(row.name), row]));
  return dedupeRows(articles.map((article) => {
    const id = clean(article.id);
    const slug = clean(article.slug) || id;
    if (!slug || !clean(article.title)) return null;
    const topic = clean(article.topic_key).toLowerCase();
    let section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : "";
    if (!section) {
      const category = byId.get(String(article.category_id || "")) || byName.get(clean(article.category_name));
      section = canonicalSection(category?.slug || FALLBACK_CATEGORY_SLUGS.get(clean(article.category_name)) || "news");
    }
    const date = article.published_at || article.created_at || "";
    return {
      loc: `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`,
      title: clean(article.title),
      date,
      ts: Date.parse(date) || 0,
      published_at: date,
      status: article.status,
      visibility: article.visibility,
      category_name: clean(article.category_name),
      is_breaking: article.is_breaking === true,
      rank_score: Number(article.rank_score || 0)
    };
  }).filter(Boolean));
}

function replaceExact(html, needle, replacement, file) {
  if (!html.includes(needle)) throw new Error(`${file}: 找不到静态快照注入点 ${needle.slice(0, 80)}`);
  return html.replace(needle, replacement);
}

function replaceContainerBefore(html, id, nextElementNeedle, replacement, file) {
  const startPattern = new RegExp(`<div\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, "i");
  const start = html.search(startPattern);
  if (start < 0) throw new Error(`${file}: 找不到 #${id} 静态快照容器`);
  const boundary = html.indexOf(nextElementNeedle, start);
  if (boundary < 0) throw new Error(`${file}: 找不到 #${id} 后续边界 ${nextElementNeedle}`);
  const segment = html.slice(start, boundary);
  if (!segment.trimEnd().endsWith("</div>")) {
    throw new Error(`${file}: #${id} 静态快照容器结构异常`);
  }
  return html.slice(0, start) + replacement + html.slice(boundary);
}

function shortDate(value) {
  const t = Date.parse(value || "");
  if (!Number.isFinite(t)) return "最新";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
}

function homeTopSnapshot(rows) {
  const items = rows.slice(0, 10).map((row, i) => `
        <article class="seo-static-news-item">
          <b>${i + 1}</b>
          <div class="seo-static-news-copy"><h2><a href="${attr(row.loc)}">${escapeHtml(row.title)}</a></h2><small>${escapeHtml(shortDate(row.date))}</small></div>
        </article>`).join("");
  return `<aside class="top-list" id="top-list" data-seo-static-snapshot="build">
      <div class="seo-static-news-links" aria-label="最新新闻">${items}
      </div>
    </aside>`;
}

function homeRankSnapshot(rows) {
  const rankRows = ranking.select24hRank(rows, { limit: 10 });
  return `<ol id="rank-list" data-seo-static-snapshot="build">${rankRows.map((row) => `<li><a href="${attr(row.loc)}">${escapeHtml(row.title)}</a></li>`).join("")}</ol>`;
}

function homeTickerSnapshot(rows) {
  return `<div class="ticker" id="ticker" data-seo-static-snapshot="build">${rows.slice(0, 6).map((row) => `<a href="${attr(row.loc)}">${escapeHtml(row.title)}</a>`).join(" <span aria-hidden=\"true\"> · </span> ")}</div>`;
}

function iceSnapshot(rows) {
  const items = rows.slice(0, 12).map((row) => `
        <article class="seo-static-ice-item">
          <a href="${attr(row.loc)}"><strong>${escapeHtml(row.title)}</strong><time datetime="${attr(row.date)}">${escapeHtml(shortDate(row.date))}</time></a>
        </article>`).join("");
  return `<div id="ice-news-list" class="ice-news-list" data-seo-static-snapshot="build">${items}
      </div>`;
}

function trumpSnapshot(rows) {
  const items = rows.slice(0, 20).map((row) => `
        <article class="trump-item no-image" data-seo-static-snapshot="build">
          <div><h3><a href="${attr(row.loc)}">${escapeHtml(row.title)}</a></h3><div class="trump-meta">${escapeHtml(shortDate(row.date))} · 特朗普实时动态</div></div>
        </article>`).join("");
  return `<div id="trump-feed" class="trump-feed" data-seo-static-snapshot="build">${items}
      </div>`;
}

function countArticleLinks(html) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((href) => /^\/(?:ice|trump|important-news|hot-headlines|us-politics|us-crime|china-officialdom|immigration|asylum|deport|news)\//.test(href)).length;
}

async function updateHome(rows, rankRows = rows) {
  const file = path.join(ROOT, "index.html");
  let html = await readFile(file, "utf8");
  html = replaceExact(html, '<div class="ticker" id="ticker"></div>', homeTickerSnapshot(rows), "index.html");
  html = replaceExact(html, '<aside class="top-list" id="top-list"></aside>', homeTopSnapshot(rows), "index.html");
  html = replaceExact(html, '<ol id="rank-list"></ol>', homeRankSnapshot(rankRows), "index.html");
  const count = countArticleLinks(html);
  if (count < 10) throw new Error(`index.html: 构建后可抓取新闻链接不足，只有 ${count}`);
  await writeFile(file, html);
  return count;
}

async function updateIce(fileName, rows) {
  const file = path.join(ROOT, fileName);
  let html = await readFile(file, "utf8");
  html = replaceExact(html, '<div id="ice-news-list" class="ice-news-list"></div>', iceSnapshot(rows), fileName);
  const count = [...html.matchAll(/<a\b[^>]*href=["'](\/ice\/[^"']+)["']/gi)].length;
  if (count < 3) throw new Error(`${fileName}: 构建后可抓取 ICE 新闻链接不足，只有 ${count}`);
  await writeFile(file, html);
  return count;
}

async function updateTrump(rows) {
  const fileName = "trump/index.html";
  const file = path.join(ROOT, fileName);
  let html = await readFile(file, "utf8");
  html = replaceContainerBefore(
    html,
    "trump-feed",
    '<button id="trump-more"',
    trumpSnapshot(rows),
    fileName
  );
  const count = [...html.matchAll(/<a\b[^>]*href=["'](\/trump\/[^"']+)["']/gi)].length;
  if (count < 1) throw new Error(`${fileName}: 构建后没有可抓取特朗普新闻链接`);
  await writeFile(file, html);
  return count;
}

const sitemap = await readFile(path.join(ROOT, "news-sitemap.xml"), "utf8");
const newsRows = parseNewsSitemap(sitemap);
let databaseRows = [];
try { databaseRows = await latestDatabaseRows(160); }
catch (error) { console.warn(`静态快照数据库补充不可用：${error.message}`); }
const rows = dedupeRows([...newsRows, ...databaseRows]);
if (rows.length < 10) throw new Error(`可用于首页静态快照的已发布新闻不足：${rows.length}`);

const iceRows = rows.filter((row) => row.loc.startsWith("/ice/") && !row.loc.startsWith("/ice/news"));
if (iceRows.length < 3) throw new Error(`可用于 ICE 静态快照的已发布新闻不足：${iceRows.length}`);
const trumpRows = rows.filter((row) => row.loc.startsWith("/trump/"));

const homeCount = await updateHome(rows, databaseRows.length ? databaseRows : rows);
const iceLiveCount = await updateIce("topic/ice/live-v6.html", iceRows);
const iceLegacyCount = await updateIce("topic/ice/index.html", iceRows);
let trumpCount = 0;
if (trumpRows.length) trumpCount = await updateTrump(trumpRows);
else console.warn("当前没有特朗普专题条目，保留运行时专题加载，不阻断部署。");

console.log(`SEO静态发现链完成：News48h ${newsRows.length}；DB补充 ${databaseRows.length}；首页 ${homeCount}；/ice ${iceLiveCount}；/topic/ice ${iceLegacyCount}；/trump ${trumpCount}。`);

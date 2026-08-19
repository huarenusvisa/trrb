#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SITE = "https://trrb.net";

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

function attr(value = "") {
  return escapeHtml(value);
}

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
  const seen = new Set();
  return rows
    .sort((a, b) => b.ts - a.ts)
    .filter((row) => {
      if (seen.has(row.loc)) return false;
      seen.add(row.loc);
      return true;
    });
}

function replaceExact(html, needle, replacement, file) {
  if (!html.includes(needle)) {
    throw new Error(`${file}: 找不到静态快照注入点 ${needle.slice(0, 80)}`);
  }
  return html.replace(needle, replacement);
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
  return `<ol id="rank-list" data-seo-static-snapshot="build">${rows.slice(0, 10).map((row) => `<li><a href="${attr(row.loc)}">${escapeHtml(row.title)}</a></li>`).join("")}</ol>`;
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

async function updateHome(rows) {
  const file = path.join(ROOT, "index.html");
  let html = await readFile(file, "utf8");
  html = replaceExact(html, '<div class="ticker" id="ticker"></div>', homeTickerSnapshot(rows), "index.html");
  html = replaceExact(html, '<aside class="top-list" id="top-list"></aside>', homeTopSnapshot(rows), "index.html");
  html = replaceExact(html, '<ol id="rank-list"></ol>', homeRankSnapshot(rows), "index.html");
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
  const needle = '<div id="trump-feed" class="trump-feed"><div class="trump-loading">正在读取特朗普本人最新动态…</div></div>';
  html = replaceExact(html, needle, trumpSnapshot(rows), fileName);
  const count = [...html.matchAll(/<a\b[^>]*href=["'](\/trump\/[^"']+)["']/gi)].length;
  if (count < 1) throw new Error(`${fileName}: 构建后没有可抓取特朗普新闻链接`);
  await writeFile(file, html);
  return count;
}

const sitemap = await readFile(path.join(ROOT, "news-sitemap.xml"), "utf8");
const rows = parseNewsSitemap(sitemap);
if (rows.length < 10) throw new Error(`news-sitemap.xml 新闻条目不足：${rows.length}`);
const iceRows = rows.filter((row) => row.loc.startsWith("/ice/") && !row.loc.startsWith("/ice/news"));
if (iceRows.length < 3) throw new Error(`news-sitemap.xml ICE 条目不足：${iceRows.length}`);
const trumpRows = rows.filter((row) => row.loc.startsWith("/trump/"));

const homeCount = await updateHome(rows);
const iceLiveCount = await updateIce("topic/ice/live-v6.html", iceRows);
const iceLegacyCount = await updateIce("topic/ice/index.html", iceRows);
let trumpCount = 0;
if (trumpRows.length) trumpCount = await updateTrump(trumpRows);
else console.warn("news-sitemap.xml 当前48小时没有特朗普专题条目，保留运行时专题加载，不阻断部署。");

console.log(`SEO静态发现链修复完成：首页 ${homeCount}；/ice ${iceLiveCount}；/topic/ice ${iceLegacyCount}；/trump ${trumpCount}。`);

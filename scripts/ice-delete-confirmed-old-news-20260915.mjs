#!/usr/bin/env node
import process from "node:process";

const BASE = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TARGETS = [
  "佐治亚现代电池制造厂",
  "Leqaa Kordia"
];

function headers(prefer = "") {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${BASE}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(data?.message || data?.details || data?.raw || `Supabase ${response.status}`);
  return data;
}
function matches(row) {
  const title = String(row?.title || "").toLowerCase();
  return TARGETS.some((target) => title.includes(target.toLowerCase()));
}
async function rows(table) {
  const query = {
    select: "id,title",
    or: "(title.ilike.*佐治亚现代电池制造厂*,title.ilike.*Leqaa Kordia*)",
    limit: "100"
  };
  const result = await rest(table, { query });
  return (Array.isArray(result) ? result : []).filter(matches);
}
async function remove(table, matches) {
  for (const row of matches) await rest(table, { method: "DELETE", query: { id: `eq.${row.id}` }, prefer: "return=minimal" });
}
async function main() {
  if (!BASE || !KEY) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  const [stories, articles] = await Promise.all([rows("ice_stories"), rows("articles")]);
  await remove("ice_stories", stories);
  await remove("articles", articles);
  const [remainingStories, remainingArticles] = await Promise.all([rows("ice_stories"), rows("articles")]);
  if (remainingStories.length || remainingArticles.length) throw new Error("指定旧闻删除后仍然存在，已停止并报告");
  console.log(JSON.stringify({
    stage: "ice-delete-confirmed-old-news-20260915",
    deleted_story_count: stories.length,
    deleted_article_count: articles.length,
    deleted_titles: [...stories, ...articles].map((row) => row.title),
    verified_remaining: 0
  }, null, 2));
}

main().catch((error) => { console.error("删除已确认旧闻失败：", error); process.exitCode = 1; });

#!/usr/bin/env node
const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!base || !key) throw new Error("Missing Supabase environment variables");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
async function get(table, query = {}) {
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}
function group(rows, field) {
  return rows.reduce((out, row) => {
    const key = row[field] || "unknown";
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {});
}
const now = new Date();
const twoHours = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const posts2h = await get("ice_posts", { select: "id,x_post_id,source_username,source_created_at,created_at,processing_status", created_at: `gte.${twoHours}`, order: "created_at.desc", limit: "100" });
const stories2h = await get("ice_stories", { select: "id,title,status,human_review_status,updated_at,created_at", updated_at: `gte.${twoHours}`, order: "updated_at.desc", limit: "100" });
const latestStories = await get("ice_stories", { select: "id,title,status,human_review_status,updated_at,created_at", order: "updated_at.desc", limit: "15" });
const latestPosts = await get("ice_posts", { select: "id,x_post_id,source_username,source_created_at,created_at,processing_status", order: "created_at.desc", limit: "15" });
const recentArticles = await get("articles", { select: "id,title,status,category_name,topic_key,published_at,created_at", created_at: `gte.${day}`, order: "created_at.desc", limit: "50" });
const iceArticles = recentArticles.filter((row) => row.topic_key === "ice" || row.category_name === "驱逐快报");
console.log("DIAGNOSTIC_TIME_UTC", now.toISOString());
console.log("ICE_POSTS_LAST_2H", posts2h.length, JSON.stringify(group(posts2h, "processing_status")));
console.log("ICE_STORIES_LAST_2H", stories2h.length, JSON.stringify(group(stories2h, "status")));
console.log("ICE_ARTICLES_LAST_24H", iceArticles.length, JSON.stringify(group(iceArticles, "status")));
console.log("LATEST_ICE_STORIES");
for (const row of latestStories) console.log(JSON.stringify({ title: row.title, status: row.status, human: row.human_review_status, updated_at: row.updated_at, created_at: row.created_at }));
console.log("LATEST_ICE_POSTS");
for (const row of latestPosts) console.log(JSON.stringify({ source: row.source_username, x_post_id: row.x_post_id, source_created_at: row.source_created_at, created_at: row.created_at, processing_status: row.processing_status }));
console.log("RECENT_ICE_ARTICLES");
for (const row of iceArticles) console.log(JSON.stringify({ title: row.title, status: row.status, category: row.category_name, topic: row.topic_key, published_at: row.published_at, created_at: row.created_at }));
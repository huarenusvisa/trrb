import {loadChinaPeople,CHINA_PEOPLE_QUERY} from '../shared/china-person-registry.mjs';
import policy from "../../article-editorial-policy.js";
import { rest } from "./_shared/supabase-admin.js";
import { isChinaHotCategory, isChinaHotHeadline } from "./_shared/china-hot-headlines.js";

const CORE_CATEGORIES = ["热门头条", "美国时政", "美国警情", "移民美国", "ICE执法动态"];
const RETIRED_HOME_CATEGORIES = new Set(["重要新闻", "中国官场", "庇护百科"]);
const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

function response(statusCode, body) {
  return new Response(statusCode === 204 ? null : JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function timeOf(row) {
  const time = Date.parse(row?.published_at || row?.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

function homeCutoffIso() {
  return new Date(Date.now() - HOME_MAX_AGE_MS).toISOString();
}

async function fetchArticles(limit, category = "") {
  const query = {
    select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,is_breaking,rank_score,publication_scope:metadata->>publication_scope",
    status: "eq.published",
    visibility: "eq.public",
    published_at: `gte.${homeCutoffIso()}`,
    order: "published_at.desc.nullslast,created_at.desc",
    limit: String(limit)
  };
  if (category) query.category_name = `eq.${category}`;
  const rows = await rest("articles", { query });
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => timeOf(row) >= Date.now() - HOME_MAX_AGE_MS)
    .filter((row) => !isChinaHotCategory(row?.category_name) || isChinaHotHeadline(row.title, `${row.summary || ""} ${row.content || ""}`))
    .filter((row) => !RETIRED_HOME_CATEGORIES.has(String(row?.category_name || "").trim()));
}

function categoryCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const category = String(row?.category_name || "").trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return counts;
}

export default async (event: Request) => {
  if (event.method === "OPTIONS") return response(204, {});
  if (event.method !== "GET") return response(405, { error: "Method not allowed" });

  try {
    await loadChinaPeople(()=>rest('china_political_people',{query:CHINA_PEOPLE_QUERY}));
    const globalLimit = Math.min(Math.max(Number(new URL(event.url).searchParams.get("limit") || 200), 20), 200);
    const perCategory = Math.min(Math.max(Number(new URL(event.url).searchParams.get("per_category") || 12), 3), 20);

    const { editorialTopics, POLITICS_FILTER } = await import("../shared/editorial-topics.mjs");
    const globalRows = await fetchArticles(globalLimit);
    const politicalRows = await rest("articles", {query: {
      select: "id,title,slug,summary,content,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,publication_scope:metadata->>publication_scope",
      status: "eq.published", visibility: "eq.public", published_at: `gte.${homeCutoffIso()}`,
      or: POLITICS_FILTER, order: "published_at.desc.nullslast,created_at.desc", limit: String(perCategory)
    }}).catch(() => []);
    const counts = categoryCounts(globalRows);
    const sparseCategories = CORE_CATEGORIES.filter((category) => (counts.get(category) || 0) < perCategory);
    const supplements = await Promise.all(
      sparseCategories.map((category) => fetchArticles(perCategory, category).catch(() => []))
    );

    const seen = new Set();
    const articles = [globalRows, politicalRows, ...supplements].flat()
      .filter((row) => {
        const id = String(row?.id || "").trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => timeOf(b) - timeOf(a))
      .map(row => ({ ...row, body_character_count: policy.bodyCharacterCount(row.content), editorial_policy_version: policy.VERSION, editorial_topics: editorialTopics(row) }));

    return response(200, {
      mode: "homepage",
      freshness_hours: 96,
      generated_at: new Date().toISOString(),
      count: articles.length,
      database_queries: 2 + sparseCategories.length,
      supplemented_categories: sparseCategories,
      retired_home_categories: [...RETIRED_HOME_CATEGORIES],
      articles
    });
  } catch (error) {
    console.error("Public homepage bundle error:", error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

export const config = {};

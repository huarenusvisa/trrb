import {loadChinaPeople,CHINA_PEOPLE_QUERY} from '../shared/china-person-registry.mjs';
import policy from "../../article-editorial-policy.js";
import { rest } from "./_shared/supabase-admin.js";
import { isIceEnforcementText } from "./_shared/ice-enforcement.js";
import { isUsImmigrationText } from "./_shared/us-immigration-category.js";
import { isChinaHotCategory, isChinaHotHeadline } from "./_shared/china-hot-headlines.js";

const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

function json(statusCode, body) {
  return new Response(statusCode === 204 ? null : JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function articleTime(row) {
  const time = Date.parse(row?.published_at || row?.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

export default async (event: Request) => {
  if (event.method === "OPTIONS") return json(204, {});
  if (event.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    await loadChinaPeople(()=>rest('china_political_people',{query:CHINA_PEOPLE_QUERY}));
    const { editorialTopics } = await import("../shared/editorial-topics.mjs");
    const requested = Number(new URL(event.url).searchParams.get("limit") || 120);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 1), 200);
    const category = String(new URL(event.url).searchParams.get("category") || "").trim().slice(0, 80);
    const cutoffMs = Date.now() - HOME_MAX_AGE_MS;
    const query = {
      select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at,publication_scope:metadata->>publication_scope",
      status: "eq.published",
      visibility: "eq.public",
      published_at: `gte.${new Date(cutoffMs).toISOString()}`,
      order: "published_at.desc.nullslast,created_at.desc",
      limit: String(limit)
    };
    if (category === "ICE执法动态") {
      query.or = "(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报)";
    } else if (category) {
      query.category_name = "eq." + category;
    }
    const rows = await rest("articles", { query });

    const articles = (Array.isArray(rows) ? rows : []).filter((row) => {
      if (articleTime(row) < cutoffMs) return false;
      if (category === "ICE执法动态") return isIceEnforcementText(row.title, row.summary);
      if (category === "移民美国") return isUsImmigrationText(row.title, `${row.summary || ""} ${row.content || ""}`);
      if (isChinaHotCategory(category) || isChinaHotCategory(row.category_name)) {
        return isChinaHotHeadline(row.title, `${row.summary || ""} ${row.content || ""}`);
      }
      return true;
    });
    return json(200, {
      freshness_hours: 96,
      generated_at: new Date().toISOString(),
      count: articles.length,
      articles: articles.map(row => ({...row, body_character_count: policy.bodyCharacterCount(row.content), editorial_policy_version: policy.VERSION, editorial_topics: editorialTopics(row)}))
    });
  } catch (error) {
    console.error("Public home articles error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

export const config = {};

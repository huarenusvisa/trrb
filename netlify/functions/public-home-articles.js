const { rest } = require("./_shared/supabase-admin");
const { isIceEnforcementText } = require("./_shared/ice-enforcement");
const { isUsImmigrationText } = require("./_shared/us-immigration-category");

const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function articleTime(row) {
  const time = Date.parse(row?.published_at || row?.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const requested = Number(event.queryStringParameters?.limit || 120);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 1), 200);
    const category = String(event.queryStringParameters?.category || "").trim().slice(0, 80);
    const cutoffMs = Date.now() - HOME_MAX_AGE_MS;
    const query = {
      select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at",
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
      return true;
    });
    return json(200, {
      freshness_hours: 96,
      generated_at: new Date().toISOString(),
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("Public home articles error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

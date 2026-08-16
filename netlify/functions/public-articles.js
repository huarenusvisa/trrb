const { rest } = require("./_shared/supabase-admin");

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

function cleanSearch(value) {
  return String(value || "").trim().replace(/[(),]/g, " ").replace(/\s+/g, " ").slice(0, 120);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const requestedLimit = Number(event.queryStringParameters?.limit || 30);
    const requestedOffset = Number(event.queryStringParameters?.offset || 0);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 30, 1), 60);
    const offset = Math.max(Number.isFinite(requestedOffset) ? requestedOffset : 0, 0);
    const category = String(event.queryStringParameters?.category || "").trim().slice(0, 80);
    const q = cleanSearch(event.queryStringParameters?.q || "");

    const query = {
      select: "id,title,slug,summary,category_name,cover_image,author,status,published_at,created_at",
      status: "eq.published",
      order: "published_at.desc.nullslast,created_at.desc",
      limit: String(limit),
      offset: String(offset)
    };
    if (category) query.category_name = "eq." + category;
    if (q) query.or = `(title.ilike.*${q}*,summary.ilike.*${q}*)`;

    const rows = await rest("articles", { query });
    const articles = Array.isArray(rows) ? rows : [];
    return json(200, {
      generated_at: new Date().toISOString(),
      count: articles.length,
      offset,
      limit,
      next_offset: articles.length === limit ? offset + limit : null,
      has_more: articles.length === limit,
      category: category || null,
      q: q || null,
      articles
    });
  } catch (error) {
    console.error("Public articles error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const requested = Number(event.queryStringParameters?.limit || 120);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 120, 20), 200);
    const rows = await rest("articles", {
      query: {
        select: "id,title,slug,summary,content,category_name,cover_image,author,status,published_at,created_at",
        status: "eq.published",
        order: "published_at.desc.nullslast,created_at.desc",
        limit: String(limit)
      }
    });

    const articles = Array.isArray(rows) ? rows : [];
    return json(200, {
      generated_at: new Date().toISOString(),
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("Public home articles error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

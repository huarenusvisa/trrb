const { rest } = require("./_shared/supabase-admin");

const CORE_CATEGORIES = ["重要新闻", "热门头条", "美国时政", "美国警情", "中国官场", "庇护百科"];

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function timeOf(row) {
  const time = Date.parse(row?.published_at || row?.created_at || "");
  return Number.isFinite(time) ? time : 0;
}

async function fetchArticles(limit, category = "") {
  const query = {
    select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,status,published_at,created_at",
    status: "eq.published",
    order: "published_at.desc.nullslast,created_at.desc",
    limit: String(limit)
  };
  if (category) query.category_name = `eq.${category}`;
  const rows = await rest("articles", { query });
  return Array.isArray(rows) ? rows : [];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "GET") return response(405, { error: "Method not allowed" });

  try {
    const globalLimit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 200), 20), 200);
    const perCategory = Math.min(Math.max(Number(event.queryStringParameters?.per_category || 12), 3), 20);
    const [globalRows, ...supplements] = await Promise.all([
      fetchArticles(globalLimit),
      ...CORE_CATEGORIES.map((category) => fetchArticles(perCategory, category).catch(() => []))
    ]);

    const seen = new Set();
    const articles = [globalRows, ...supplements].flat()
      .filter((row) => {
        const id = String(row?.id || "").trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .sort((a, b) => timeOf(b) - timeOf(a));

    return response(200, {
      mode: "homepage",
      generated_at: new Date().toISOString(),
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("Public homepage bundle error:", error);
    return response(error.statusCode || 500, { error: error.message || String(error) });
  }
};

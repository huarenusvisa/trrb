const { SUPABASE_URL, SERVICE_KEY } = require("./_shared/supabase-admin");

const CATEGORY_DEFINITIONS = new Map([
  ["重要新闻", { path: "/important-news" }],
  ["热门头条", { path: "/hot-headlines" }],
  ["美国时政", { path: "/us-politics" }],
  ["美国警情", { path: "/us-crime" }],
  ["中国官场", { path: "/china-officialdom" }],
  ["移民美国", { path: "/immigration" }],
  ["庇护百科", { path: "/asylum", mode: "asylum" }],
  ["ICE执法动态", { path: "/ice/news", mode: "ice" }]
]);

// Derived from config/immigration-knowledge.js humanitarian keywords. Keep this
// focused on terms that identify humanitarian/asylum coverage in news titles and
// summaries without broad English fragments that can create false positives.
const ASYLUM_TERMS = [
  "庇护", "政治庇护", "asylum", "i-589", "i589", "可信恐惧", "合理恐惧",
  "防止递解", "withholding", "禁止酷刑", "vawa", "家暴绿卡", "u签证",
  "t签证", "人口贩运", "sijs", "特殊青少年", "tps", "临时保护身份",
  "难民", "人道保护", "移民法庭"
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
      "X-TRRB-Category-Page": "category-page-v1"
    },
    body: JSON.stringify(body)
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function asylumOrFilter() {
  const clauses = [];
  for (const raw of ASYLUM_TERMS) {
    const term = String(raw).replace(/[*,()]/g, " ").trim();
    if (!term) continue;
    clauses.push(`title.ilike.*${term}*`, `summary.ilike.*${term}*`);
  }
  return `(${clauses.join(",")})`;
}

function applyCategoryFilter(url, name, definition) {
  if (definition.mode === "ice") {
    url.searchParams.set("or", "(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报)");
    return;
  }
  if (definition.mode === "asylum") {
    url.searchParams.set("or", asylumOrFilter());
    return;
  }
  url.searchParams.set("category_name", `eq.${name}`);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(503, { error: "Category data service unavailable" });

  const category = String(event.queryStringParameters?.category || "").trim().slice(0, 80);
  const definition = CATEGORY_DEFINITIONS.get(category);
  if (!definition) return json(400, { error: "Unsupported public category" });

  const page = clampInt(event.queryStringParameters?.page, 1, 1, 10000);
  const pageSize = clampInt(event.queryStringParameters?.page_size, 24, 1, 50);
  const offset = (page - 1) * pageSize;

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,status,published_at,created_at");
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    applyCategoryFilter(url, category, definition);

    const response = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Accept: "application/json",
        Prefer: "count=exact"
      }
    });
    if (!response.ok) {
      const text = await response.text();
      console.error("Public category page query failed", response.status, text.slice(0, 300));
      return json(502, { error: "Category query failed" });
    }

    const rows = await response.json();
    const contentRange = response.headers.get("content-range") || "";
    const totalMatch = contentRange.match(/\/(\d+|\*)$/);
    const total = totalMatch && totalMatch[1] !== "*" ? Number(totalMatch[1]) : null;
    const articles = Array.isArray(rows) ? rows : [];
    const totalPages = Number.isFinite(total) ? Math.max(1, Math.ceil(total / pageSize)) : null;

    return json(200, {
      generated_at: new Date().toISOString(),
      category,
      canonical_path: definition.path,
      page,
      page_size: pageSize,
      count: articles.length,
      total,
      total_pages: totalPages,
      has_previous: page > 1,
      has_more: Number.isFinite(total) ? page * pageSize < total : articles.length === pageSize,
      articles
    });
  } catch (error) {
    console.error("Public category page error", error);
    return json(500, { error: error.message || String(error) });
  }
};

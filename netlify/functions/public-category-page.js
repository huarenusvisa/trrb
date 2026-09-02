const { SUPABASE_URL, SERVICE_KEY } = require("./_shared/supabase-admin");
const { isIceEnforcementText } = require("./_shared/ice-enforcement");
const { isUsImmigrationText } = require("./_shared/us-immigration-category");
const { isChinaHotHeadline } = require("./_shared/china-hot-headlines");

const CATEGORY_DEFINITIONS = new Map([
  ["重要新闻", { path: "/important-news" }],
  ["热门头条", { path: "/hot-headlines", mode: "china-hot" }],
  ["中国热门头条", { path: "/hot-headlines", mode: "china-hot" }],
  ["美国时政", { path: "/us-politics" }],
  ["美国警情", { path: "/us-crime" }],
  ["中国官场", { path: "/china-officialdom" }],
  ["移民美国", { path: "/immigration", mode: "us-immigration" }],
  ["庇护百科", { path: "/asylum", mode: "asylum" }],
  ["ICE执法动态", { path: "/ice/news", mode: "ice" }]
]);

// Keep this query intentionally compact. Structured humanitarian knowledge is
// selected by category prefix; a small headline/summary set adds current news.
// The former 34 ILIKE clauses repeatedly timed out on paginated edge requests.
const ASYLUM_TERMS = ["庇护", "asylum", "i-589", "移民法庭"];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
      "X-TRRB-Category-Page": "category-page-v2-public-only"
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
  const clauses = ["category_name.like.移民美国·人道主义庇护·*"];
  for (const raw of ASYLUM_TERMS) {
    const term = String(raw).replace(/[*,()]/g, " ").trim();
    if (!term) continue;
    clauses.push(`title.ilike.*${term}*`, `summary.ilike.*${term}*`);
  }
  return `(${clauses.join(",")})`;
}

function applyCategoryFilter(url, name, definition) {
  if (definition.mode === "china-hot") {
    url.searchParams.set("or", "(category_name.eq.热门头条,category_name.eq.中国热门头条)");
    return;
  }
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
    const includeContent = ["ice", "us-immigration", "china-hot"].includes(definition.mode);
    const select = "id,title,slug,summary,category_id,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at"
      + (includeContent ? ",content" : "");
    url.searchParams.set("select", select);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("visibility", "eq.public");
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
    const rawArticles = Array.isArray(rows) ? rows : [];
    const contentFilter = definition.mode === "ice"
      ? (row) => isIceEnforcementText(row.title, row.summary)
      : definition.mode === "us-immigration"
        ? (row) => isUsImmigrationText(row.title, `${row.summary || ""} ${row.content || ""}`)
        : definition.mode === "china-hot"
          ? (row) => isChinaHotHeadline(row.title, `${row.summary || ""} ${row.content || ""}`)
        : null;
    const eligibleArticles = contentFilter ? rawArticles.filter(contentFilter) : rawArticles;
    const articles = eligibleArticles.map(({ content: _content, ...row }) => row);
    const filtered = Boolean(contentFilter) && eligibleArticles.length !== rawArticles.length;
    const totalPages = Number.isFinite(total) ? Math.max(1, Math.ceil(total / pageSize)) : null;

    return json(200, {
      generated_at: new Date().toISOString(),
      category,
      canonical_path: definition.path,
      page,
      page_size: pageSize,
      count: articles.length,
      total: filtered ? null : total,
      total_pages: filtered ? null : totalPages,
      has_previous: page > 1,
      has_more: filtered
        ? rawArticles.length === pageSize
        : (Number.isFinite(total) ? page * pageSize < total : articles.length === pageSize),
      articles
    });
  } catch (error) {
    console.error("Public category page error", error);
    return json(500, { error: error.message || String(error) });
  }
};

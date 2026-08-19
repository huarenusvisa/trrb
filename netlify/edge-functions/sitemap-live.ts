const SITE = "https://trrb.net";
const MIN_INDEXABLE_BODY_LENGTH = 80;

export const config = { path: "/sitemap.xml" };

const FALLBACK_CATEGORY_SLUGS: Record<string, string> = {
  "重要新闻": "important-news",
  "热门头条": "hot-headlines",
  "美国时政": "us-politics",
  "美国警情": "us-crime",
  "中国官场": "china-officialdom",
  "移民美国": "immigration",
  "庇护百科": "asylum",
  "驱逐快报": "deport",
  "ICE执法动态": "ice",
  "ICE执法": "ice",
  "曝光墙": "expose"
};

const SECTION_ALIASES: Record<string, string> = {
  important: "important-news",
  hot: "hot-headlines",
  politics: "us-politics",
  crime: "us-crime",
  china: "china-officialdom"
};

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalSection(value: unknown): string {
  const raw = clean(value);
  return SECTION_ALIASES[raw] || raw;
}

function visibleText(value: unknown): string {
  return clean(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitle(value: unknown): string {
  return visibleText(value).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
}

function esc(value: unknown): string {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isIceArticle(article: any): boolean {
  const topic = clean(article?.topic_key).toLowerCase();
  const category = clean(article?.category_name);
  return topic === "ice" || category === "ICE执法动态" || category === "ICE执法";
}

function isSpecialTopicArticle(article: any): boolean {
  const topic = clean(article?.topic_key).toLowerCase();
  return topic === "ice" || topic === "trump";
}

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function dbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function fetchRows(path: string, params: Record<string, string>) {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase config missing");
  const url = new URL(`${base}/rest/v1/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchCategories() {
  return fetchRows("categories", {
    select: "id,name,slug,is_active,sort_order,include_in_sitemap",
    is_active: "eq.true",
    order: "sort_order.asc",
    limit: "500"
  });
}

async function fetchPublishedArticles() {
  const all: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const rows = await fetchRows("articles", {
      select: "id,title,slug,content,category_id,category_name,topic_key,status,published_at,created_at",
      status: "eq.published",
      order: "published_at.asc.nullslast,created_at.asc",
      limit: String(pageSize),
      offset: String(offset)
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function sectionFor(article: any, byId: Map<string, any>, byName: Map<string, any>): string {
  const topic = clean(article?.topic_key).toLowerCase();
  if (topic === "trump") return "trump";
  if (topic === "ice") return "ice";
  const byCategoryId = byId.get(String(article?.category_id || ""));
  if (byCategoryId?.slug) return canonicalSection(byCategoryId.slug);
  const byCategoryName = byName.get(clean(article?.category_name));
  if (byCategoryName?.slug) return canonicalSection(byCategoryName.slug);
  return FALLBACK_CATEGORY_SLUGS[clean(article?.category_name)] || "news";
}

function lastmod(article: any): string {
  const raw = article?.published_at || article?.created_at;
  const date = new Date(String(raw || ""));
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function urlBlock(loc: string, modified: string, changefreq = "weekly", priority = "0.6") {
  return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${esc(modified)}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  try {
    const [categories, articles] = await Promise.all([fetchCategories(), fetchPublishedArticles()]);
    if (!articles.length) return context.next();

    const allowedIds = new Set(categories.filter((x: any) => x.include_in_sitemap !== false).map((x: any) => String(x.id)));
    const allowedNames = new Set(categories.filter((x: any) => x.include_in_sitemap !== false).map((x: any) => clean(x.name)));
    const byId = new Map(categories.map((x: any) => [String(x.id || ""), x]));
    const byName = new Map(categories.map((x: any) => [clean(x.name), x]));
    const today = new Date().toISOString().slice(0, 10);
    const blocks: string[] = [urlBlock(`${SITE}/`, today, "hourly", "1.0")];

    for (const category of categories) {
      if (category.include_in_sitemap === false || !clean(category.slug)) continue;
      blocks.push(urlBlock(`${SITE}/${encodeURIComponent(canonicalSection(category.slug))}`, today, "hourly", "0.8"));
    }
    blocks.push(urlBlock(`${SITE}/ice/news`, today, "hourly", "0.7"));

    const seenTitles = new Set<string>();
    const seenBodies = new Set<string>();
    let excludedThin = 0;
    let preservedShortIce = 0;
    let excludedDuplicate = 0;
    let preservedSpecialTopic = 0;

    for (const article of articles) {
      if (!article?.id || !clean(article?.title)) continue;
      if (categories.length && !isSpecialTopicArticle(article)) {
        if (article?.category_id && !allowedIds.has(String(article.category_id))) continue;
        if (!article?.category_id && article?.category_name && !allowedNames.has(clean(article.category_name))) continue;
      } else if (isSpecialTopicArticle(article)) {
        preservedSpecialTopic++;
      }

      const body = visibleText(article?.content || "");
      const ice = isIceArticle(article);
      if (!ice && body.length < MIN_INDEXABLE_BODY_LENGTH) {
        excludedThin++;
        continue;
      }
      if (ice && body.length < MIN_INDEXABLE_BODY_LENGTH) preservedShortIce++;

      const titleKey = normalizedTitle(article?.title);
      const bodyKey = body.length >= 120 ? body : "";
      if ((titleKey.length >= 8 && seenTitles.has(titleKey)) || (bodyKey && seenBodies.has(bodyKey))) {
        excludedDuplicate++;
        continue;
      }
      if (titleKey.length >= 8) seenTitles.add(titleKey);
      if (bodyKey) seenBodies.add(bodyKey);

      const section = sectionFor(article, byId, byName);
      const slug = clean(article?.slug) || clean(article?.id);
      if (!slug) continue;
      const loc = `${SITE}/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
      blocks.push(urlBlock(loc, lastmod(article)));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
    const headers = new Headers({
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
      "x-trrb-sitemap": "live-supabase-v4-topic-safe-ice-safe",
      "x-trrb-sitemap-articles": String(articles.length),
      "x-trrb-sitemap-excluded-thin": String(excludedThin),
      "x-trrb-sitemap-preserved-short-ice": String(preservedShortIce),
      "x-trrb-sitemap-preserved-special-topic": String(preservedSpecialTopic),
      "x-trrb-sitemap-excluded-duplicate": String(excludedDuplicate)
    });
    return new Response(request.method === "HEAD" ? null : xml, { status: 200, headers });
  } catch (error) {
    console.error("live sitemap failed", error);
    return context.next();
  }
};
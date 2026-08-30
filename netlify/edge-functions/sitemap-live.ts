const SITE = "https://trrb.net";
const MIN_INDEXABLE_BODY_LENGTH = 300;
const MIN_INDEXABLE_TITLE_LENGTH = 8;
const MAX_SITEMAP_ARTICLES = 5000;

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
  "ICE执法": "ice"
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
      select: "id,title,slug,summary,content,category_id,category_name,topic_key,status,visibility,published_at,created_at",
      status: "eq.published",
      visibility: "eq.public",
      order: "published_at.desc.nullslast,created_at.desc",
      limit: String(pageSize),
      offset: String(offset)
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function isForbiddenStaticBlock(block: string): boolean {
  // Recruitment is now launched and indexable. Finance is still prelaunch and
  // People is retired, so only those remain forbidden in the live sitemap.
  return /<loc>https:\/\/trrb\.net\/(?:finance(?:\/|\?|<)|people(?:\/|\?|<))/i.test(block);
}

async function fetchStaticBlocks(request: Request): Promise<string[]> {
  const url = new URL("/sitemap-static.xml", request.url);
  url.searchParams.set("live-sitemap", String(Date.now()));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1", "Cache-Control": "no-cache" }
  });
  if (!response.ok) throw new Error(`sitemap-static.xml ${response.status}`);
  const xml = await response.text();
  if (!xml.includes("<urlset")) throw new Error("sitemap-static.xml is not a URL set");
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  const safe = blocks.filter((block) => !isForbiddenStaticBlock(block));
  if (!safe.length || !safe.some((block) => block.includes(`<loc>${SITE}/</loc>`))) {
    throw new Error("sitemap-static.xml has no safe canonical root block");
  }
  if (!safe.some((block) => block.includes(`<loc>${SITE}/immigrate/</loc>`))) {
    throw new Error("sitemap-static.xml is missing immigration hub");
  }
  if (!safe.some((block) => block.includes(`<loc>${SITE}/legal/</loc>`))) {
    throw new Error("sitemap-static.xml is missing legal hub");
  }
  return safe;
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
  if (new URL(request.url).hostname.toLowerCase() !== "trrb.net") return context.next();

  try {
    const [staticBlocks, categories, articles] = await Promise.all([
      fetchStaticBlocks(request),
      fetchCategories(),
      fetchPublishedArticles()
    ]);
    if (!articles.length) return context.next();

    const allowedIds = new Set(categories.filter((x: any) => x.include_in_sitemap !== false).map((x: any) => String(x.id)));
    const allowedNames = new Set(categories.filter((x: any) => x.include_in_sitemap !== false).map((x: any) => clean(x.name)));
    const allowedSlugs = new Set(categories.filter((x: any) => x.include_in_sitemap !== false).map((x: any) => canonicalSection(x.slug)));
    const byId = new Map(categories.map((x: any) => [String(x.id || ""), x]));
    const byName = new Map(categories.map((x: any) => [clean(x.name), x]));
    const blocks: string[] = [...staticBlocks];

    const seenUrls = new Set<string>();
    for (const block of staticBlocks) {
      const match = block.match(/<loc>([^<]+)<\/loc>/i);
      if (match?.[1]) seenUrls.add(match[1].replaceAll("&amp;", "&"));
    }

    // Recruitment now has its own canonical host (huarengongzuo.com).
    // trrb.net/jobs and /huarengongzuo are permanent entry redirects and
    // therefore must not be emitted as indexable trrb.net sitemap URLs.

    const seenTitles = new Set<string>();
    const seenBodies = new Set<string>();
    let excludedThin = 0;
    let excludedDuplicate = 0;
    let preservedSpecialTopic = 0;

    for (const article of articles) {
      if (!article?.id || !clean(article?.title)) continue;
      if (categories.length && !isSpecialTopicArticle(article)) {
        if (article?.category_id && !allowedIds.has(String(article.category_id))) continue;
        if (!article?.category_id && article?.category_name) {
          const name = clean(article.category_name);
          const fallbackSlug = canonicalSection(FALLBACK_CATEGORY_SLUGS[name] || "");
          if (!allowedNames.has(name) && !(fallbackSlug && allowedSlugs.has(fallbackSlug))) continue;
        }
      } else if (isSpecialTopicArticle(article)) {
        preservedSpecialTopic++;
      }

      const body = visibleText(article?.content || article?.summary || "");
      const title = visibleText(article?.title || "");
      if (title.length < MIN_INDEXABLE_TITLE_LENGTH || body.length < MIN_INDEXABLE_BODY_LENGTH) {
        excludedThin++;
        continue;
      }

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
      if (seenUrls.has(loc)) continue;
      seenUrls.add(loc);
      blocks.push(urlBlock(loc, lastmod(article)));
      if (blocks.length - staticBlocks.length >= MAX_SITEMAP_ARTICLES) break;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${blocks.join("\n")}\n</urlset>\n`;
    const immigrationKnowledgeCount = staticBlocks.filter((block) => block.includes(`<loc>${SITE}/immigrate/center?path=`)).length;
    const headers = new Headers({
      "content-type": "application/xml; charset=UTF-8",
      "cache-control": "public, max-age=30, stale-while-revalidate=60",
      "x-trrb-sitemap": "live-supabase-v9-quality-budget-canonical",
      "x-trrb-sitemap-articles": String(articles.length),
      "x-trrb-sitemap-static-blocks": String(staticBlocks.length),
      "x-trrb-sitemap-immigration-knowledge": String(immigrationKnowledgeCount),
      "x-trrb-sitemap-excluded-thin": String(excludedThin),
      "x-trrb-sitemap-min-body": String(MIN_INDEXABLE_BODY_LENGTH),
      "x-trrb-sitemap-article-cap": String(MAX_SITEMAP_ARTICLES),
      "x-trrb-sitemap-preserved-special-topic": String(preservedSpecialTopic),
      "x-trrb-sitemap-excluded-duplicate": String(excludedDuplicate),
      "x-trrb-sitemap-dedupe-winner": "newest",
      "x-trrb-sitemap-jobs": "indexable"
    });
    return new Response(request.method === "HEAD" ? null : xml, { status: 200, headers });
  } catch (error) {
    console.error("live sitemap failed", error);
    return context.next();
  }
};

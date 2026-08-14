const SITE = "https://trrb.net";

const RESERVED_SECTIONS = new Set([
  "admin", "assets", "config", "data", "netlify", ".netlify", "topic", "immigrate",
  "listing", "article", "feed", "sitemap", "news-sitemap", "robots", "favicon",
  "manifest", "service-worker", "wp-content", "api"
]);

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

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function dbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

function routeParts(pathname: string) {
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch {}
  const parts = decoded.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [section, slug] = parts;
  if (!section || !slug || RESERVED_SECTIONS.has(section.toLowerCase())) return null;
  if (section.toLowerCase() === "ice" && slug.toLowerCase() === "news") return null;
  if (/\.[a-z0-9]{1,8}$/i.test(slug)) return null;
  return { section, slug };
}

function stableSlugSuffix(slug: string): string {
  const twoPart = slug.match(/-([a-z0-9]{6,14}-[a-z0-9]{6,14})$/i)?.[1];
  if (twoPart) return twoPart;
  return slug.match(/-([a-z0-9]{6,14})$/i)?.[1] || "";
}

async function findPublishedArticleBySuffix(slug: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key) return null;
  const suffix = stableSlugSuffix(slug);
  if (!suffix) return null;

  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", "id,slug,category_id,category_name,topic_key,status");
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("slug", `like.*-${suffix}`);
  url.searchParams.set("limit", "2");

  const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function getCategorySlug(article: any): Promise<string> {
  const topic = clean(article?.topic_key).toLowerCase();
  if (topic === "trump") return "trump";
  if (topic === "ice") return "ice";

  const fallback = FALLBACK_CATEGORY_SLUGS[clean(article?.category_name)] || "";
  const { base, key } = supabaseConfig();
  if (!base || !key) return fallback || "news";

  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set("select", "slug");
  if (article?.category_id) url.searchParams.set("id", `eq.${article.category_id}`);
  else if (article?.category_name) url.searchParams.set("name", `eq.${article.category_name}`);
  else return fallback || "news";
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
    if (!response.ok) return fallback || "news";
    const rows = await response.json();
    return clean(Array.isArray(rows) && rows[0] ? rows[0].slug : "") || fallback || "news";
  } catch {
    return fallback || "news";
  }
}

function redirect(destination: string) {
  return new Response(null, {
    status: 301,
    headers: {
      Location: destination,
      "Cache-Control": "public, max-age=300",
      "X-TRRB-Article-Redirect": "stale-pretty-slug-rescue"
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  const parts = routeParts(url.pathname);
  if (!parts) return context.next();

  try {
    const article = await findPublishedArticleBySuffix(parts.slug);
    if (!article) return context.next();

    const section = await getCategorySlug(article);
    const currentSlug = clean(article.slug) || clean(article.id);
    if (!currentSlug) return context.next();

    const canonical = `${SITE}/${encodeURIComponent(section)}/${encodeURIComponent(currentSlug)}`;
    const currentPath = url.pathname.replace(/\/$/, "");
    const canonicalPath = new URL(canonical).pathname.replace(/\/$/, "");
    if (currentPath === canonicalPath) return context.next();

    return redirect(canonical);
  } catch (error) {
    console.error("stale pretty article rescue failed", error);
    return context.next();
  }
};
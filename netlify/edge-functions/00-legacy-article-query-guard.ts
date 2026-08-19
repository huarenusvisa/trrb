const SITE = "https://trrb.net";

// Runs before article-prerender alphabetically among inline declarations.
// It only handles WordPress/numeric legacy query IDs; UUID article IDs continue
// to the normal article prerenderer.
export const config = { path: "/article.html" };

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
  "immigration-us": "immigration",
  "asylum-guide": "asylum",
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

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function dbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function fetchLegacyArticle(id: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase config missing");
  const variants = [...new Set([id, id.replace(/^wp-/i, ""), /^\d+$/.test(id) ? `wp-${id}` : ""].filter(Boolean))];

  for (const legacyId of variants) {
    const url = new URL(`${base}/rest/v1/articles`);
    url.searchParams.set("select", "id,legacy_id,title,slug,category_id,category_name,topic_key,status,canonical_url");
    url.searchParams.set("legacy_id", `eq.${legacyId}`);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { cache: "no-store", headers: dbHeaders(key) });
    if (!response.ok) throw new Error(`legacy article lookup ${response.status}`);
    const rows = await response.json();
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  return null;
}

async function categorySlug(article: any): Promise<string> {
  const topic = clean(article?.topic_key).toLowerCase();
  if (topic === "trump") return "trump";
  if (topic === "ice") return "ice";

  const fallback = FALLBACK_CATEGORY_SLUGS[clean(article?.category_name)] || "news";
  const { base, key } = supabaseConfig();
  if (!base || !key) return fallback;

  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set("select", "slug");
  if (article?.category_id) url.searchParams.set("id", `eq.${article.category_id}`);
  else if (article?.category_name) url.searchParams.set("name", `eq.${article.category_name}`);
  else return fallback;
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url, { cache: "no-store", headers: dbHeaders(key) });
    if (!response.ok) return fallback;
    const rows = await response.json();
    return canonicalSection(Array.isArray(rows) && rows[0]?.slug ? rows[0].slug : fallback);
  } catch {
    return fallback;
  }
}

async function canonicalFor(article: any): Promise<string> {
  const saved = clean(article?.canonical_url);
  if (/^https:\/\/trrb\.net\//i.test(saved) && !/article\.html\?id=/i.test(saved)) return saved;
  const section = await categorySlug(article);
  const slug = clean(article?.slug) || clean(article?.id);
  return `${SITE}/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
}

function retiredHtml(id: string) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧文章已下线 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"></head><body><main style="max-width:720px;margin:60px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif"><h1>这篇旧文章已下线</h1><p>旧链接 ${String(id).replace(/[<>&"']/g, "")} 尚无可恢复的当前文章，搜索引擎应停止收录该地址。</p><p><a href="/">返回唐人日报首页</a></p></main></body></html>`;
}

function gone(id: string) {
  return new Response(retiredHtml(id), {
    status: 410,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-trrb-retired": "legacy-article-id-not-migrated"
    }
  });
}

function redirect(destination: string) {
  return new Response(null, {
    status: 301,
    headers: {
      location: destination,
      "cache-control": "public, max-age=300",
      "x-trrb-article-redirect": "legacy-id-to-canonical"
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  if (url.searchParams.get("__trrb_article_template") === "1") return context.next();

  const id = clean(url.searchParams.get("id"));
  if (!id || !/^(?:wp-)?\d+$/i.test(id)) return context.next();

  try {
    const article = await fetchLegacyArticle(id);
    if (!article) return gone(id);
    return redirect(await canonicalFor(article));
  } catch (error) {
    console.error("legacy article query guard failed", error);
    // A temporary database outage must not accidentally turn an old URL into a
    // crawlable 200 soft-error page. Fail closed for legacy IDs.
    return gone(id);
  }
};

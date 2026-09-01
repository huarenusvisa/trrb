import { finalHotCanonicalForLegacyId } from "./legacy-final-hot-redirects.js";

const SITE = "https://trrb.net";

// Runs before article-prerender. It retires truly missing WordPress/numeric
// query URLs, preserves valid numeric archives, and prevents deleted/invalid
// UUID query URLs from falling through to the static article shell as HTTP 200.
export const config = { path: "/article.html" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!base || !key) return { available: false, article: null };
  const variants = [...new Set([id, id.replace(/^wp-/i, ""), /^\d+$/.test(id) ? `wp-${id}` : ""].filter(Boolean))];

  for (const legacyId of variants) {
    const url = new URL(`${base}/rest/v1/articles`);
    url.searchParams.set("select", "id,legacy_id,title,slug,category_id,category_name,topic_key,status,canonical_url");
    url.searchParams.set("legacy_id", `eq.${legacyId}`);
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { cache: "no-store", headers: dbHeaders(key) });
    // Schema/network failure must never turn every historical article into a 410.
    if (!response.ok) return { available: false, article: null };
    const rows = await response.json();
    if (Array.isArray(rows) && rows[0]) return { available: true, article: rows[0] };
  }
  const aliasId = /^\d+$/.test(id) ? `wp-${id}` : id.toLowerCase();
  const aliasUrl = new URL(`${base}/rest/v1/articles`);
  aliasUrl.searchParams.set("select", "id,legacy_id,title,slug,category_id,category_name,topic_key,status,canonical_url");
  aliasUrl.searchParams.set("metadata->legacy_alias_ids", `cs.["${aliasId}"]`);
  aliasUrl.searchParams.set("status", "eq.published");
  aliasUrl.searchParams.set("limit", "1");
  const aliasResponse = await fetch(aliasUrl, { cache: "no-store", headers: dbHeaders(key) });
  if (!aliasResponse.ok) return { available: false, article: null };
  const aliasRows = await aliasResponse.json();
  if (Array.isArray(aliasRows) && aliasRows[0]) return { available: true, article: aliasRows[0] };
  return { available: true, article: null };
}

async function fetchPublishedArticleById(id: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key) return { available: false, article: null };
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", "id,legacy_id,title,slug,category_id,category_name,topic_key,status,canonical_url");
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("limit", "1");
  try {
    const response = await fetch(url, { cache: "no-store", headers: dbHeaders(key) });
    if (!response.ok) return { available: false, article: null };
    const rows = await response.json();
    return { available: true, article: Array.isArray(rows) && rows[0] ? rows[0] : null };
  } catch {
    return { available: false, article: null };
  }
}

let archivePromise: Promise<string | null> | null = null;
async function archiveSource(request: Request): Promise<string | null> {
  if (!archivePromise) {
    archivePromise = fetch(new URL("/articles-home-index.js", request.url), {
      cache: "force-cache",
      headers: { Accept: "application/javascript,text/plain,*/*" }
    }).then(async (response) => response.ok ? await response.text() : null).catch(() => null);
  }
  return archivePromise;
}
async function archiveHasId(request: Request, numericId: string): Promise<boolean | null> {
  if (!/^\d+$/.test(numericId)) return false;
  const source = await archiveSource(request);
  if (source == null) return null;
  const escaped = numericId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"id"\\s*:\\s*"${escaped}"`).test(source);
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
  const safe = String(id).replace(/[<>&"']/g, "");
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧文章已下线 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"></head><body><main style="max-width:720px;margin:60px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif"><h1>这篇旧文章已下线</h1><p>旧链接 ${safe} 尚无可恢复的当前文章，搜索引擎应停止收录该地址。</p><p><a href="/">返回唐人日报首页</a></p></main></body></html>`;
}
function missingHtml() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章不存在 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"></head><body><main style="max-width:720px;margin:60px auto;padding:0 20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif"><h1>文章不存在</h1><p>该文章已删除、下线或链接无效。</p><p><a href="/">返回唐人日报首页</a></p></main></body></html>`;
}
function gone(id: string, request: Request) {
  return new Response(request.method === "HEAD" ? null : retiredHtml(id), {
    status: 410,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-trrb-retired": "legacy-article-id-not-migrated"
    }
  });
}
function notFound(request: Request) {
  return new Response(request.method === "HEAD" ? null : missingHtml(), {
    status: 404,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-trrb-missing": "invalid-or-deleted-article-query-id"
    }
  });
}
function redirect(destination: string, reason: string) {
  return new Response(null, {
    status: 301,
    headers: {
      location: destination,
      "cache-control": "public, max-age=300",
      "x-trrb-article-redirect": reason
    }
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  if (url.searchParams.get("__trrb_article_template") === "1") return context.next();

  const id = clean(url.searchParams.get("id"));
  if (!id) return context.next();

  if (/^(?:wp-)?\d+$/i.test(id)) {
    const numericId = id.replace(/^wp-/i, "");

    // The final reviewed legacy batch is pinned locally. This is deliberately
    // checked before Supabase so a slow lookup cannot misclassify it as 410.
    const pinnedCanonical = finalHotCanonicalForLegacyId(id);
    if (pinnedCanonical) return redirect(pinnedCanonical, "final-hot-legacy-id-to-canonical");

    // A migrated legacy record gets the strongest response: permanent redirect
    // to its current canonical article URL.
    try {
      const lookup = await fetchLegacyArticle(id);
      if (lookup.article) return redirect(await canonicalFor(lookup.article), "legacy-id-to-canonical");
      if (!lookup.available) {
        console.warn("legacy migration lookup unavailable; will preserve archive if possible", id);
      }
    } catch (error) {
      console.warn("legacy migration lookup unavailable", error);
    }

    // The historical static index is the authority for still-readable numeric
    // archive IDs. wp-123 and 123 refer to the same archived record here.
    const archived = await archiveHasId(request, numericId);
    if (archived === true) {
      if (/^wp-/i.test(id)) return redirect(`${SITE}/article.html?id=${encodeURIComponent(numericId)}`, "wordpress-prefix-to-static-archive");
      return context.next();
    }
    if (archived === false) return gone(id, request);

    // If the archive file is temporarily unavailable, fail open instead of
    // permanently retiring a potentially valid historical page.
    console.warn("legacy archive index unavailable; preserving request", id);
    return context.next();
  }

  if (UUID_RE.test(id)) {
    const lookup = await fetchPublishedArticleById(id);
    if (!lookup.available) {
      // Database outage: preserve the request rather than falsely deleting a
      // currently published article. article-prerender may still recover it.
      return context.next();
    }
    if (!lookup.article) return notFound(request);
    return redirect(await canonicalFor(lookup.article), "uuid-query-to-canonical");
  }

  // A non-numeric, non-UUID id cannot identify any supported current or
  // historical article. Returning a real 404 avoids a crawlable soft-error shell.
  return notFound(request);
};

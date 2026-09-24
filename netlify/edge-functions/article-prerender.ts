import { publicationUrl, publicEvidence } from "../shared/publication.mjs";
import { articleIndexability, visibleArticleText, ARTICLE_INDEXABILITY_POLICY } from "../shared/article-indexability.mjs";
const SITE = "https://trrb.net";

export const config = { path: ["/article.html", "/*/*"] };

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

const SECTION_ALIASES: Record<string, string> = {
  important: "important-news",
  hot: "hot-headlines",
  politics: "us-politics",
  crime: "us-crime",
  china: "china-officialdom"
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalSection(value: unknown): string {
  const raw = clean(value);
  return SECTION_ALIASES[raw] || raw;
}


function isIceArticle(article: any): boolean {
  const topic = clean(article?.topic_key).toLowerCase();
  const category = clean(article?.category_name);
  return topic === "ice" || category === "ICE执法动态" || category === "ICE执法";
}

function isIndexableArticle(article: any): boolean {
  return articleIndexability(article).indexable;
}

function isoDate(value: unknown): string {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function buildDescription(article: any): string {
  const title = clean(article.title) || "唐人日报新闻";
  const summary = visibleArticleText(article.summary);
  const content = visibleArticleText(article.content);
  let description = summary;
  if (description.length < 90 && content) {
    const remaining = Math.max(0, 165 - description.length - (description ? 1 : 0));
    description = clean(`${description}${description ? " " : ""}${content.slice(0, remaining)}`);
  }
  if (!description) description = `${title}。唐人日报提供最新事实、背景与后续进展。`;
  if (!description.includes(title) && description.length < 115) description = clean(`${title}：${description}`);
  return description.slice(0, 180);
}

function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}

function dbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}

const ARTICLE_SELECT = "publication_path,publication_html,publication_revision,publication_updated_at,id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,source_url,seo_keywords,author,status,visibility,published_at,created_at,metadata";

async function getArticleById(id: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key || !id) return null;
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", ARTICLE_SELECT);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("visibility", "eq.public");
  url.searchParams.set("hidden_at", "is.null");
  url.searchParams.set("archived_at", "is.null");
  url.searchParams.set("published_at", `lte.${new Date().toISOString()}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
  if (!response.ok) throw new Error(`Supabase article id ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function getArticleBySlug(slug: string) {
  const { base, key } = supabaseConfig();
  if (!base || !key || !slug) return null;
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", ARTICLE_SELECT);
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("visibility", "eq.public");
  url.searchParams.set("hidden_at", "is.null");
  url.searchParams.set("archived_at", "is.null");
  url.searchParams.set("published_at", `lte.${new Date().toISOString()}`);
  url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
  if (!response.ok) throw new Error(`Supabase article slug ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

let archiveIndexPromise: Promise<string | null> | null = null;
async function archiveIndex(request: Request): Promise<string | null> {
  if (!archiveIndexPromise) {
    archiveIndexPromise = fetch(new URL("/articles-home-index.js", request.url), { headers: { Accept: "application/javascript,text/plain,*/*" } })
      .then(async (response) => response.ok ? await response.text() : null)
      .catch(() => null);
  }
  return archiveIndexPromise;
}
async function archiveHasId(request: Request, id: string): Promise<boolean | null> {
  if (!/^\d+$/.test(id)) return false;
  const source = await archiveIndex(request);
  if (source == null) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"id"\\s*:\\s*"${escaped}"`).test(source);
}

async function getCategorySlug(article: any): Promise<string> {
  const topic = clean(article?.topic_key).toLowerCase();
  if (topic === "trump") return "trump";
  if (topic === "ice") return "ice";

  const fallback = FALLBACK_CATEGORY_SLUGS[clean(article?.category_name)] || "";
  const { base, key } = supabaseConfig();
  if (!base || !key) return canonicalSection(fallback || "news");

  const url = new URL(`${base}/rest/v1/categories`);
  url.searchParams.set("select", "slug");
  if (article?.category_id) url.searchParams.set("id", `eq.${article.category_id}`);
  else if (article?.category_name) url.searchParams.set("name", `eq.${article.category_name}`);
  else return canonicalSection(fallback || "news");
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, { headers: dbHeaders(key), cache: "no-store" });
    if (!response.ok) throw new Error(`Article category unavailable: ${response.status}`);
    const rows = await response.json();
    const slug = clean(Array.isArray(rows) && rows[0] ? rows[0].slug : "");
    return canonicalSection(slug || fallback || "news");
  } catch (error) {
    throw error;
  }
}

async function canonicalFor(article: any): Promise<string> {
  const pinned = publicationUrl(article);
  if (pinned) return pinned;
  const section = canonicalSection(await getCategorySlug(article));
  const slug = clean(article?.slug) || clean(article?.id);
  return `${SITE}/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
}

function injectHead(html: string, article: any, canonical: string, prettyRoute: boolean) {
  const title = clean(article.title) || "唐人日报新闻";
  const summary = buildDescription(article);
  const category = clean(article.category_name) || "新闻";
  const displayCategory = category === "热门头条" ? "中国热门头条" : category;
  const author = clean(article.author) || "Tang Ren Daily";
  const published = isoDate(article.published_at || article.created_at);
  const image = clean(article.cover_image) || `${SITE}/trrb-logo-cropped.webp`;
  const keywords = clean(article.seo_keywords) || [category, title, "唐人日报", "美国华人"].join(",");
  const robots = isIndexableArticle(article)
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : "noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${canonical}#article`,
    headline: title,
    description: summary,
    image: [image],
    datePublished: published,
    dateModified: isoDate(article.publication_updated_at || article.published_at || article.created_at),
    articleSection: category,
    inLanguage: "zh-CN",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    author: { "@type": "Organization", name: author },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "唐人日报",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/trrb-logo-cropped.webp` }
    }
  };
  const sectionUrl = canonical.replace(/\/[^/]+$/, "");
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "唐人日报", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: category, item: sectionUrl },
      { "@type": "ListItem", position: 3, name: title, item: canonical }
    ]
  };
  const seo = `
    ${prettyRoute ? '<base href="/" />' : ""}
    <title>${esc(title)} - 唐人日报</title>
    <meta name="description" content="${esc(summary)}" />
    <meta name="keywords" content="${esc(keywords)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${esc(canonical)}" />
    <link rel="alternate" type="application/rss+xml" title="唐人日报 RSS" href="${SITE}/feed.xml" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="唐人日报" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(summary)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="article:published_time" content="${published}" />
    <meta property="article:section" content="${esc(displayCategory)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(summary)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <script type="application/ld+json" data-trrb-edge-schema>${escJson(schema)}</script>
    <script type="application/ld+json" data-trrb-edge-breadcrumb>${escJson(breadcrumb)}</script>`;

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/i, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>/i, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, "")
    .replace(/<link\s+rel=["']alternate["'][^>]*>/i, "")
    .replace(/<base\s+href=["'][^"']*["'][^>]*>/i, "")
    .replace(/<\/head>/i, `${seo}\n  </head>`);
}

function publicSource(value: unknown): string {
  try {
    const url = new URL(clean(value));
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    // WordPress imports use source_url as a migration key, not a citation.
    if (/^(?:www\.)?(?:trrb\.(?:net|cc)|tangrenribao\.com)$/i.test(url.hostname)) return "";
    return url.href;
  } catch { return ""; }
}

async function sectionStories(article: any, canonical: string): Promise<any[]> {
  const { base, key } = supabaseConfig();
  if (!base || !key || (!article.category_id && !article.category_name)) return [];
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", "id,title,slug,topic_key,canonical_url,status,visibility,hidden_at,archived_at,published_at,created_at");
  url.searchParams.set(article.category_id ? "category_id" : "category_name", `eq.${article.category_id || article.category_name}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("visibility", "eq.public");
  url.searchParams.set("hidden_at", "is.null");
  url.searchParams.set("archived_at", "is.null");
  url.searchParams.set("published_at", `lte.${new Date().toISOString()}`);
  url.searchParams.set("hidden_at", "is.null");
  url.searchParams.set("archived_at", "is.null");
  url.searchParams.set("published_at", `lte.${new Date().toISOString()}`);
  url.searchParams.set("id", `neq.${article.id}`);
  url.searchParams.set("order", "published_at.desc,id.asc");
  url.searchParams.set("limit", "8");
  try {
    const response = await fetch(url, { headers: dbHeaders(key), signal: AbortSignal.timeout(1500) });
    if (!response.ok) return [];
    const rows = await response.json();
    const seen = new Set([String(article.id)]);
    const currentSection = decodeURIComponent(new URL(canonical).pathname.split("/")[1]);
    const categorySection = canonicalSection(FALLBACK_CATEGORY_SLUGS[clean(article.category_name)] || currentSection);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (!row.id || !row.title || seen.has(String(row.id)) || row.status !== "published"
        || row.visibility !== "public" || row.hidden_at || row.archived_at
        || Date.parse(row.published_at || row.created_at) > Date.now()) return false;
      try {
        // New ingested stories often leave canonical_url empty. Match the
        // article renderer's category/topic + slug route instead of dropping them.
        const topic = clean(row.topic_key).toLowerCase();
        const section = topic === "trump" || topic === "ice" ? topic : categorySection;
        const fallback = row.slug ? `${SITE}/${encodeURIComponent(section)}/${encodeURIComponent(row.slug)}` : "";
        const target = new URL(clean(row.canonical_url) || fallback);
        if (target.origin !== SITE || target.search || target.hash || target.pathname.split("/").filter(Boolean).length !== 2) return false;
        seen.add(String(row.id));
        row.canonical_url = target.href;
        return true;
      } catch { return false; }
    }).slice(0, 6);
  } catch { return []; } // Recommendations must never make the article unavailable.
}

function injectBody(html: string, article: any, canonical: string, stories: any[] = [], currentSection: string | null = null) {
  const title = clean(article.title) || "唐人日报新闻";
  const category = clean(article.category_name) || "新闻";
  const displayCategory = category === "热门头条" ? "中国热门头条" : category;
  const author = clean(article.author) || "Tang Ren Daily";
  const sectionHref = `/${currentSection ? encodeURIComponent(currentSection) : new URL(canonical).pathname.split("/").filter(Boolean)[0]}`;
  const source = publicSource(article.source_url);
  const published = isoDate(article.published_at || article.created_at).slice(0, 10);
  const content = String(visibleArticleText(article.content) ? article.content : article.summary || "").trim();
  const paragraphs = content.split(/\n{2,}|\r?\n/).map((p) => clean(p)).filter(Boolean);
  const image = clean(article.cover_image);
  const topic = clean(article.topic_key).toLowerCase();
  const evidence = publicEvidence(article);
  const iceEvidence = isIceArticle(article) ? `<aside class="article-evidence"><h2>报道来源与核实说明</h2>${evidence.length ? `<ul>${evidence.map(u => `<li><a href="${esc(u)}" rel="noopener noreferrer">${esc(new URL(u).hostname)}</a></li>`).join("")}</ul><p>以上为报道所依据的来源；来源陈述不等于独立核实结论。</p>` : `<p>本篇尚未附可核对的外部来源链接，待编辑补充。</p>`}<p><a href="/ice/news">查看 ICE 执法报道与后续进展</a></p></aside>` : "";
  const topicTimeline = topic === "ren-zhengfei"
    ? `<aside class="article-topic-timeline"><a href="/ren-zhengfei"><b>任正非新闻时间线</b><span>按时间查看全部相关新闻 →</span></a></aside>`
    : "";
  const warning = article?.metadata?.unverified_public_claim
    ? clean(article?.metadata?.content_warning) || "真实性提示：本文所述信息可能尚未获得独立核实，部分细节可能存在偏差，请以权威部门后续通报为准。"
    : "";
  const prerender = `<a class="back-link" href="/">返回首页</a>
      <header class="article-header">
        <a class="tag" href="${esc(sectionHref)}">${esc(displayCategory)}</a>
        <h1>${esc(title)}</h1>
        <div class="story-meta">${esc(author)} · ${esc(published)}</div>
      </header>
      ${topicTimeline}
      ${image ? `<img class="article-image" src="${esc(image)}" loading="eager" fetchpriority="high" alt="${esc(title)}" />` : ""}
      ${warning ? `<aside class="article-content-warning">${esc(warning)}</aside>` : ""}
      <div class="article-body">${article.publication_revision && article.publication_html != null ? article.publication_html : paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
      ${source ? `<p class="article-source">来源链接：<a href="${esc(source)}" rel="noopener noreferrer">${esc(new URL(source).hostname)}</a></p>` : ""}
      ${iceEvidence}
      ${stories.length ? `<nav class="article-section-stories" aria-label="同栏目报道"><h2>同栏目报道</h2><ul>${stories.map((row) => `<li><a href="${esc(row.canonical_url)}">${esc(row.title)}</a></li>`).join("")}</ul></nav>` : ""}
      <nav class="article-neighbors" aria-label="上一篇和下一篇"></nav>
      <section class="related-news" hidden><h2>延伸阅读</h2><div class="related-carousel" aria-label="延伸阅读文章"><div class="related-track"></div></div></section>`;
  const data = `<script id="trrb-prerendered-article" type="application/json">${escJson(article)}</script>`;
  return html
    .replace(/<article class="container article-page" id="article-root">[\s\S]*?<\/article>/i,
      `<article class="container article-page" id="article-root" data-prerendered="true" data-article-id="${esc(article.id)}">${prerender}</article>${data}`)
    .replace(/<body>/i, `<body data-canonical="${esc(canonical)}">`);
}

function disableLegacyClientLoaders(html: string): string {
  return html
    .replace(/<script\s+src=["'](?:\.\/|\/)articles-home-index\.js[^"']*["'][^>]*><\/script>/i, "")
    .replace(/<script\s+src=["'](?:\.\/|\/)article\.js[^"']*["'][^>]*><\/script>/i, "")
    .replace(/<script\s+src=["'](?:\.\/|\/)article-index-guard\.js[^"']*["'][^>]*><\/script>/i, "")
    .replace(/<script\s+src=["'](?:\.\/|\/)article-seo\.js[^"']*["'][^>]*><\/script>/i, "");
}

function notFoundHtml() {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章不存在 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"></head><body><main><h1>文章不存在</h1><p>该文章已删除、下线或链接无效。</p><p><a href="${SITE}/">返回唐人日报首页</a></p></main></body></html>`;
}

function goneHtml(id: string) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧文章已下线 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"></head><body><main><h1>旧文章已下线</h1><p>旧版文章 ${esc(id)} 未找到可恢复的正文或新网址，该链接已停止提供。</p><p><a href="${SITE}/">返回唐人日报首页</a></p></main></body></html>`;
}

function gone(id: string, reason: string) {
  return new Response(goneHtml(id), {
    status: 410,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-trrb-retired-article": reason
    }
  });
}

function redirect(destination: string, reason: string) {
  return new Response(null, {
    status: 301,
    headers: {
      Location: destination,
      "Cache-Control": "public, max-age=300",
      "X-TRRB-Article-Redirect": reason
    }
  });
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

async function templateResponse(request: Request) {
  const templateUrl = new URL("/article.html?__trrb_article_template=1", request.url);
  return fetch(templateUrl, { headers: { "X-TRRB-Template": "1" } });
}

function temporaryArticleFailure(request: Request): Response {
  return new Response(request.method === "HEAD" ? null : "Article temporarily unavailable. Please retry.", {
    status: 503,
    headers: {"Content-Type":"text/plain; charset=utf-8", "Cache-Control":"no-store", "Retry-After":"120", "X-TRRB-Prerender":"lookup-unavailable"}
  });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  if (url.pathname === "/article.html" && url.searchParams.get("__trrb_article_template") === "1") {
    return context.next();
  }

  // WordPress archive/system routes belong to 01-wordpress-archive-retire.
  // Never reinterpret their trailing page number as a historical article ID.
  if (/^\/(?:page|author|tag|search|category)(?:\/|$)/i.test(url.pathname)
    || /^\/20\d{2}(?:\/|$)/i.test(url.pathname)
    || /^\/feed\/?$/i.test(url.pathname)) {
    return context.next();
  }

  try {
    if (url.pathname === "/article.html") {
      const id = clean(url.searchParams.get("id"));
      if (!id) {
        return new Response(notFoundHtml(), {
          status: 404,
          headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-robots-tag": "noindex" }
        });
      }

      // The dedicated legacy query guard resolves WordPress IDs and archives.
      // Never send numeric IDs to the UUID column or retire them before that guard.
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return context.next();

      const article = await getArticleById(id);
      if (article) {
        const canonical = await canonicalFor(article);
        return redirect(canonical, "legacy-query-to-pretty");
      }

      return new Response(notFoundHtml(), {
        status: 404,
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-robots-tag": "noindex" }
      });
    }

    const parts = routeParts(url.pathname);
    if (!parts) return context.next();

    let article = await getArticleBySlug(parts.slug);
    if (!article && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(parts.slug)) article = await getArticleById(parts.slug);
    if (!article && /^(?:wp-)?\d+$/i.test(parts.slug)) {
      const legacy = new URL('/article.html', url.origin);
      legacy.searchParams.set('id', parts.slug);
      return redirect(legacy.toString(), 'archived-id-to-legacy-validator');
    }
    if (!article) return context.next();

    const canonical = await canonicalFor(article);
    const canonicalPath = new URL(canonical).pathname;
    if (url.pathname.replace(/\/$/, "") !== canonicalPath.replace(/\/$/, "")) {
      return redirect(canonical, "pretty-path-normalize");
    }

    const [upstream, stories, currentSection] = await Promise.all([templateResponse(request), sectionStories(article, canonical), getCategorySlug(article).catch(() => null)]);
    if (!upstream.ok) throw new Error(`Article template unavailable: ${upstream.status}`);
    let html = await upstream.text();
    html = injectHead(html, article, canonical, true);
    html = injectBody(html, article, canonical, stories, currentSection);
    html = disableLegacyClientLoaders(html);

    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    headers.delete("content-length");
    headers.set("cache-control", "public, max-age=0, must-revalidate");
    headers.set("netlify-cdn-cache-control", "no-store");
    headers.set("cdn-cache-control", "no-store");
    headers.set("x-trrb-publication-revision", article.publication_revision || "legacy");
    headers.set("x-trrb-prerender", "article-edge-v4-archive-410-ice-safe");
    headers.set("link", `<${canonical}>; rel=\"canonical\"`);
    headers.set("x-trrb-indexability-policy", ARTICLE_INDEXABILITY_POLICY);
    headers.set("x-trrb-indexability", articleIndexability(article).reasons.join(",") || "eligible");
    if (!isIndexableArticle(article)) headers.set("x-robots-tag", "noindex, follow");
    else headers.delete("x-robots-tag");

    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
  } catch (error) {
    console.error("article prerender failed", error);
    return temporaryArticleFailure(request);
  }
};

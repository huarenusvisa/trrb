const SITE = "https://trrb.net";

export const config = { path: "/article.html" };

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

function isoDate(value: unknown): string {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function getArticle(id: string) {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!base || !key) return null;
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set("select", "id,title,summary,content,category_name,cover_image,seo_keywords,author,status,published_at,created_at");
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function injectHead(html: string, article: any, canonical: string) {
  const title = clean(article.title) || "唐人日报新闻";
  const summary = clean(article.summary || article.content).slice(0, 180) || `${title} - 唐人日报`;
  const category = clean(article.category_name) || "新闻";
  const author = clean(article.author) || "Tang Ren Daily";
  const published = isoDate(article.published_at || article.created_at);
  const image = clean(article.cover_image) || `${SITE}/trrb-logo-cropped.webp`;
  const keywords = clean(article.seo_keywords) || [category, title, "唐人日报", "美国华人"].join(",");
  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: summary,
    image: [image],
    datePublished: published,
    dateModified: published,
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
  const seo = `
    <title>${esc(title)} - 唐人日报</title>
    <meta name="description" content="${esc(summary)}" />
    <meta name="keywords" content="${esc(keywords)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${esc(canonical)}" />
    <link rel="alternate" type="application/rss+xml" title="唐人日报 RSS" href="${SITE}/feed.xml" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="唐人日报" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(summary)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${esc(image)}" />
    <meta property="article:published_time" content="${published}" />
    <meta property="article:section" content="${esc(category)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(summary)}" />
    <meta name="twitter:image" content="${esc(image)}" />
    <script type="application/ld+json" data-trrb-edge-schema>${escJson(schema)}</script>`;

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/i, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>/i, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, "")
    .replace(/<link\s+rel=["']alternate["'][^>]*>/i, "")
    .replace(/<\/head>/i, `${seo}\n  </head>`);
}

function injectBody(html: string, article: any, canonical: string) {
  const title = clean(article.title) || "唐人日报新闻";
  const category = clean(article.category_name) || "新闻";
  const author = clean(article.author) || "Tang Ren Daily";
  const published = isoDate(article.published_at || article.created_at).slice(0, 10);
  const content = String(article.content || "").trim();
  const paragraphs = content.split(/\n{2,}|\r?\n/).map((p) => clean(p)).filter(Boolean);
  const image = clean(article.cover_image);
  const prerender = `<a class="back-link" href="./index.html">返回首页</a>
      <header class="article-header">
        <span class="tag">${esc(category)}</span>
        <h1>${esc(title)}</h1>
        <div class="story-meta">${esc(author)} · ${esc(published)}</div>
      </header>
      ${image ? `<img class="article-image" src="${esc(image)}" loading="eager" fetchpriority="high" alt="${esc(title)}" />` : ""}
      <div class="article-body">${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
  const data = `<script id="trrb-prerendered-article" type="application/json">${escJson(article)}</script>`;
  return html
    .replace(/<article class="container article-page" id="article-root">[\s\S]*?<\/article>/i,
      `<article class="container article-page" id="article-root" data-prerendered="true">${prerender}</article>${data}`)
    .replace(/<body>/i, `<body data-canonical="${esc(canonical)}">`);
}

function notFoundHtml(id: string) {
  return `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章不存在 - 唐人日报</title><meta name="robots" content="noindex,nofollow,noarchive"><link rel="canonical" href="${SITE}/article.html"></head><body><main><h1>文章不存在</h1><p>该文章已删除、下线或链接无效。</p><p><a href="${SITE}/">返回唐人日报首页</a></p></main></body></html>`;
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"));
  if (!id) {
    return new Response(notFoundHtml(""), {
      status: 404,
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-robots-tag": "noindex" }
    });
  }
  try {
    const article = await getArticle(id);
    if (!article) {
      return new Response(notFoundHtml(id), {
        status: 404,
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=60", "x-robots-tag": "noindex" }
      });
    }
    const upstream = await context.next();
    let html = await upstream.text();
    const canonical = `${SITE}/article.html?id=${encodeURIComponent(id)}`;
    html = injectHead(html, article, canonical);
    html = injectBody(html, article, canonical);
    const headers = new Headers(upstream.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
    headers.set("x-trrb-prerender", "article-edge-v1");
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
  } catch (error) {
    console.error("article prerender failed", error);
    return context.next();
  }
};

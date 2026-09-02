const SITE = "https://trrb.net";
const PAGE_SIZE = 24;

const ROUTES: Record<string, { name: string; displayName?: string; description: string }> = {
  "/important-news": { name: "重要新闻", description: "唐人日报重要新闻，聚焦美国、中国及全球重大事件与突发动态。" },
  "/hot-headlines": { name: "热门头条", displayName: "中国热门头条", description: "唐人日报中国热门头条，持续汇集中国大陆社会、民生、公共事件与网络热点，提供事实背景、可靠来源与重要后续进展。" },
  "/us-politics": { name: "美国时政", description: "唐人日报美国时政，持续追踪白宫、国会、选举、公共政策与联邦政府最新动态，梳理事件背景、权威来源及后续影响。" },
  "/us-crime": { name: "美国警情", description: "唐人日报美国警情，持续关注美国治安、警方执法、联邦调查、法院审判与重大刑事案件，提供可靠来源和后续进展。" },
  "/china-officialdom": { name: "中国官场", description: "唐人日报中国官场，追踪官员任免、反腐、调查与公共治理动态。" },
  "/immigration": { name: "移民美国", description: "唐人日报移民美国，持续关注美国移民政策、签证、绿卡、庇护、入籍、边境执法与移民社区动态，提供实用信息和权威来源。" },
  "/asylum": { name: "庇护百科", description: "唐人日报庇护百科，聚合美国庇护、递解抗辩、人道主义保护、移民法庭及相关实务信息。" },
  "/ice/news": { name: "ICE执法动态", description: "唐人日报ICE执法动态，持续追踪ICE、DHS、HSI与CBP的抓捕、拘留、遣返及相关执法新闻，说明事件背景、法律程序和后续进展。" }
};

export const config = { path: Object.keys(ROUTES) };

const ARTICLE_SECTIONS: Record<string, string> = {
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

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function esc(value: unknown): string {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
function pageNumber(value: string | null): number {
  const parsed = Math.floor(Number(value || "1"));
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 10000) : 1;
}
function canonicalPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}
function supabaseConfig() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  return { base, key };
}
function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" };
}
async function fetchJson(path: string, params: Record<string, string>) {
  const { base, key } = supabaseConfig();
  if (!base || !key) throw new Error("Supabase config missing");
  const url = new URL(`${base}/rest/v1/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { cache: "no-store", headers: headers(key) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function fetchCategory(name: string) {
  const rows = await fetchJson("categories", {
    select: "id,name,slug,seo_title,seo_description,seo_keywords,is_active",
    name: `eq.${name}`,
    is_active: "eq.true",
    limit: "1"
  });
  return rows[0] || null;
}
async function fetchCategoryPage(request: Request, category: string, page: number) {
  const url = new URL("/.netlify/functions/public-category-page", request.url);
  url.searchParams.set("category", category);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" }
  });
  if (!response.ok) throw new Error(`public-category-page ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.articles)) throw new Error("public-category-page invalid payload");
  return payload;
}
function articleUrl(article: any): string {
  const topic = clean(article?.topic_key).toLowerCase();
  const slug = clean(article?.slug) || clean(article?.id);
  if (!slug) return "";
  const category = clean(article?.category_name);
  const section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : (ARTICLE_SECTIONS[category] || "news");
  return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
}
function articleDate(article: any): string {
  const d = new Date(article?.published_at || article?.created_at || "");
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function description(article: any): string {
  const raw = clean(article?.summary || article?.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return raw.slice(0, 150);
}
function cards(articles: any[], categoryName: string): string {
  return articles.map((article) => {
    const url = articleUrl(article);
    if (!url) return "";
    const image = clean(article.cover_image);
    const summary = description(article);
    const articleCategory = clean(article.category_name) === "热门头条" ? "中国热门头条" : (article.category_name || categoryName);
    return `<article class="archive-card" data-category-prerendered="true"><a href="${esc(url)}">${image ? `<img src="${esc(image)}" width="512" height="288" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${esc(article.title)}" />` : ""}<span>${esc(articleCategory)}</span><h2>${esc(article.title)}</h2>${summary ? `<p>${esc(summary)}</p>` : ""}<time>${esc(articleDate(article))}</time></a></article>`;
  }).join("");
}
function pageHref(path: string, page: number): string {
  return page <= 1 ? path : `${path}?page=${page}`;
}
function pagination(path: string, page: number, totalPages: number): string {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return '<nav class="pagination" id="pagination" aria-label="分页"></nav>';
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const links: string[] = [];
  if (page > 1) links.push(`<a class="page-link" rel="prev" href="${esc(pageHref(path, page - 1))}">上一页</a>`);
  for (let p = start; p <= end; p += 1) {
    links.push(p === page ? `<span class="page-link is-disabled" aria-current="page">${p}</span>` : `<a class="page-link" href="${esc(pageHref(path, p))}">${p}</a>`);
  }
  if (page < totalPages) links.push(`<a class="page-link" rel="next" href="${esc(pageHref(path, page + 1))}">下一页</a>`);
  return `<nav class="pagination" id="pagination" aria-label="分页">${links.join("")}</nav>`;
}
async function template(request: Request) {
  const url = new URL("/listing.html?__trrb_category_template=1", request.url);
  return fetch(url, { headers: { "X-TRRB-Category-Template": "1" } });
}
function fail(status: number, message: string, marker: string): Response {
  const body = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow,noarchive"><title>${esc(message)} - 唐人日报</title></head><body><main><h1>${esc(message)}</h1><p><a href="/">返回唐人日报首页</a></p></main></body></html>`;
  const responseHeaders: Record<string, string> = {
    "content-type": "text/html; charset=UTF-8",
    "cache-control": status === 503 ? "no-store" : "public, max-age=300",
    "x-robots-tag": "noindex, follow, noarchive",
    "x-trrb-category-prerender": marker
  };
  if (status === 503) responseHeaders["retry-after"] = "120";
  return new Response(body, { status, headers: responseHeaders });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const route = ROUTES[path];
  if (!route) return context.next();
  const page = pageNumber(url.searchParams.get("page"));
  const displayName = route.displayName || route.name;

  try {
    const [category, pagePayload] = await Promise.all([
      fetchCategory(route.name),
      fetchCategoryPage(request, route.name, page)
    ]);
    const articles = pagePayload.articles;
    const total = Number(pagePayload.total);
    const totalPagesRaw = Number(pagePayload.total_pages);
    const totalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? totalPagesRaw : (articles.length ? page : 0);

    if (!articles.length) {
      return fail(404, page > 1 ? "该栏目分页不存在" : "该栏目暂时没有可公开内容", "category-edge-v2-empty-noindex");
    }
    if (Number.isFinite(total) && total >= 0 && page > Math.max(1, Math.ceil(total / PAGE_SIZE))) {
      return fail(404, "该栏目分页不存在", "category-edge-v2-page-out-of-range");
    }

    const upstream = await template(request);
    if (!upstream.ok) return fail(503, "栏目模板暂时不可用", "category-edge-v2-template-unavailable");
    let html = await upstream.text();
    const canonicalRoute = canonicalPath(path, page);
    const canonical = `${SITE}${canonicalRoute}`;
    const title = route.displayName ? `${displayName} - 唐人日报` : (clean(category?.seo_title) || `${displayName} - 唐人日报`);
    const titleWithPage = page > 1 ? `${title.replace(/\s*-\s*唐人日报\s*$/i, "")} 第${page}页 - 唐人日报` : title;
    const storedDescription = clean(category?.seo_description);
    const metaDescription = storedDescription.length >= 40 ? storedDescription : route.description;
    const keywords = route.displayName ? "中国热门头条,中国新闻,中国社会热点,唐人日报" : (clean(category?.seo_keywords) || `${displayName},唐人日报,美国华人新闻`);
    const itemList = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": canonical,
      name: page > 1 ? `${displayName} 第${page}页` : displayName,
      url: canonical,
      description: metaDescription,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: articles.slice(0, PAGE_SIZE).map((article: any, index: number) => ({
          "@type": "ListItem",
          position: (page - 1) * PAGE_SIZE + index + 1,
          url: `${SITE}${articleUrl(article)}`,
          name: clean(article.title)
        }))
      }
    };
    const clientContext = {
      name: route.name,
      path,
      page,
      pageSize: PAGE_SIZE,
      total: Number.isFinite(total) ? total : null,
      totalPages: totalPages || null
    };

    const seo = `
    <title>${esc(titleWithPage)}</title>
    <meta name="description" content="${esc(metaDescription)}" />
    <meta name="keywords" content="${esc(keywords)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="唐人日报" />
    <meta property="og:title" content="${esc(titleWithPage)}" />
    <meta property="og:description" content="${esc(metaDescription)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${SITE}/trrb-logo-cropped.webp" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(titleWithPage)}" />
    <meta name="twitter:description" content="${esc(metaDescription)}" />
    <meta name="twitter:image" content="${SITE}/trrb-logo-cropped.webp" />
    <script type="application/ld+json" data-trrb-category-schema>${escJson(itemList)}</script>
    <script>window.TRRB_CATEGORY_CONTEXT=${escJson(clientContext)};</script>`;

    html = html
      .replace(/<title>[\s\S]*?<\/title>/gi, "")
      .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']keywords["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']robots["'][^>]*>/gi, "")
      .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
      .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "")
      .replace(/<\/head>/i, `${seo}\n  </head>`)
      .replace(/<h1 id="listing-title">[\s\S]*?<\/h1>/i, `<h1 id="listing-title">${esc(displayName)}</h1>`)
      .replace(/<div class="listing-grid" id="listing-grid">[\s\S]*?<\/div><nav class="pagination" id="pagination" aria-label="分页"><\/nav>/i, `<div class="listing-grid" id="listing-grid" data-seo-category-snapshot="edge" data-page="${page}">${cards(articles, displayName)}</div>${pagination(path, page, totalPages)}`);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("content-type", "text/html; charset=UTF-8");
    responseHeaders.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
    responseHeaders.set("x-trrb-category-prerender", "category-edge-v1");
    responseHeaders.set("x-trrb-category-pagination", "server-v1");
    responseHeaders.set("x-trrb-category-page", String(page));
    responseHeaders.set("x-trrb-category-total", Number.isFinite(total) ? String(total) : "unknown");
    responseHeaders.set("link", `<${canonical}>; rel=\"canonical\"`);
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error("category prerender failed", path, error);
    return fail(503, "栏目数据暂时不可用", "category-edge-v2-data-unavailable");
  }
};

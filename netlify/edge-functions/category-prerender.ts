const SITE = "https://trrb.net";

const ROUTES: Record<string, { name: string; description: string }> = {
  "/important-news": { name: "重要新闻", description: "唐人日报重要新闻，聚焦美国、中国及全球重大事件与突发动态。" },
  "/hot-headlines": { name: "热门头条", description: "唐人日报热门头条，汇集当前最受关注的新闻与热点事件。" },
  "/us-politics": { name: "美国时政", description: "唐人日报美国时政，追踪白宫、国会、选举、政策与联邦政府最新动态。" },
  "/us-crime": { name: "美国警情", description: "唐人日报美国警情，关注美国治安、执法、法院与重大刑事案件。" },
  "/china-officialdom": { name: "中国官场", description: "唐人日报中国官场，追踪官员任免、反腐、调查与公共治理动态。" },
  "/immigration": { name: "移民美国", description: "唐人日报移民美国，关注美国移民政策、签证、绿卡、执法与移民社区动态。" },
  "/asylum": { name: "庇护百科", description: "唐人日报庇护百科，提供美国庇护政策、程序、案例与实务信息。" },
  "/ice/news": { name: "ICE执法动态", description: "唐人日报ICE执法动态，追踪ICE、DHS、HSI、CBP抓捕、拘留、遣返及相关执法新闻。" }
};

export const config = { path: Object.keys(ROUTES) };

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
async function fetchArticles(category: any, name: string) {
  const params: Record<string, string> = {
    select: "id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,author,published_at,created_at,status",
    status: "eq.published",
    order: "published_at.desc.nullslast,created_at.desc",
    limit: "24"
  };

  const filters: string[] = [];
  if (category?.id) filters.push(`category_id.eq.${category.id}`);
  if (name) filters.push(`category_name.eq.${name}`);
  if (name === "ICE执法动态") {
    filters.push("category_name.eq.ICE执法");
    filters.push("category_name.eq.驱逐快报");
    filters.push("topic_key.eq.ice");
  }
  if (filters.length) params.or = `(${filters.join(",")})`;

  return fetchJson("articles", params);
}
function articleUrl(article: any, routePath: string): string {
  const topic = clean(article?.topic_key).toLowerCase();
  const slug = clean(article?.slug) || clean(article?.id);
  if (!slug) return "";
  const section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : routePath.replace(/^\//, "").replace(/\/news$/, "");
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
function cards(articles: any[], routePath: string, categoryName: string): string {
  return articles.map((article) => {
    const url = articleUrl(article, routePath);
    if (!url) return "";
    const image = clean(article.cover_image);
    const summary = description(article);
    return `<article class="archive-card" data-category-prerendered="true"><a href="${esc(url)}">${image ? `<img src="${esc(image)}" width="512" height="288" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${esc(article.title)}" />` : ""}<span>${esc(article.category_name || categoryName)}</span><h2>${esc(article.title)}</h2>${summary ? `<p>${esc(summary)}</p>` : ""}<time>${esc(articleDate(article))}</time></a></article>`;
  }).join("");
}
async function template(request: Request) {
  const url = new URL("/listing.html?__trrb_category_template=1", request.url);
  return fetch(url, { headers: { "X-TRRB-Category-Template": "1" } });
}

export default async (request: Request, context: any) => {
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const route = ROUTES[path];
  if (!route) return context.next();

  try {
    const category = await fetchCategory(route.name);
    const articles = await fetchArticles(category, route.name);
    if (!articles.length) return context.next();

    const upstream = await template(request);
    if (!upstream.ok) return context.next();
    let html = await upstream.text();
    const canonical = `${SITE}${path}`;
    const title = clean(category?.seo_title) || `${route.name} - 唐人日报`;
    const metaDescription = clean(category?.seo_description) || route.description;
    const keywords = clean(category?.seo_keywords) || `${route.name},唐人日报,美国华人新闻`;
    const itemList = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": canonical,
      name: route.name,
      url: canonical,
      description: metaDescription,
      mainEntity: {
        "@type": "ItemList",
        itemListElement: articles.slice(0, 20).map((article, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE}${articleUrl(article, path)}`,
          name: clean(article.title)
        }))
      }
    };

    const seo = `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(metaDescription)}" />
    <meta name="keywords" content="${esc(keywords)}" />
    <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="唐人日报" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(metaDescription)}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:image" content="${SITE}/trrb-logo-cropped.webp" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(metaDescription)}" />
    <meta name="twitter:image" content="${SITE}/trrb-logo-cropped.webp" />
    <script type="application/ld+json" data-trrb-category-schema>${escJson(itemList)}</script>`;

    html = html
      .replace(/<title>[\s\S]*?<\/title>/gi, "")
      .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']keywords["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']robots["'][^>]*>/gi, "")
      .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
      .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
      .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "")
      .replace(/<\/head>/i, `${seo}\n  </head>`)
      .replace(/<h1 id="listing-title">[\s\S]*?<\/h1>/i, `<h1 id="listing-title">${esc(route.name)}</h1>`)
      .replace(/<div class="listing-grid" id="listing-grid">[\s\S]*?<\/div><nav class="pagination"/i, `<div class="listing-grid" id="listing-grid" data-seo-category-snapshot="edge">${cards(articles, path, route.name)}</div><nav class="pagination"`);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("content-type", "text/html; charset=UTF-8");
    responseHeaders.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
    responseHeaders.set("x-trrb-category-prerender", "category-edge-v1");
    responseHeaders.set("link", `<${canonical}>; rel=\"canonical\"`);
    return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: responseHeaders });
  } catch (error) {
    console.error("category prerender failed", path, error);
    return context.next();
  }
};

const SITE = "https://trrb.net";
const PATH = "/topic/xi-jinping";
const PAGE_SIZE = 20;
const DESCRIPTION = "唐人日报习近平专题，汇集与习近平直接相关的已发布新闻、公开活动、政策动向与事件后续。按发布时间浏览报道摘要，进入原文了解背景与来源，并通过分页继续阅读历史报道。";
export const config = { path: [PATH, `${PATH}/`, `${PATH}/index.html`] };
const SECTIONS: Record<string, string> = {
  "重要新闻": "important-news", "热门头条": "hot-headlines", "中国热门头条": "hot-headlines",
  "美国时政": "us-politics", "美国警情": "us-crime", "中国官场": "china-officialdom",
  "移民美国": "immigration", "庇护百科": "asylum", "驱逐快报": "deport",
  "ICE执法动态": "ice", "ICE执法": "ice"
};
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const esc = (value: unknown) => clean(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function articleUrl(row: any) {
  const section = row.topic_key === "trump" ? "trump" : row.topic_key === "ice" ? "ice" : SECTIONS[row.category_name] || "news";
  return `/${section}/${encodeURIComponent(clean(row.slug) || clean(row.id))}`;
}
function pageUrl(page: number) { return page > 1 ? `${PATH}?page=${page}` : PATH; }
function dateText(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function safeImage(value: unknown) {
  const image = clean(value);
  return /^(https?:\/\/|\/assets\/)/i.test(image) && !/image-placeholder|category-placeholders/i.test(image) ? image : "";
}
function card(row: any) {
  const href = esc(articleUrl(row));
  const image = safeImage(row.cover_image);
  const summary = clean(String(row.summary || row.content || "").replace(/<[^>]*>/g, " ")).slice(0, 240);
  const date = row.published_at || row.created_at;
  return `<article class="trump-item ${image ? "" : "no-image"}">${image ? `<a href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(image)}" alt="" width="220" height="130" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('article').classList.add('no-image');this.parentElement.remove()"></a>` : ""}<div><h3><a href="${href}">${esc(row.title)}</a></h3><p>${esc(summary)}</p><div class="trump-meta"><time datetime="${esc(date)}">${esc(dateText(date))}</time>（纽约时间） · ${esc(row.category_name === "热门头条" ? "中国热门头条" : row.category_name)}</div><a class="xi-read" href="${href}">阅读全文 <span aria-hidden="true">→</span></a></div></article>`;
}
function response(request: Request, body: string, status = 200) {
  return new Response(request.method === "HEAD" ? null : body, { status, headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
    "x-robots-tag": status === 200 ? "index, follow, max-image-preview:large" : "noindex, follow",
    "x-trrb-topic": "xi-jinping-server-v1",
    ...(status === 503 ? { "retry-after": "120" } : {})
  } });
}
function errorPage(request: Request, status: number, message: string) {
  return response(request, `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(message)} - 唐人日报</title></head><body><main><h1>${esc(message)}</h1><p><a href="${PATH}">返回习近平专题</a> · <a href="/">返回首页</a></p></main></body></html>`, status);
}
export default async (request: Request, context: any) => {
  if (!["GET", "HEAD"].includes(request.method)) return context.next();
  const url = new URL(request.url);
  const rawPage = url.searchParams.get("page") || "1";
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 10000) return errorPage(request, 404, "该专题分页不存在");
  const page = Number(rawPage);
  if (url.pathname !== PATH) return Response.redirect(`${SITE}${pageUrl(page)}`, 301);
  try {
    const env = (globalThis as any).Netlify?.env || (globalThis as any).Deno?.env;
    const base = (env?.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const key = env?.get("SUPABASE_ANON_KEY") || env?.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!base || !key) throw new Error("Missing data configuration");
    const endpoint = new URL(`${base}/rest/v1/articles`);
    Object.entries({
      select: "id,title,slug,summary,content,cover_image,category_name,topic_key,published_at,created_at",
      status: "eq.published", visibility: "eq.public",
      or: "(title.ilike.*习近平*,summary.ilike.*习近平*,title.ilike.*習近平*,summary.ilike.*習近平*)",
      order: "published_at.desc.nullslast,created_at.desc,id.desc",
      limit: String(PAGE_SIZE + 1), offset: String((page - 1) * PAGE_SIZE)
    }).forEach(([key, value]) => endpoint.searchParams.set(key, value));
    const result = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new Error(`Topic data ${result.status}`);
    const rows = await result.json();
    if (!Array.isArray(rows)) throw new Error("Invalid topic data");
    if (!rows.length) return errorPage(request, 404, page > 1 ? "该专题分页不存在" : "专题报道正在整理中");
    const articles = rows.slice(0, PAGE_SIZE);
    const hasNext = rows.length > PAGE_SIZE;
    const canonical = `${SITE}${pageUrl(page)}`;
    const title = `习近平专题${page > 1 ? ` 第${page}页` : ""}｜唐人日报`;
    const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: canonical, description: DESCRIPTION, about: { "@type": "Person", name: "习近平" }, mainEntity: { "@type": "ItemList", itemListElement: articles.map((row: any, index: number) => ({ "@type": "ListItem", position: (page - 1) * PAGE_SIZE + index + 1, name: row.title, url: `${SITE}${articleUrl(row)}` })) } };
    const schemaJson = JSON.stringify(schema).replaceAll("<", "\\u003c");
    return response(request, `<!doctype html><html lang="zh-Hans"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(DESCRIPTION)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="唐人日报"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(DESCRIPTION)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${SITE}/trrb-logo-cropped.webp"><meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/topic/trump/trump.css?v=20260725-4"><link rel="stylesheet" href="/topic/xi-jinping/xi.css?v=20260916-1"><script type="application/ld+json">${schemaJson}</script></head><body>
<header class="trump-topbar"><a class="trump-brand" href="/">唐人日报</a><a class="xi-home" href="/#topic-focus">返回首页专题</a></header>
<main class="trump-page"><section class="trump-hero"><div><span class="eyebrow">人物专题 · XI JINPING</span><h1>习近平专题</h1><p>追踪相关新闻、公开活动、政策动向与事件后续。结合报道摘要与原文，了解事件的来龙去脉。</p></div><div class="trump-status"><i></i><span>持续更新</span><b>${page === 1 ? "最新报道" : "本页最新报道"}：${esc(dateText(articles[0].published_at || articles[0].created_at))}</b></div></section>
<section class="trump-feed-panel"><div class="trump-feed-head"><h2>${page > 1 ? `历史报道 · 第${page}页` : "最新报道"}</h2><a class="xi-refresh" href="${pageUrl(page)}">刷新</a></div><p class="xi-context">按发布时间排序 · 阅读原文可查看报道来源与背景</p><div class="trump-feed">${articles.map(card).join("")}</div>
<nav class="xi-pagination" aria-label="专题分页">${page > 1 ? `<a rel="prev" href="${pageUrl(page - 1)}">上一页</a>` : ""}<span aria-current="page">第 ${page} 页</span>${hasNext ? `<a rel="next" href="${pageUrl(page + 1)}">下一页 · 继续阅读</a>` : ""}</nav></section></main><footer class="xi-footer">唐人日报 · <a href="/">返回首页</a></footer></body></html>`);
  } catch (error) {
    console.error("Xi topic unavailable", error);
    return errorPage(request, 503, "专题暂时无法更新，请稍后重试");
  }
};

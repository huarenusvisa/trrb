import { ELECTION_FILTER, POLITICS_FILTER, XI_FILTER, ICE_FILTER, ENFORCEMENT_FILTER, POLITICS_VIEWS, termFilter, isChinaPolitical } from "../shared/editorial-topics.mjs";
const SITE = "https://trrb.net";
const PAGE_SIZE = 20;
const ROUTES: Record<string, any> = {
  "/topic/midterm-elections": {name:"2026中期选举实时动态", eyebrow:"美国选举 · MIDTERMS 2026", intro:"追踪国会席位争夺、关键州选情、党内初选与投票规则。按时间阅读相关新闻，了解竞选进展与事件背景。", description:"唐人日报2026美国中期选举专题，汇集参众两院席位争夺、关键州竞选、党内初选、选区划分与投票规则报道。按发布时间浏览相关新闻摘要，通过原文查看来源和背景，使用分页继续阅读本轮选举的历史报道。", filter:ELECTION_FILTER, views:{}},
  "/topic/xi-jinping": {name:"习近平专题", eyebrow:"人物专题 · XI JINPING", intro:"追踪相关新闻、公开活动、政策动向与事件后续。结合报道摘要与原文，了解事件的来龙去脉。", description:"唐人日报习近平专题，汇集与习近平直接相关的已发布新闻、公开活动、政策动向与事件后续。按发布时间浏览报道摘要，进入原文了解背景与来源，并通过分页继续阅读历史报道。", filter:XI_FILTER, views:{}},
  "/china-politics": {name:"中国政治", eyebrow:"中国政治 · CHINA POLITICS", intro:"关注领导人动态、人事任免、机构变化与事件后续。结合原文来源阅读报道，区分事实、转述与分析。", description:"唐人日报中国政治栏目，汇集领导人公开活动、人事任免、调查通报和政策动向。按发布时间查看新闻摘要、背景与后续报道，浏览领导人动态、人事任免及政治观察，进入原文核对信息来源。", filter:POLITICS_FILTER, views:POLITICS_VIEWS},
  "/us-enforcement": {name:"美国执法与警情", eyebrow:"美国执法 · PUBLIC SAFETY", intro:"汇集ICE执法、移民拘留与遣返，以及美国警方执法和案件进展。按领域浏览相关新闻与后续报道。", description:"唐人日报美国执法与警情，汇集ICE执法、拘留、遣返及美国警方执法和案件进展。分别浏览ICE执法和美国警情，查看新闻摘要、发布时间及事件后续，并从原文了解来源与背景。", filter:ENFORCEMENT_FILTER, views:{ice:{label:"ICE执法"},crime:{label:"美国警情"}}}
};
export const config = { path: ["/topic/midterm-elections", "/topic/midterm-elections/", "/topic/midterm-elections/index.html", "/topic/xi-jinping", "/topic/xi-jinping/", "/topic/xi-jinping/index.html", "/china-politics", "/china-politics/", "/china-politics/index.html", "/us-enforcement", "/us-enforcement/", "/us-enforcement/index.html"] };
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
function pageUrl(path: string, page: number, view = "") {
  const query = new URLSearchParams();
  if (view) query.set("view", view);
  if (page > 1) query.set("page", String(page));
  return path + (query.size ? `?${query}` : "");
}
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
    "x-trrb-topic": "editorial-collections-v1",
    ...(status === 503 ? { "retry-after": "120" } : {})
  } });
}
function errorPage(request: Request, status: number, message: string, path = "/topic/xi-jinping") {
  return response(request, `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(message)} - 唐人日报</title></head><body><main><h1>${esc(message)}</h1><p><a href="${path}">返回栏目</a> · <a href="/">返回首页</a></p></main></body></html>`, status);
}
export default async (request: Request, context: any) => {
  if (!["GET", "HEAD"].includes(request.method)) return context.next();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
  const route = ROUTES[path];
  if (!route) return context.next();
  const view = url.searchParams.get("view") || "";
  if (view && !route.views[view]) return errorPage(request, 404, "该分类不存在", path);
  const selectedView = route.views[view];
  const rawPage = url.searchParams.get("page") || "1";
  if (!/^\d+$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 10000) return errorPage(request, 404, "该专题分页不存在", path);
  const page = Number(rawPage);
  if (url.pathname !== path) return Response.redirect(`${SITE}${pageUrl(path, page, view)}`, 301);
  try {
    const env = (globalThis as any).Netlify?.env || (globalThis as any).Deno?.env;
    const base = (env?.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const key = env?.get("SUPABASE_ANON_KEY") || env?.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!base || !key) throw new Error("Missing data configuration");
    const endpoint = new URL(`${base}/rest/v1/articles`);
    Object.entries({
      select: "id,title,slug,summary,content,cover_image,category_name,topic_key,published_at,created_at",
      status: "eq.published", visibility: "eq.public",
      or: route.filter,
      order: "published_at.desc.nullslast,created_at.desc,id.desc",
      limit: String(PAGE_SIZE + 1), offset: String((page - 1) * PAGE_SIZE)
    }).forEach(([key, value]) => endpoint.searchParams.set(key, value));
    if (path === "/china-politics" && selectedView) endpoint.searchParams.set("and", `(or${termFilter(selectedView.terms)})`);
    if (path === "/us-enforcement" && view === "ice") endpoint.searchParams.set("or", ICE_FILTER);
    if (path === "/us-enforcement" && view === "crime") endpoint.searchParams.set("category_name", "eq.美国警情");
    if (path === "/topic/midterm-elections") endpoint.searchParams.set("and", `(published_at.gte.2026-01-01T00:00:00Z,published_at.lte.${new Date().toISOString()})`);
    const result = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new Error(`Topic data ${result.status}`);
    const rows = await result.json();
    if (!Array.isArray(rows)) throw new Error("Invalid topic data");
    if (!rows.length) return errorPage(request, 404, page > 1 ? "该专题分页不存在" : "相关报道正在整理中", path);
    const articles = rows.slice(0, PAGE_SIZE).filter(row => path !== "/china-politics" || isChinaPolitical(row));
    const hasNext = rows.length > PAGE_SIZE;
    const canonical = `${SITE}${pageUrl(path, page, view)}`;
    const title = `${route.name}${selectedView ? ` · ${selectedView.label}` : ""}${page > 1 ? ` 第${page}页` : ""}｜唐人日报`;
    const schema = { "@context": "https://schema.org", "@type": "CollectionPage", name: title, url: canonical, description: route.description, ...(path === "/topic/xi-jinping" ? {about: { "@type": "Person", name: "习近平" }} : {}), mainEntity: { "@type": "ItemList", itemListElement: articles.map((row: any, index: number) => ({ "@type": "ListItem", position: (page - 1) * PAGE_SIZE + index + 1, name: row.title, url: `${SITE}${articleUrl(row)}` })) } };
    const iceAssets = path === "/us-enforcement" ? '<link rel="stylesheet" href="/topic/ice/tracking-overlay.css?v=20260916-1"><script defer src="/topic/ice/people-count.js?v=20260916-1"></script><script defer src="/topic/ice/tracking-data.js?v=20260916-2"></script><script defer src="/topic/ice/tracking-overlay.js?v=20260916-1"></script>' : '';
    const iceSummary = path === "/us-enforcement" ? `<section class="ice-tracking-summary" aria-label="ICE执法动态"><div><h2>ICE执法动态</h2><div>近24小时发布 <strong data-ice-reports>—</strong> 篇 · 报道涉及 <strong data-ice-people>—</strong> 人</div><p data-ice-update>正在读取最新公开报道…</p><p>按报道发布时间汇总，含估算；不代表全美实际执法总人数。</p></div><a href="/ice" aria-haspopup="dialog" aria-controls="ice-tracking-dialog">全屏查看地图 ↗</a></section><button class="ice-tracking-float" hidden type="button" aria-haspopup="dialog" aria-controls="ice-tracking-dialog">ICE执法地图 ↗</button><dialog id="ice-tracking-dialog" class="ice-tracking-dialog" aria-labelledby="ice-dialog-title"><div class="ice-tracking-toolbar"><h2 id="ice-dialog-title">ICE执法追踪</h2><a href="/ice" target="_blank" rel="noopener">独立页面 ↗</a><button type="button" autofocus>关闭 ×</button></div></dialog>` : '';
    const schemaJson = JSON.stringify(schema).replaceAll("<", "\\u003c");
    return response(request, `<!doctype html><html lang="zh-Hans"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(route.description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="唐人日报"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(route.description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${SITE}/trrb-logo-cropped.webp"><meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/topic/trump/trump.css?v=20260725-4"><link rel="stylesheet" href="/topic/xi-jinping/xi.css?v=20260916-1"><script type="application/ld+json">${schemaJson}</script>${iceAssets}</head><body>
<header class="trump-topbar"><a class="trump-brand" href="/">唐人日报</a><a class="xi-home" href="/#topic-focus">返回首页专题</a></header>
<main class="trump-page"><section class="trump-hero"><div><span class="eyebrow">${esc(route.eyebrow)}</span><h1>${esc(route.name)}</h1><p>${esc(route.intro)}</p></div><div class="trump-status"><i></i><span>持续更新</span><b>${page === 1 ? "最新报道" : "本页最新报道"}：${esc(dateText(articles[0].published_at || articles[0].created_at))}</b></div></section>
${iceSummary}<section class="trump-feed-panel">${Object.keys(route.views).length ? `<nav class="xi-tabs" aria-label="新闻分类"><a href="${path}" ${!view ? 'aria-current="page"' : ''}>全部报道</a>${Object.entries(route.views).map(([key, value]: [string, any]) => `<a href="${pageUrl(path, 1, key)}" ${view === key ? 'aria-current="page"' : ''}>${esc(value.label)}</a>`).join("")}</nav>` : ""}<div class="trump-feed-head"><h2>${page > 1 ? `历史报道 · 第${page}页` : "最新报道"}</h2><a class="xi-refresh" href="${pageUrl(path, page, view)}">刷新</a></div><p class="xi-context">按发布时间排序 · 阅读原文可查看报道来源与背景</p><div class="trump-feed">${articles.map(card).join("")}</div>
<nav class="xi-pagination" aria-label="专题分页">${page > 1 ? `<a rel="prev" href="${pageUrl(path, page - 1, view)}">上一页</a>` : ""}<span aria-current="page">第 ${page} 页</span>${hasNext ? `<a rel="next" href="${pageUrl(path, page + 1, view)}">下一页 · 继续阅读</a>` : ""}</nav></section></main><footer class="xi-footer">唐人日报 · <a href="/">返回首页</a></footer></body></html>`);
  } catch (error) {
    console.error("Xi topic unavailable", error);
    return errorPage(request, 503, "专题暂时无法更新，请稍后重试", path);
  }
};

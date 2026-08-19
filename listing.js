const TRRB_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const TRRB_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const TRRB_LIVE_CACHE_TTL = 60 * 1000;
let currentCategorySlug = "";
let currentCategoryPath = "";

const PUBLIC_CATEGORY_ROUTES = {
  "/important-news": { name: "重要新闻", slug: "important-news" },
  "/hot-headlines": { name: "热门头条", slug: "hot-headlines" },
  "/us-politics": { name: "美国时政", slug: "us-politics" },
  "/us-crime": { name: "美国警情", slug: "us-crime" },
  "/china-officialdom": { name: "中国官场", slug: "china-officialdom" },
  "/immigration": { name: "移民美国", slug: "immigration" },
  "/asylum": { name: "庇护百科", slug: "asylum" },
  "/ice/news": { name: "ICE执法动态", slug: "ice" }
};

function readLiveCache(key) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || "null");
    if (cached && Date.now() - cached.savedAt < TRRB_LIVE_CACHE_TTL && Array.isArray(cached.data)) return cached.data;
  } catch {}
  return null;
}

function writeLiveCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
}

async function fetchJsonWithTimeout(url, options = {}, timeout = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function fetchCategoryBySlug(slug) {
  if (!slug) return null;
  const select = ["id","name","slug","is_active","seo_title","seo_description","seo_keywords"].join(",");
  const url = `${TRRB_SUPABASE_URL}/rest/v1/categories?select=${encodeURIComponent(select)}&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&limit=1`;
  const rows = await fetchJsonWithTimeout(url, {
    cache: "no-store",
    headers: { apikey: TRRB_SUPABASE_KEY, Authorization: `Bearer ${TRRB_SUPABASE_KEY}`, Accept: "application/json" }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function fetchLivePublishedArticles(limit = 60, category = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit)||60,1),200)), _: String(Date.now()) });
    if (category) params.set("category", category);
    const response = await fetch(`/.netlify/functions/public-home-articles?${params.toString()}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`栏目实时接口 ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    return rows.map(mapLiveArticle).sort((a,b) => articleTimestamp(b)-articleTimestamp(a));
  } finally { clearTimeout(timer); }
}

async function fetchLiveCategoryPage(category, page, pageSize = 24) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const params = new URLSearchParams({
      category: String(category || ""),
      page: String(Math.max(1, Number(page) || 1)),
      page_size: String(Math.min(Math.max(Number(pageSize) || 24, 1), 50)),
      _: String(Date.now())
    });
    const response = await fetch(`/.netlify/functions/public-category-page?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`栏目分页接口 ${response.status}`);
    const payload = await response.json();
    return {
      ...payload,
      articles: (Array.isArray(payload?.articles) ? payload.articles : []).map(mapLiveArticle)
    };
  } finally { clearTimeout(timer); }
}

function articleTimestamp(item) {
  const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function fetchLiveSearchArticles(query, limit = 240) {
  const normalized = String(query || "").trim().slice(0, 120).replace(/[%*(),]/g, " ").replace(/\s+/g, " ");
  if (!normalized) return [];
  const cacheKey = `trrb-search-v1-${normalized.toLowerCase()}-${limit}`;
  const cached = readLiveCache(cacheKey);
  if (cached) return cached;

  const select = ["id","title","slug","summary","category_id","category_name","topic_key","cover_image","author","status","published_at","created_at"].join(",");
  const url = new URL(`${TRRB_SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set("select", select);
  url.searchParams.set("status", "eq.published");
  const pattern = `*${normalized}*`;
  url.searchParams.set("or", `(title.ilike.${pattern},summary.ilike.${pattern},content.ilike.${pattern})`);
  url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
  url.searchParams.set("limit", String(limit));

  const rows = await fetchJsonWithTimeout(url.toString(), {
    cache: "no-store",
    headers: { apikey: TRRB_SUPABASE_KEY, Authorization: `Bearer ${TRRB_SUPABASE_KEY}`, Accept: "application/json" }
  }, 9000);
  const articles = (Array.isArray(rows) ? rows : []).map(mapLiveArticle);
  writeLiveCache(cacheKey, articles);
  return articles;
}

async function fetchLiveArticleById(id) {
  const cacheKey = `trrb-live-article-v5-${id}`;
  const cached = readLiveCache(cacheKey);
  if (cached?.[0]) return cached[0];
  const select = ["id","title","slug","summary","content","category_id","category_name","topic_key","cover_image","author","status","published_at","created_at"].join(",");
  const url = `${TRRB_SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(id)}&status=eq.published&limit=1`;
  const rows = await fetchJsonWithTimeout(url, {
    cache: "default",
    headers: { apikey: TRRB_SUPABASE_KEY, Authorization: `Bearer ${TRRB_SUPABASE_KEY}`, Accept: "application/json" }
  });
  const article = Array.isArray(rows) && rows[0] ? mapLiveArticle(rows[0]) : null;
  if (article) writeLiveCache(cacheKey, [article]);
  return article;
}

function mapLiveArticle(row) {
  const published = row.published_at || row.created_at || "";
  const content = String(row.content || "").trim();
  return {
    id: row.id,
    title: row.title || "",
    slug: row.slug || "",
    topicKey: row.topic_key || "",
    categoryId: row.category_id || "",
    category: row.category_name || "新闻",
    excerpt: row.summary || content.replace(/\s+/g, " ").slice(0, 120),
    image: row.cover_image || "",
    author: row.author || "Tang Ren Daily",
    date: formatLiveDate(published),
    time: formatLiveDateTime(published),
    views: "",
    body: content ? content.split(/\n{2,}|\r?\n/).map(v => v.trim()).filter(Boolean) : [],
    published_at: row.published_at || "",
    created_at: row.created_at || "",
    isLive: true
  };
}
function formatLiveDate(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatLiveDateTime(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
const pageSize = 24;

initListing();

function renderListingDataset(articles, category, query, page) {
  const filtered = filterArticles(articles, category, query);
  renderHeader(category, query);
  renderArticles(filtered, page);
  renderPagination(filtered.length, page, category, query);
}

async function initListing() {
  const params = new URLSearchParams(window.location.search);
  let category = params.get("category") || "";
  const query = params.get("q") || "";
  const searchMode = params.get("type") === "search" || Boolean(query);
  const page = Math.max(1, Math.floor(Number(params.get("page") || 1)) || 1);
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  const routeContext = window.TRRB_CATEGORY_CONTEXT && typeof window.TRRB_CATEGORY_CONTEXT === "object"
    ? window.TRRB_CATEGORY_CONTEXT
    : null;
  const route = PUBLIC_CATEGORY_ROUTES[pathname] || null;

  if (!searchMode && routeContext?.name && routeContext?.path) {
    category = String(routeContext.name);
    currentCategoryPath = String(routeContext.path);
    currentCategorySlug = String(route?.slug || "");
  } else if (!searchMode && route) {
    category = route.name;
    currentCategoryPath = pathname;
    currentCategorySlug = route.slug;
  }

  if (!searchMode && category && currentCategorySlug) {
    try {
      const categoryRow = await fetchCategoryBySlug(currentCategorySlug);
      if (categoryRow) applyCategorySeo(categoryRow, page);
    } catch (error) {
      console.warn("Category SEO metadata unavailable", error);
    }
  }

  const searchForm = document.querySelector("#listing-search");
  const searchInput = document.querySelector("#listing-search-input");
  if (searchForm) searchForm.hidden = !searchMode;
  if (searchInput) searchInput.value = query;

  renderHeader(category, query);

  try {
    if (searchMode && query) {
      const live = await fetchLiveSearchArticles(query, 240);
      renderListingDataset(live, category, query, page);
      return;
    }

    if (category && currentCategoryPath) {
      const payload = await fetchLiveCategoryPage(category, page, pageSize);
      const live = Array.isArray(payload.articles) ? payload.articles : [];
      renderHeader(category, "");
      renderArticles(live, 1);
      renderPagination(Number(payload.total) || live.length, page, category, "");
      return;
    }

    const live = await fetchLivePublishedArticles(200, category);
    if (!live.length) {
      renderArticles([], page);
      return;
    }
    renderListingDataset(live, category, query, page);
  } catch (error) {
    console.warn("Live articles unavailable", error);
    // Keep the server-rendered category snapshot intact when live refresh fails.
    if (category && currentCategoryPath && document.querySelector('[data-seo-category-snapshot="edge"]')) return;
    renderArticles([], page);
  }
}

function applyCategorySeo(category, page = 1) {
  const basePath = currentCategoryPath || `/${encodeURIComponent(category.slug)}`;
  const suffix = page > 1 ? `?page=${page}` : "";
  if (category.seo_title) {
    const title = String(category.seo_title).replace(/\s*-\s*唐人日报\s*$/i, "");
    document.title = page > 1 ? `${title} 第${page}页 - 唐人日报` : category.seo_title;
  }
  if (category.seo_description) setMeta("description", category.seo_description);
  if (category.seo_keywords) setMeta("keywords", category.seo_keywords);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
  canonical.href = `https://trrb.net${basePath}${suffix}`;
}

function setMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) { meta = document.createElement("meta"); meta.name = name; document.head.appendChild(meta); }
  meta.content = content;
}

function filterArticles(articles, category, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return articles.filter((article) => {
    const topic = String(article?.topicKey || article?.topic_key || "").trim().toLowerCase();
    const articleCategory = String(article?.category || article?.category_name || "").trim();
    const iceCategoryMatch = category === "ICE执法动态" && (topic === "ice" || ["ICE执法动态", "ICE执法", "驱逐快报"].includes(articleCategory));
    const categoryMatch = !category || articleCategory === category || iceCategoryMatch;
    const queryMatch = !normalizedQuery || [article.title, article.excerpt, articleCategory, article.date].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
    return categoryMatch && queryMatch;
  }).sort((a,b) => articleTimestamp(b)-articleTimestamp(a));
}

function renderHeader(category, query) {
  const title = document.querySelector("#listing-title");
  let heading = "2026文章归档";
  if (category) heading = category;
  if (query) heading = `搜索：${query}`;
  if (category && query) heading = `${category} · 搜索：${query}`;
  if (!currentCategoryPath || query) document.title = `${heading} - 唐人日报`;
  title.textContent = heading;
}

function renderArticles(articles, page) {
  const grid = document.querySelector("#listing-grid");
  const start = (page - 1) * pageSize;
  const items = articles.slice(start, start + pageSize);
  if (items.length === 0) { grid.innerHTML = `<div class="empty-list">没有找到相关文章。</div>`; return; }
  grid.innerHTML = items.map(renderCard).join("");
}

function articleUrl(article) {
  if (typeof window.TRRB_articleUrl === "function") {
    const routed = window.TRRB_articleUrl(article);
    if (routed) return routed;
  }
  const id = String(article?.id || "").trim();
  const slug = String(article?.slug || "").trim();
  const topic = String(article?.topicKey || article?.topic_key || "").trim().toLowerCase();
  const sections = {
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
  const section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : (sections[String(article?.category || "").trim()] || "news");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id);
  const routeKey = slug || (isUuid ? id : "");
  if (routeKey) return `/${encodeURIComponent(section)}/${encodeURIComponent(routeKey)}`;
  if (/^\d+$/.test(id)) return `/article.html?id=${encodeURIComponent(id)}`;
  return "/";
}

function renderCard(article) {
  const image = imageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === 'function' ? window.TRRB_categoryPlaceholder(article.category || '') : './image-placeholder.svg';
  return `<article class="archive-card"><a href="${escapeAttribute(articleUrl(article))}"><img src="${escapeAttribute(image)}" width="512" height="288" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'" alt="" /><span>${escapeHtml(article.category || "新闻")}</span><h2>${escapeHtml(article.title || "")}</h2><p>${escapeHtml(article.excerpt || "")}</p><time>${escapeHtml(article.time || article.date || "")}</time></a></article>`;
}

function imageUrl(value, category) {
  if (typeof window.TRRB_getImageUrl === 'function') return window.TRRB_getImageUrl(value, category);
  const text = String(value || "").replaceAll("\u0026", "&");
  if (!text) return "./image-placeholder.svg";
  if (text.startsWith("/assets/news-images/")) return "." + text;
  if (text.startsWith("assets/news-images/")) return "./" + text;
  return text.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "./assets/news-images/");
}

function renderPagination(total, currentPage, category, query) {
  const nav = document.querySelector("#pagination");
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { nav.innerHTML = ""; return; }
  const pages = paginationWindow(currentPage, totalPages);
  nav.innerHTML = `${pageLink("上一页", Math.max(1, currentPage - 1), currentPage === 1, category, query)}${pages.map((page) => pageLink(page, page, page === currentPage, category, query)).join("")}${pageLink("下一页", Math.min(totalPages, currentPage + 1), currentPage === totalPages, category, query)}`;
}

function paginationWindow(currentPage, totalPages) {
  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

function pageLink(label, page, disabled, category, query) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", page);
  if (disabled) return `<span class="page-link is-disabled">${label}</span>`;
  if (currentCategoryPath && !query) {
    const suffix = page > 1 ? `?page=${page}` : "";
    return `<a class="page-link" href="${escapeAttribute(currentCategoryPath + suffix)}">${label}</a>`;
  }
  if (category) params.set("category", category);
  return `<a class="page-link" href="/listing.html?${params.toString()}">${label}</a>`;
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttribute(value) { return escapeHtml(value).replaceAll("`", "&#096;"); }

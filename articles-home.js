const TRRB_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const TRRB_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const TRRB_LIVE_CACHE_TTL = 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;

const CATEGORY_ROUTES = {
  "重要新闻": "/important-news",
  "热门头条": "/hot-headlines",
  "中国热门头条": "/hot-headlines",
  "美国时政": "/us-politics",
  "美国警情": "/us-crime",
  "中国官场": "/china-officialdom",
  "移民美国": "/immigration",
  "庇护百科": "/asylum",
  "驱逐快报": "/ice",
  "ICE执法动态": "/ice",
  "ICE执法": "/ice"
};
const CATEGORY_SECTIONS = Object.fromEntries(Object.entries(CATEGORY_ROUTES).map(([name, route]) => [name, route.replace(/^\//, "")]));

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

async function fetchLivePublishedArticles(limit = 60, category = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Number(limit) || 60, 1), 200)), _: String(Date.now()) });
    if (category) params.set("category", category);
    const response = await fetch(`/.netlify/functions/public-home-articles?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`首页实时接口 ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    return rows.map(mapLiveArticle).sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
  } finally { clearTimeout(timer); }
}

async function fetchHomepageFocus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const response = await fetch(`/.netlify/functions/public-home-focus?_=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`今日要闻接口 ${response.status}`);
    const payload = await response.json();
    return (Array.isArray(payload?.articles) ? payload.articles : [])
      .map((row) => ({
        ...mapLiveArticle(row),
        longform_chars: Number(row.longform_chars || 0),
        homepage_focus_source: row.homepage_focus_source || ""
      }))
      .filter((item) => item.id && item.title);
  } finally { clearTimeout(timer); }
}

async function fetchUnifiedHomeBundle() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);
  try {
    const params = new URLSearchParams({ limit: "200", per_category: "12", _: String(Date.now()) });
    const response = await fetch(`/.netlify/functions/public-home-bundle?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`首页统一实时接口 ${response.status}`);
    const payload = await response.json();
    if (payload?.mode !== "homepage") throw new Error("首页统一实时接口返回格式异常");
    const rows = Array.isArray(payload?.articles) ? payload.articles : [];
    return rows.map(mapLiveArticle).sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
  } finally { clearTimeout(timer); }
}

function articleTimestamp(item) {
  const raw = item?.published_at || item?.created_at || item?.date || item?.time || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}
const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;
function isFreshHomepageArticle(item) {
  const t = articleTimestamp(item);
  return t > 0 && Date.now() - t <= HOME_MAX_AGE_MS;
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
    categoryId: row.category_id || "",
    category_id: row.category_id || "",
    topicKey: row.topic_key || "",
    topic_key: row.topic_key || "",
    category: row.category_name || "新闻",
    category_name: row.category_name || "新闻",
    excerpt: row.summary || content.replace(/\s+/g, " ").slice(0, 120),
    summary: row.summary || "",
    image: row.cover_image || "",
    cover_image: row.cover_image || "",
    author: row.author || "Tang Ren Daily",
    status: row.status || "published",
    visibility: row.visibility || "public",
    is_breaking: row.is_breaking === true,
    rank_score: Number(row.rank_score || 0),
    published_at: row.published_at || "",
    created_at: row.created_at || "",
    date: formatLiveDate(published),
    time: formatLiveDateTime(published),
    views: "",
    body: content ? content.split(/\n{2,}|\r?\n/).map(v => v.trim()).filter(Boolean) : [],
    isLive: true
  };
}
function formatLiveDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatLiveDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const categoryIds = {
  重要新闻: "important",
  热门头条: "hot",
  中国热门头条: "hot",
  驱逐快报: "deport",
  "ICE执法动态": "ice",
  美国时政: "politics",
  美国警情: "crime",
  中国官场: "china",
  移民美国: "immigration",
  庇护百科: "asylum",
  深度专题: "deep"
};
window.categoryIds = categoryIds;

function localArticleIndex() {
  if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.length) return window.TRRB_ARTICLE_INDEX;
  if (Array.isArray(window.TRRB_ARTICLES) && window.TRRB_ARTICLES.length) return window.TRRB_ARTICLES;
  if (Array.isArray(window.TRRB_ARTICLE_CHUNK) && window.TRRB_ARTICLE_CHUNK.length) return window.TRRB_ARTICLE_CHUNK;
  return [];
}
function mergeArticles(live, archived) {
  const seen = new Set((Array.isArray(live) ? live : []).map((item) => String(item.id)));
  return (Array.isArray(live) ? live : []).concat((Array.isArray(archived) ? archived : []).filter((item) => !seen.has(String(item.id))));
}

function categoryUrl(category) {
  return CATEGORY_ROUTES[String(category || "").trim()] || "/";
}
function articleUrl(article) {
  if (!article) return "/";
  const slug = String(article.slug || "").trim();
  const id = String(article.id || "").trim();
  const topic = String(article.topicKey || article.topic_key || "").trim().toLowerCase();
  const category = String(article.category || article.category_name || "").trim();
  const section = topic === "trump" ? "trump" : topic === "ice" ? "ice" : (CATEGORY_SECTIONS[category] || "news");
  if (slug) return `/${encodeURIComponent(section)}/${encodeURIComponent(slug)}`;
  if (UUID_RE.test(id)) return `/${encodeURIComponent(section)}/${encodeURIComponent(id)}`;
  if (typeof window.TRRB_articleUrl === "function") {
    const routed = window.TRRB_articleUrl(article);
    if (routed) return routed;
  }
  return id ? `/article.html?id=${encodeURIComponent(id)}` : "/";
}

function renderHome(articles, focusArticles = null) {
  if (!Array.isArray(articles) || articles.length === 0) return;
  const sorted = articles.slice().sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
  window.TRRB_LAST_HOME_ARTICLES = sorted;
  const hotArticles = sorted.filter((article) => normalizeCategory(article.category) === "热门头条");
  renderTicker((hotArticles.length ? hotArticles : sorted).slice(0, 12));
  const visualArticles = sorted.filter(hasRealImage);
  if (Array.isArray(focusArticles)) {
    if (focusArticles.length) {
      renderHeroCarousel(focusArticles.slice(0, 5));
    } else {
      const hero = document.querySelector("#hero");
      if (hero) hero.innerHTML = '<div class="hero-focus-empty" role="status">今日暂无符合条件的美国时政要闻</div>';
    }
    document.documentElement.dataset.homeFocusAtomic = "true";
  }
  renderTopList((visualArticles.length >= 10 ? visualArticles : sorted).slice(0, 10));
  renderSections(sorted);
  renderRank(sorted);
  if (typeof window.TRRB_renderTopicFocus === "function") window.TRRB_renderTopicFocus(sorted);
}

async function loadHome() {
  try {
    const [live, focusResult] = await Promise.allSettled([
      fetchUnifiedHomeBundle(),
      fetchHomepageFocus()
    ]);
    if (live.status !== "fulfilled" || !live.value.length) {
      throw live.status === "rejected" ? live.reason : new Error("首页统一实时接口没有返回已发布新闻");
    }
    const focus = focusResult.status === "fulfilled" ? focusResult.value : [];
    if (focusResult.status === "rejected") console.warn("今日要闻接口暂不可用：", focusResult.reason);
    renderHome(live.value, focus);
    document.documentElement.dataset.homePrimaryRendered = "true";
  } catch (error) {
    console.error("首页实时新闻加载失败：", error);
    const root = document.querySelector("#sections-grid");
    if (root) root.innerHTML = '<div class="empty-state">实时新闻暂时不可用，请稍后刷新。</div>';
  }
}

function shortDate(value) {
  const text = String(value || "");
  const isoDate = text.match(/^\d{4}-(\d{2})-(\d{2})(?:T|\s|$)/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const compactDate = text.match(/(?:^|\D)(\d{1,2})[/-](\d{1,2})(?:\D|$)/);
  return compactDate
    ? `${String(compactDate[1]).padStart(2, "0")}-${String(compactDate[2]).padStart(2, "0")}`
    : text;
}
function highQualityImageUrl(value, category) {
  if (typeof window.TRRB_getImageUrl === "function") return window.TRRB_getImageUrl(value, category);
  const text = String(value || "").replaceAll("\u0026", "&");
  if (!text) return "/image-placeholder.svg";
  if (text.startsWith("/assets/news-images/")) return text;
  if (text.startsWith("assets/news-images/")) return `/${text}`;
  return text.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "/assets/news-images/");
}
function imageAttrs(article, options = {}) {
  const improved = highQualityImageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === "function" ? window.TRRB_categoryPlaceholder(article.category || "") : "/image-placeholder.svg";
  const eager = Boolean(options.eager);
  const width = Number(options.width || 512);
  const height = Number(options.height || 288);
  return `src="${escapeAttribute(improved)}" width="${width}" height="${height}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""} referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'"`;
}

function renderTicker(articles) {
  const root = document.querySelector("#ticker");
  if (!root) return;
  const items = articles.map((article) => `<a href="${articleUrl(article)}">${escapeHtml(article.title)}</a>`).join("");
  root.innerHTML = `<div class="ticker-track">${items}${items}</div>`;
}
function renderHeroCarousel(articles) {
  const hero = document.querySelector("#hero");
  if (!hero) return;
  hero.innerHTML = articles.map(renderHeroSlide).join("") + renderHeroDots(articles.length);
  startHeroCarousel(hero);
}
function renderHeroSlide(article, index) {
  const activeClass = index === 0 ? " is-active" : "";
  return `<a class="hero-link hero-slide${activeClass}" href="${articleUrl(article)}" aria-label="${escapeAttribute(article.title)}"><img ${imageAttrs(article, { eager: index === 0, width: 1200, height: 675 })} alt="${escapeAttribute(article.title)}" /><div class="hero-overlay"><span class="tag">${escapeHtml(article.category)}</span><h1>${escapeHtml(article.title)}</h1></div></a>`;
}
function renderHeroDots(count) {
  return `<div class="hero-dots" aria-hidden="true">${Array.from({ length: count }, (_, index) => `<span class="${index === 0 ? "is-active" : ""}"></span>`).join("")}</div>`;
}
function startHeroCarousel(hero) {
  if (typeof hero._trrbStopCarousel === "function") hero._trrbStopCarousel();
  const slides = Array.from(hero.querySelectorAll(".hero-slide"));
  const dots = Array.from(hero.querySelectorAll(".hero-dots span"));
  if (slides.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let current = 0;
  let timer = null;
  const advance = () => {
    slides[current].classList.remove("is-active");
    dots[current]?.classList.remove("is-active");
    current = (current + 1) % slides.length;
    slides[current].classList.add("is-active");
    dots[current]?.classList.add("is-active");
  };
  const start = () => { if (!timer && !document.hidden) timer = window.setInterval(advance, 5200); };
  const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
  hero.addEventListener("mouseenter", stop);
  hero.addEventListener("mouseleave", start);
  hero.addEventListener("focusin", stop);
  hero.addEventListener("focusout", start);
  hero.addEventListener("touchstart", stop, { passive: true });
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  hero._trrbStopCarousel = stop;
  start();
}

function renderTopList(articles) {
  const root = document.querySelector("#top-list");
  if (!root) return;
  const items = articles.map((article, index) => `<article><b>${index + 1}</b><img ${imageAttrs(article, { width: 208, height: 148 })} alt="" /><h2><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2></article>`).join("");
  root.innerHTML = `<div class="top-list-track">${items}${items}</div>`;
}
function hasRealImage(item) {
  const image = String(item?.image || "").trim();
  return Boolean(image) && !image.includes("image-placeholder.svg") && !image.includes("/assets/category-placeholders/");
}
function normalizeCategory(value) {
  const category = String(value || "").trim();
  return category === "中国热门头条" ? "热门头条" : category;
}
function findLeadArticle(categoryArticles) { return categoryArticles.find(hasRealImage) || categoryArticles[0] || null; }

function renderCategorySection(category, articles) {
  const displayCategory = category === "热门头条" ? "中国热门头条" : category;
  const categoryArticles = articles
    .filter((item) => normalizeCategory(item.category) === category)
    .filter(isFreshHomepageArticle)
    .sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
  const article = findLeadArticle(categoryArticles);
  const more = categoryUrl(category);

  if (!article) {
    return `<article class="news-box category-empty" id="${categoryIds[category] || ""}"><header><h2>${escapeHtml(displayCategory)}</h2><a href="${more}">更多</a></header><div class="category-empty-state"><strong>暂无该分类内容</strong><span>新内容发布后将在这里显示</span></div></article>`;
  }

  const subItems = categoryArticles.filter((item) => String(item.id) !== String(article.id)).slice(0, 6);
  return `<article class="news-box" id="${categoryIds[category] || ""}"><header><h2>${escapeHtml(displayCategory)}</h2><a href="${more}">更多</a></header><a class="section-lead" href="${articleUrl(article)}"><img ${imageAttrs(article, { width: 512, height: 288 })} alt="" /><h3>${escapeHtml(article.title)}</h3></a><ul class="section-news-list">${subItems.map((item) => `<li><a href="${articleUrl(item)}">${escapeHtml(item.title)}</a><time>${escapeHtml(shortDate(item.time || item.date || ""))}</time></li>`).join("")}</ul></article>`;
}
function renderExposureWallCard() {
  return `<article class="news-box expose-wall-box" id="exposure-wall"><header><h2>曝光墙</h2><a href="/expose.html">我要曝光</a></header><a class="expose-wall-main" href="/expose.html" aria-label="提交曝光材料"><span class="expose-wall-symbol" aria-hidden="true">!</span><h3>匿名曝光 · 证据直达编辑部</h3><p>支持提交文字、图片和视频。公开展示可匿名，但必须留下电话或邮箱，方便编辑核实。</p><strong>提交曝光材料</strong></a><ul class="expose-wall-points"><li>身份信息不会在前台公开</li><li>材料审核后决定是否报道</li><li>严禁捏造、诽谤和非法内容</li></ul></article>`;
}
function renderChinaHotSection(articles) {
  const projected = (Array.isArray(articles) ? articles : []).map((item) => {
    const category = normalizeCategory(item?.category || item?.category_name);
    return category === "热门头条"
      ? { ...item, category: "热门头条", category_name: "热门头条" }
      : item;
  });
  return renderCategorySection("热门头条", projected);
}
function renderSections(articles) {
  // 中国热门头条必须由主渲染器直接拥有，不能依赖后加载的兼容脚本
  // 临时插入；否则缓存或接口时序变化会留下空卡甚至整片空白。
  const categories = ["美国时政", "美国警情", "中国官场", "移民美国", "庇护百科"];
  const sections = [renderChinaHotSection(articles), ...categories.map((category) => renderCategorySection(category, articles))];
  sections.push(renderExposureWallCard());
  const root = document.querySelector("#sections-grid");
  if (root) root.innerHTML = sections.join("");
}

const RANK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
function fallback24hRank(articles, limit = 40) {
  const now = Date.now();
  const seen = new Set();
  const allowedCategories = new Set(["热门头条", "美国时政", "美国警情", "ICE执法动态"]);
  const categoryAliases = new Map([
    ["中国热门头条", "热门头条"],
    ["驱逐快报", "ICE执法动态"],
    ["ICE执法", "ICE执法动态"],
    ["ICE执法追踪", "ICE执法动态"],
    ["ICE新闻", "ICE执法动态"]
  ]);
  return (Array.isArray(articles) ? articles : [])
    .filter((item) => {
      const category = String(item?.category_name || item?.category || "").trim();
      return allowedCategories.has(categoryAliases.get(category) || category);
    })
    .filter((item) => {
      const time = articleTimestamp(item);
      const age = now - time;
      return time > 0 && age >= 0 && age <= RANK_MAX_AGE_MS;
    })
    .sort((a, b) => Number(b.rank_score || 0) - Number(a.rank_score || 0) || articleTimestamp(b) - articleTimestamp(a))
    .filter((item) => {
      const key = String(item.id || item.title || "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
function buildRankPool(articles) {
  const selector = window.TRRB_HOME_RANKING?.select24hRank;
  return typeof selector === "function"
    ? selector(articles, { limit: 40 })
    : fallback24hRank(articles, 40);
}
function rankLabel(article) {
  const raw = String(article.category_name || article.category || "最新").trim() || "最新";
  if (raw === "热门头条" || raw === "中国热门头条") return "中国热门头条";
  if (["驱逐快报", "ICE执法", "ICE执法追踪", "ICE新闻"].includes(raw)) return "ICE执法动态";
  return raw;
}
function renderRank(articles) {
  const rankRoot = document.querySelector("#rank-list");
  const switchBtn = document.querySelector("#rank-switch");
  if (!rankRoot || !switchBtn) return;
  const pool = buildRankPool(articles);
  rankRoot._trrbRankPool = pool;
  rankRoot._trrbRankStart = Number(rankRoot._trrbRankStart || 0) % Math.max(pool.length, 1);
  rankRoot._trrbDrawRank = function draw() {
    const currentPool = Array.isArray(rankRoot._trrbRankPool) ? rankRoot._trrbRankPool : [];
    if (!currentPool.length) {
      rankRoot.innerHTML = '<li class="rank-empty">最近24小时暂无公开内容</li>';
      return;
    }
    const items = [];
    for (let offset = 0; offset < 10; offset += 1) {
      const current = currentPool[(rankRoot._trrbRankStart + offset) % currentPool.length];
      if (!current) continue;
      items.push(`<li><b>${offset + 1}</b><a href="${articleUrl(current)}">${escapeHtml(current.title)}</a><span class="rank-heat">${escapeHtml(rankLabel(current))}</span></li>`);
    }
    rankRoot.innerHTML = items.join("");
  };
  if (!switchBtn.dataset.rankBound) {
    switchBtn.dataset.rankBound = "true";
    switchBtn.addEventListener("click", function (event) {
      event.preventDefault();
      const currentPool = Array.isArray(rankRoot._trrbRankPool) ? rankRoot._trrbRankPool : [];
      rankRoot._trrbRankStart = currentPool.length ? (rankRoot._trrbRankStart + 10) % currentPool.length : 0;
      rankRoot._trrbDrawRank?.();
    });
  }
  rankRoot._trrbDrawRank();
}

function escapeHtml(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeAttribute(value) { return escapeHtml(value).replaceAll("`", "&#096;"); }

window.localArticleIndex = localArticleIndex;
window.renderHome = renderHome;
window.renderHeroCarousel = renderHeroCarousel;
window.renderCategorySection = renderCategorySection;
window.renderSections = renderSections;
window.TRRB_renderChinaHotSection = renderChinaHotSection;
window.hasRealImage = hasRealImage;
window.TRRB_render24hRank = renderRank;
window.TRRB_homeArticleUrl = articleUrl;
window.TRRB_categoryUrl = categoryUrl;

loadHome();

const TRRB_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const TRRB_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const TRRB_LIVE_CACHE_TTL = 60 * 1000;

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

async function fetchLivePublishedArticles(limit = 60) {
  const cacheKey = `trrb-live-v3-${limit}`;
  const cached = readLiveCache(cacheKey);
  if (cached) return cached;
  const select = ["id","title","slug","summary","content","category_name","cover_image","author","status","published_at","created_at"].join(",");
  const url = `${TRRB_SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`;
  const rows = await fetchJsonWithTimeout(url, {
    cache: "default",
    headers: { apikey: TRRB_SUPABASE_KEY, Authorization: `Bearer ${TRRB_SUPABASE_KEY}`, Accept: "application/json" }
  });
  const articles = (Array.isArray(rows) ? rows : []).map(mapLiveArticle);
  writeLiveCache(cacheKey, articles);
  return articles;
}

async function fetchLiveArticleById(id) {
  const cacheKey = `trrb-live-article-v3-${id}`;
  const cached = readLiveCache(cacheKey);
  if (cached?.[0]) return cached[0];
  const select = ["id","title","slug","summary","content","category_name","cover_image","author","status","published_at","created_at"].join(",");
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
    id: row.id, title: row.title || "", category: row.category_name || "新闻",
    excerpt: row.summary || content.replace(/\s+/g, " ").slice(0, 120), image: row.cover_image || "",
    author: row.author || "Tang Ren Daily", date: formatLiveDate(published), time: formatLiveDateTime(published), views: "",
    body: content ? content.split(/\n{2,}|\r?\n/).map(v => v.trim()).filter(Boolean) : [], isLive: true
  };
}
function formatLiveDate(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatLiveDateTime(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
const categoryIds = {
  重要新闻: "important",
  热门头条: "hot",
  驱逐快报: "deport",
  美国时政: "politics",
  美国警情: "crime",
  中国官场: "china",
  移民美国: "immigration",
  庇护百科: "asylum",
  深度专题: "deep"
};

loadHome();

function localArticleIndex() {
  if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.length > 0) return window.TRRB_ARTICLE_INDEX;
  if (Array.isArray(window.TRRB_ARTICLES) && window.TRRB_ARTICLES.length > 0) return window.TRRB_ARTICLES;
  return [];
}

function mergeArticles(live, archived) {
  const seen = new Set((Array.isArray(live) ? live : []).map((item) => String(item.id)));
  return (Array.isArray(live) ? live : []).concat((Array.isArray(archived) ? archived : []).filter((item) => !seen.has(String(item.id))));
}

function renderHome(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return;
  const hotArticles = articles.filter((article) => article.category === "热门头条");
  renderTicker((hotArticles.length ? hotArticles : articles).slice(0, 12));
  const visualArticles = articles.filter(hasRealImage);
  renderHeroCarousel((visualArticles.length >= 5 ? visualArticles : articles).slice(0, 5));
  renderTopList((visualArticles.length >= 10 ? visualArticles : articles).slice(0, 10));
  renderSections(articles);
  renderRank(articles);
}

async function loadHome() {
  const archived = localArticleIndex();
  if (archived.length) renderHome(archived);

  try {
    const live = await fetchLivePublishedArticles(60);
    if (live.length) renderHome(mergeArticles(live, archived));
    else if (!archived.length) throw new Error("No article data");
  } catch (error) {
    console.warn("Live articles unavailable", error);
    if (!archived.length) {
      try {
        const response = await fetch("./data/articles.json", { cache: "force-cache" });
        if (response.ok) renderHome(await response.json());
        else throw new Error("Archive unavailable");
      } catch {
        const hero = document.querySelector("#hero");
        if (hero) hero.innerHTML = `<div class="empty-state">文章数据加载失败，请稍后刷新。</div>`;
      }
    }
  }
}

function articleUrl(article) {
  return `./article.html?id=${encodeURIComponent(article.id)}`;
}

function shortDate(value) {
  const text = String(value || "");
  const match = text.match(/(\d{2})-(\d{2})/);
  return match ? match[0] : text;
}

function highQualityImageUrl(value, category) {
  if (typeof window.TRRB_getImageUrl === 'function') return window.TRRB_getImageUrl(value, category);
  const text = String(value || "").replaceAll("\u0026", "&");
  if (!text) return "./image-placeholder.svg";
  if (text.startsWith("/assets/news-images/")) return "." + text;
  if (text.startsWith("assets/news-images/")) return "./" + text;
  return text.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "./assets/news-images/");
}

function imageAttrs(article, options = {}) {
  const improved = highQualityImageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === "function" ? window.TRRB_categoryPlaceholder(article.category || "") : "./image-placeholder.svg";
  const eager = Boolean(options.eager);
  const width = Number(options.width || 512);
  const height = Number(options.height || 288);
  return `src="${escapeAttribute(improved)}" width="${width}" height="${height}" loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ''} referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'"`;
}

function renderTicker(articles) {
  const items = articles
    .map((article) => `<a href="${articleUrl(article)}">${escapeHtml(article.title)}</a>`)
    .join("");
  document.querySelector("#ticker").innerHTML = `<div class="ticker-track">${items}${items}</div>`;
}

function renderHeroCarousel(articles) {
  const hero = document.querySelector("#hero");
  hero.innerHTML = articles.map(renderHeroSlide).join("") + renderHeroDots(articles.length);
  startHeroCarousel(hero);
}

function renderHeroSlide(article, index) {
  const activeClass = index === 0 ? " is-active" : "";
  return `
    <a class="hero-link hero-slide${activeClass}" href="${articleUrl(article)}" aria-label="${escapeAttribute(article.title)}">
      <img ${imageAttrs(article, { eager: index === 0, width: 1200, height: 675 })} alt="${escapeAttribute(article.title)}" />
      <div class="hero-overlay">
        <span class="tag">${escapeHtml(article.category)}</span>
        <h1>${escapeHtml(article.title)}</h1>
      </div>
    </a>
  `;
}

function renderHeroDots(count) {
  return `
    <div class="hero-dots" aria-hidden="true">
      ${Array.from({ length: count }, (_, index) => `<span class="${index === 0 ? "is-active" : ""}"></span>`).join("")}
    </div>
  `;
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
  const items = articles
    .map(
      (article, index) => `
        <article>
          <b>${(index % articles.length) + 1}</b>
          <img ${imageAttrs(article, { width: 208, height: 148 })} alt="" />
          <h2><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2>
        </article>
      `
    )
    .join("");
  document.querySelector("#top-list").innerHTML = `<div class="top-list-track">${items}${items}</div>`;
}

function hasRealImage(item) {
  const image = String(item?.image || "").trim();
  return Boolean(image)
    && !image.includes("image-placeholder.svg")
    && !image.includes("/assets/category-placeholders/");
}

function findLeadArticle(categoryArticles, allArticles) {
  return categoryArticles.find(hasRealImage)
    || allArticles.find(hasRealImage)
    || categoryArticles[0]
    || allArticles[0];
}

function renderSections(articles) {
  const categories = ["重要新闻", "热门头条", "驱逐快报", "美国时政", "美国警情", "中国官场", "移民美国", "庇护百科"];
  const sections = categories.map((category) => {
    const categoryArticles = articles.filter((item) => item.category === category);
    const article = findLeadArticle(categoryArticles, articles);
    const directItems = categoryArticles.filter((item) => item.id !== article.id).slice(0, 6);
    const fallbackItems = articles
      .filter((item) => item.id !== article.id && !directItems.some((direct) => direct.id === item.id))
      .slice(0, Math.max(0, 6 - directItems.length));
    const subItems = directItems.concat(fallbackItems).slice(0, 6);

    return `
      <article class="news-box" id="${categoryIds[category] || ""}">
        <header><h2>${escapeHtml(category)}</h2><a href="./listing.html?category=${encodeURIComponent(category)}">更多</a></header>
        <a class="section-lead" href="${articleUrl(article)}">
          <img ${imageAttrs(article, { width: 512, height: 288 })} alt="" />
          <h3>${escapeHtml(article.title)}</h3>
        </a>
        <ul class="section-news-list">
          ${subItems.map((item) => `
            <li>
              <a href="${articleUrl(item)}">${escapeHtml(item.title)}</a>
              <time>${escapeHtml(shortDate(item.time || item.date || ""))}</time>
            </li>
          `).join("")}
        </ul>
      </article>
    `;
  });
  document.querySelector("#sections-grid").innerHTML = sections.join("");
}

function buildRankPool(articles) {
  return articles.slice(0, 40).map((article, index) => ({
    ...article,
    heat: generateHeat(article, index)
  }));
}

function generateHeat(article, index) {
  const digits = String(article.id || '').replace(/\D/g, '');
  const seed = Number(digits.slice(-3) || index + 1);
  const value = 16000 + ((seed * 37) % 9000) + (12 - index) * 430;
  return `${(value / 10000).toFixed(1)}万`;
}

function renderRank(articles) {
  const rankRoot = document.querySelector('#rank-list');
  const switchBtn = document.querySelector('#rank-switch');
  if (!rankRoot || !switchBtn) return;
  const pool = buildRankPool(articles);
  let start = 0;

  function draw() {
    const items = [];
    for (let offset = 0; offset < 10; offset += 1) {
      const current = pool[(start + offset) % pool.length];
      if (!current) continue;
      items.push(`
        <li>
          <b>${offset + 1}</b>
          <a href="${articleUrl(current)}">${escapeHtml(current.title)}</a>
          <span class="rank-heat">${current.heat}</span>
        </li>
      `);
    }
    rankRoot.innerHTML = items.join('');
  }

  switchBtn.addEventListener('click', function (event) {
    event.preventDefault();
    start = (start + 10) % pool.length;
    draw();
  });

  draw();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

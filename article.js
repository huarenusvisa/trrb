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
  const select = ["id","title","slug","summary","content","category_name","cover_image","seo_keywords","author","status","published_at","created_at"].join(",");
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
  const select = ["id","title","slug","summary","content","category_name","cover_image","seo_keywords","author","status","published_at","created_at"].join(",");
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
    seoKeywords: row.seo_keywords || "", author: row.author || "Tang Ren Daily", date: formatLiveDate(published), time: formatLiveDateTime(published), views: "",
    body: content ? content.split(/\n{2,}|\r?\n/).map(v => v.trim()).filter(Boolean) : [], isLive: true
  };
}
function formatLiveDate(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatLiveDateTime(value) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return String(value); return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
async function loadArticlePage() {
  const root = document.querySelector("#article-root");
  if (!root) return;

  try {
    const articles = await getArticleIndex();
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get("id") || articles[0]?.id;
    let indexArticle = articles.find((item) => String(item.id) === String(articleId));
    if (!indexArticle && articleId) {
      try { indexArticle = await fetchLiveArticleById(articleId); } catch (error) { console.warn("Live article unavailable", error); }
    }
    indexArticle = indexArticle || articles[0];

    if (!indexArticle) {
      root.innerHTML = `<a class="back-link" href="./index.html">返回首页</a><h1>文章不存在</h1>`;
      return;
    }

    const article = await getFullArticle(indexArticle);
    renderArticle(root, article, articles);
  } catch {
    root.innerHTML = `<a class="back-link" href="./index.html">返回首页</a><h1>文章加载失败</h1><p>请稍后刷新页面。</p>`;
  }
}

async function getArticleIndex() {
  if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.length > 0) return window.TRRB_ARTICLE_INDEX;
  if (Array.isArray(window.TRRB_ARTICLES) && window.TRRB_ARTICLES.length > 0) return window.TRRB_ARTICLES;
  try {
    const response = await fetch("./data/articles.json", { cache: "force-cache" });
    if (response.ok) return await response.json();
  } catch (error) {
    console.warn("Archive unavailable", error);
  }
  return [];
}

async function getFullArticle(indexArticle) {
  if (indexArticle.isLive || Array.isArray(indexArticle.body)) {
    return indexArticle;
  }

  const chunkNumber = Number(indexArticle.chunk || 0);
  await loadScript(`./articles-chunk-${chunkNumber}.js?v=29.1-mobile`);
  const chunk = window.TRRB_ARTICLE_CHUNK;
  if (!Array.isArray(chunk)) throw new Error("Missing article chunk");

  const article = chunk.find((item) => item.id === indexArticle.id);
  if (!article) throw new Error("Article not found in chunk");
  return article;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    window.TRRB_ARTICLE_CHUNK = null;
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function renderArticle(root, article, articles) {
  const currentIndex = articles.findIndex((item) => String(item.id) === String(article.id));
  const previous = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;
  const related = articles
    .filter((item) => String(item.id) !== String(article.id) && item.category === article.category)
    .concat(articles.filter((item) => String(item.id) !== String(article.id) && item.category !== article.category))
    .slice(0, 12);
  const extensionItems = related.concat(related).slice(0, Math.max(related.length * 2, related.length));

  const rawCover = String(article.image || "").trim();
  const coverUrl = imageUrl(rawCover, article.category || "");
  const coverOriginal = originalUploadUrl(rawCover);
  const coverFallback = typeof window.TRRB_categoryPlaceholder === "function" ? window.TRRB_categoryPlaceholder(article.category || "") : "./image-placeholder.svg";
  const hasCover = Boolean(coverUrl);

  document.title = `${article.title} - 唐人日报`;
  updateSeoMeta(article);

  root.classList.toggle("has-no-image", !hasCover);
  root.classList.remove("image-failed");

  root.innerHTML = `
    <a class="back-link" href="./index.html">返回首页</a>
    <header class="article-header">
      <span class="tag">${escapeHtml(article.category || "新闻")}</span>
      <h1>${escapeHtml(article.title || "")}</h1>
      <div class="story-meta">${escapeHtml([article.author, article.date, article.views].filter(Boolean).join(" · "))}</div>
    </header>
    ${hasCover ? `
      <img
        class="article-image"
        src="${escapeAttribute(coverUrl)}"
        loading="eager"
        decoding="async"
        fetchpriority="high"
        referrerpolicy="no-referrer"
        data-original="${escapeAttribute(coverOriginal)}"
        data-fallback="${escapeAttribute(coverFallback)}"
        alt="${escapeAttribute(article.title || "")}"
      />
    ` : ""}
    <div class="article-body">
      ${(article.body || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </div>
    <nav class="article-neighbors" aria-label="上一篇和下一篇">
      ${renderNeighbor(previous, "Previous", "上一篇")}
      ${renderNeighbor(next, "Next", "下一篇")}
    </nav>
    <section class="related-news">
      <h2>延伸阅读</h2>
      <div class="related-carousel" aria-label="延伸阅读文章">
        <div class="related-track">
          ${extensionItems.map(renderRelatedItem).join("")}
        </div>
      </div>
    </section>
  `;

  const cover = root.querySelector(".article-image");
  if (cover) {
    const advanceCoverFallback = () => {
      const stage = Number(cover.dataset.fallbackStage || 0);
      const original = cover.dataset.original || "";
      const fallback = cover.dataset.fallback || "";

      if (stage === 0 && original && original !== cover.currentSrc && original !== cover.src) {
        cover.dataset.fallbackStage = "1";
        cover.src = original;
        return;
      }
      if (stage <= 1 && fallback && fallback !== cover.currentSrc && fallback !== cover.src) {
        cover.dataset.fallbackStage = "2";
        cover.src = fallback;
        cover.alt = `${article.category || "新闻"}默认封面`;
        return;
      }

      cover.dataset.imageFailed = "true";
      cover.removeAttribute("alt");
      cover.hidden = true;
      root.classList.add("image-failed");
    };

    cover.addEventListener("error", advanceCoverFallback);
    if (cover.complete && (!cover.naturalWidth || !cover.naturalHeight)) advanceCoverFallback();
  }
}

function updateSeoMeta(article) {
  const setMeta = (name, content) => {
    if (!content) return;
    let node = document.head.querySelector(`meta[name="${name}"]`);
    if (!node) { node = document.createElement("meta"); node.name = name; document.head.appendChild(node); }
    node.content = content;
  };
  const description = String(article.excerpt || (article.body || []).join(" ")).replace(/\s+/g, " ").trim().slice(0, 160);
  setMeta("description", description);
  setMeta("keywords", article.seoKeywords || [article.category, article.title].filter(Boolean).join(", "));
}

function renderNeighbor(article, label, title) {
  if (!article) {
    return `<span class="article-neighbor is-empty" aria-hidden="true"></span>`;
  }

  return `
    <a class="article-neighbor" href="./article.html?id=${encodeURIComponent(article.id)}">
      <span>${label}</span>
      <strong>${title}：${escapeHtml(article.title || "")}</strong>
    </a>
  `;
}

function renderRelatedItem(article) {
  const image = imageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === "function" ? window.TRRB_categoryPlaceholder(article.category || "") : "./image-placeholder.svg";
  return `
    <a class="related-item${image ? "" : " has-no-image"}" href="./article.html?id=${encodeURIComponent(article.id)}">
      ${image ? `<img src="${escapeAttribute(image)}" width="500" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallbackTried){this.dataset.fallbackTried='true';this.src='${escapeAttribute(fallback)}';}else{this.remove();}" alt="" />` : ""}
      <span>${escapeHtml(article.category || "新闻")}</span>
      <strong>${escapeHtml(article.title || "")}</strong>
    </a>
  `;
}

function originalUploadUrl(value) {
  let text = String(value || "").trim().replace(/\u0026/g, "&");
  text = text.replace(/[?&]v=[^&]+/g, "").replace(/[?&]$/, "");
  const match = text.match(/(?:^|\/)assets\/news-images\/(.+)$/i);
  if (match && match[1]) return `https://trrb.net/wp-content/uploads/${match[1]}`;
  return "";
}

function imageUrl(value, category) {
  let text = String(value || "").replaceAll("\u0026", "&").trim();
  if (!text || text.includes("image-placeholder.svg")) return "";

  if (/^(?:javascript|vbscript):/i.test(text)) return "";
  if (text.startsWith("//")) text = "https:" + text;
  if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, "https://");

  if (typeof window.TRRB_getImageUrl === "function") {
    const resolved = String(window.TRRB_getImageUrl(text, category) || "").trim();
    if (!resolved || resolved.includes("image-placeholder.svg")) return "";
    if (/^http:\/\//i.test(resolved)) return resolved.replace(/^http:\/\//i, "https://");
    return resolved;
  }

  if (text.startsWith("/assets/news-images/")) return "." + text;
  if (text.startsWith("assets/news-images/")) return "./" + text;

  return text.replace(
    /^https?:\/\/(?:www\.)?(?:new\.)?trrb\.net\/wp-content\/uploads\//i,
    "./assets/news-images/"
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

loadArticlePage();

const TRRB_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const TRRB_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

async function fetchLivePublishedArticles(limit = 100) {
  const select = [
    "id","title","slug","summary","content","category_name","cover_image",
    "author","status","published_at","created_at"
  ].join(",");
  const url = `${TRRB_SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      apikey: TRRB_SUPABASE_KEY,
      Authorization: `Bearer ${TRRB_SUPABASE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`Supabase articles ${response.status}`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map(mapLiveArticle);
}

async function fetchLiveArticleById(id) {
  const select = [
    "id","title","slug","summary","content","category_name","cover_image",
    "author","status","published_at","created_at"
  ].join(",");
  const url = `${TRRB_SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&id=eq.${encodeURIComponent(id)}&status=eq.published&limit=1`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      apikey: TRRB_SUPABASE_KEY,
      Authorization: `Bearer ${TRRB_SUPABASE_KEY}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`Supabase article ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? mapLiveArticle(rows[0]) : null;
}

function mapLiveArticle(row) {
  const published = row.published_at || row.created_at || "";
  const content = String(row.content || "").trim();
  return {
    id: row.id,
    title: row.title || "",
    category: row.category_name || "新闻",
    excerpt: row.summary || content.replace(/\s+/g, " ").slice(0, 120),
    image: row.cover_image || "",
    author: row.author || "Tang Ren Daily",
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
  let live = [];
  try { live = await fetchLivePublishedArticles(200); } catch (error) { console.warn("Live articles unavailable", error); }
  let archived = [];
  if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.length > 0) archived = window.TRRB_ARTICLE_INDEX;
  else if (Array.isArray(window.TRRB_ARTICLES) && window.TRRB_ARTICLES.length > 0) archived = window.TRRB_ARTICLES;
  else {
    const response = await fetch("./data/articles.json", { cache: "no-store" });
    if (response.ok) archived = await response.json();
  }
  const seen = new Set(live.map(item => String(item.id)));
  return live.concat((Array.isArray(archived) ? archived : []).filter(item => !seen.has(String(item.id))));
}

async function getFullArticle(indexArticle) {
  if (indexArticle.isLive || Array.isArray(indexArticle.body)) {
    return indexArticle;
  }

  const chunkNumber = Number(indexArticle.chunk || 0);
  await loadScript(`./articles-chunk-${chunkNumber}.js?v=28`);
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
  const currentIndex = articles.findIndex((item) => item.id === article.id);
  const previous = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;
  const related = articles
    .filter((item) => item.id !== article.id && item.category === article.category)
    .concat(articles.filter((item) => item.id !== article.id && item.category !== article.category))
    .slice(0, 12);
  const extensionItems = related.concat(related).slice(0, Math.max(related.length * 2, related.length));
  const image = imageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === 'function' ? window.TRRB_categoryPlaceholder(article.category || '') : './image-placeholder.svg';

  document.title = `${article.title} - 唐人日报`;

  root.innerHTML = `
    <a class="back-link" href="./index.html">返回首页</a>
    <header class="article-header">
      <span class="tag">${escapeHtml(article.category || "新闻")}</span>
      <h1>${escapeHtml(article.title || "")}</h1>
      <div class="story-meta">${escapeHtml([article.author, article.date, article.views].filter(Boolean).join(" · "))}</div>
    </header>
    <img class="article-image" src="${escapeAttribute(image)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'" alt="${escapeAttribute(article.title || "")}" />
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
  const fallback = typeof window.TRRB_categoryPlaceholder === 'function' ? window.TRRB_categoryPlaceholder(article.category || '') : './image-placeholder.svg';
  return `
    <a class="related-item" href="./article.html?id=${encodeURIComponent(article.id)}">
      <img src="${escapeAttribute(image)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'" alt="" />
      <span>${escapeHtml(article.category || "新闻")}</span>
      <strong>${escapeHtml(article.title || "")}</strong>
    </a>
  `;
}

function imageUrl(value, category) {
  if (typeof window.TRRB_getImageUrl === 'function') return window.TRRB_getImageUrl(value, category);
  const text = String(value || "").replaceAll("\u0026", "&");
  if (!text) return "./image-placeholder.svg";
  if (text.startsWith("/assets/news-images/")) return "." + text;
  if (text.startsWith("assets/news-images/")) return "./" + text;
  return text.replace(/^https?:\/\/(?:www\.)?trrb\.net\/wp-content\/uploads\//, "./assets/news-images/");
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

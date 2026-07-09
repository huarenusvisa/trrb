async function loadArticlePage() {
  const root = document.querySelector("#article-root");
  if (!root) return;

  try {
    const articles = await getArticleIndex();
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get("id") || articles[0]?.id;
    const indexArticle = articles.find((item) => item.id === articleId) || articles[0];

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
  if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.length > 0) {
    return window.TRRB_ARTICLE_INDEX;
  }

  if (Array.isArray(window.TRRB_ARTICLES) && window.TRRB_ARTICLES.length > 0) {
    return window.TRRB_ARTICLES;
  }

  const response = await fetch("./data/articles.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Cannot load articles");
  const articles = await response.json();
  if (!Array.isArray(articles) || articles.length === 0) throw new Error("Empty articles");
  return articles;
}

async function getFullArticle(indexArticle) {
  if (Array.isArray(indexArticle.body)) {
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

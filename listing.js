const pageSize = 24;

initListing();

function initListing() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category") || "";
  const query = params.get("q") || "";
  const page = Math.max(1, Number(params.get("page") || 1));
  const articles = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : [];

  const filtered = filterArticles(articles, category, query);
  renderHeader(category, query);
  renderArticles(filtered, page);
  renderPagination(filtered.length, page, category, query);
}

function filterArticles(articles, category, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return articles.filter((article) => {
    const categoryMatch = !category || article.category === category;
    const queryMatch =
      !normalizedQuery ||
      [article.title, article.excerpt, article.category, article.date]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    return categoryMatch && queryMatch;
  });
}

function renderHeader(category, query) {
  const title = document.querySelector("#listing-title");
  let heading = "2026文章归档";
  if (category) heading = category;
  if (query) heading = `搜索：${query}`;
  if (category && query) heading = `${category} · 搜索：${query}`;

  document.title = `${heading} - 唐人日报`;
  title.textContent = heading;
}

function renderArticles(articles, page) {
  const grid = document.querySelector("#listing-grid");
  const start = (page - 1) * pageSize;
  const items = articles.slice(start, start + pageSize);

  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-list">没有找到相关文章。</div>`;
    return;
  }

  grid.innerHTML = items.map(renderCard).join("");
}

function renderCard(article) {
  const image = imageUrl(article.image || "", article.category || "");
  const fallback = typeof window.TRRB_categoryPlaceholder === 'function' ? window.TRRB_categoryPlaceholder(article.category || '') : './image-placeholder.svg';
  return `
    <article class="archive-card">
      <a href="./article.html?id=${encodeURIComponent(article.id)}">
        <img src="${escapeAttribute(image)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttribute(fallback)}'" alt="" />
        <span>${escapeHtml(article.category || "新闻")}</span>
        <h2>${escapeHtml(article.title || "")}</h2>
        <p>${escapeHtml(article.excerpt || "")}</p>
        <time>${escapeHtml(article.time || article.date || "")}</time>
      </a>
    </article>
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

function renderPagination(total, currentPage, category, query) {
  const nav = document.querySelector("#pagination");
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) {
    nav.innerHTML = "";
    return;
  }

  const pages = paginationWindow(currentPage, totalPages);
  nav.innerHTML = `
    ${pageLink("上一页", Math.max(1, currentPage - 1), currentPage === 1, category, query)}
    ${pages.map((page) => pageLink(page, page, page === currentPage, category, query)).join("")}
    ${pageLink("下一页", Math.min(totalPages, currentPage + 1), currentPage === totalPages, category, query)}
  `;
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
  if (category) params.set("category", category);
  if (query) params.set("q", query);
  params.set("page", page);

  if (disabled) return `<span class="page-link is-disabled">${label}</span>`;
  return `<a class="page-link" href="./listing.html?${params.toString()}">${label}</a>`;
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

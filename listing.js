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
const pageSize = 24;

initListing();

async function initListing() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category") || "";
  const query = params.get("q") || "";
  const page = Math.max(1, Number(params.get("page") || 1));
  let live = [];
  try { live = await fetchLivePublishedArticles(200); } catch (error) { console.warn("Live articles unavailable", error); }
  const archived = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : [];
  const seen = new Set(live.map(item => String(item.id)));
  const articles = live.concat(archived.filter(item => !seen.has(String(item.id))));

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

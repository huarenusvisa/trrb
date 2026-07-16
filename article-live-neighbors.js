(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function imageUrl(value) {
    let url = String(value || "").trim();
    if (!url || url.includes("image-placeholder.svg") || /^(?:javascript|vbscript):/i.test(url)) return "";
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, "https://");
    return url;
  }

  function neighborHtml(article, label, title) {
    if (!article) return '<span class="article-neighbor is-empty" aria-hidden="true"></span>';
    return `<a class="article-neighbor" href="./article.html?id=${encodeURIComponent(article.id)}"><span>${label}</span><strong>${title}：${esc(article.title)}</strong></a>`;
  }

  function relatedHtml(article) {
    const image = imageUrl(article.cover_image);
    return `<a class="related-item${image ? "" : " has-no-image"}" href="./article.html?id=${encodeURIComponent(article.id)}">${image ? `<img src="${esc(image)}" width="500" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" alt="" />` : ""}<span>${esc(article.category_name || "新闻")}</span><strong>${esc(article.title || "")}</strong></a>`;
  }

  async function fetchPublished() {
    const fields = "id,title,category_name,cover_image,published_at,created_at";
    const url = `${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(fields)}&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=120`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`recommendations ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows.filter((row) => row?.id && row?.title) : [];
  }

  async function repair() {
    const id = new URLSearchParams(location.search).get("id") || "";
    if (!UUID_RE.test(id)) return;

    const root = document.querySelector("#article-root");
    const nav = root?.querySelector(".article-neighbors");
    const track = root?.querySelector(".related-track");
    if (!root || !nav || !track) return;

    const articles = await fetchPublished();
    const index = articles.findIndex((item) => String(item.id) === id);
    if (index < 0) return;

    const previous = index > 0 ? articles[index - 1] : null;
    const next = index < articles.length - 1 ? articles[index + 1] : null;
    nav.innerHTML = `${neighborHtml(previous, "PREVIOUS ONE", "上一篇")}${neighborHtml(next, "NEXT ARTICLE", "下一篇")}`;

    const current = articles[index];
    const related = articles
      .filter((item) => String(item.id) !== id && item.category_name === current.category_name)
      .concat(articles.filter((item) => String(item.id) !== id && item.category_name !== current.category_name))
      .slice(0, 12);

    track.innerHTML = related.concat(related).map(relatedHtml).join("");
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const ready = document.querySelector("#article-root .article-neighbors") && document.querySelector("#article-root .related-track");
    if (!ready && attempts < 40) return;
    clearInterval(timer);
    if (ready) repair().catch((error) => console.warn("Live article recommendations unavailable", error));
  }, 150);
})();

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

  function imageUrl(value, category) {
    let url = String(value || "").trim();
    if (!url || url.includes("image-placeholder.svg") || /^(?:javascript|vbscript):/i.test(url)) return "";
    if (url.startsWith("//")) url = `https:${url}`;
    if (/^http:\/\//i.test(url)) url = url.replace(/^http:\/\//i, "https://");
    if (typeof window.TRRB_getImageUrl === "function") {
      const resolved = String(window.TRRB_getImageUrl(url, category || "") || "").trim();
      if (resolved) return resolved;
    }
    return url;
  }

  function neighborHtml(article, label, title) {
    if (!article) return "";
    return `<a class="article-neighbor" href="./article.html?id=${encodeURIComponent(article.id)}"><span>${label}</span><strong>${title}：${esc(article.title)}</strong></a>`;
  }

  function relatedHtml(article) {
    const category = article.category_name || "新闻";
    const image = imageUrl(article.cover_image, category);
    const fallback = typeof window.TRRB_categoryPlaceholder === "function"
      ? window.TRRB_categoryPlaceholder(category)
      : "./image-placeholder.svg";
    return `<a class="related-item${image ? "" : " has-no-image"}" href="./article.html?id=${encodeURIComponent(article.id)}">${image ? `<img src="${esc(image)}" width="500" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback="${esc(fallback)}" onerror="if(!this.dataset.fallbackTried&&this.dataset.fallback){this.dataset.fallbackTried='1';this.src=this.dataset.fallback;}else{this.remove()}" alt="" />` : ""}<span>${esc(category)}</span><strong>${esc(article.title || "")}</strong></a>`;
  }

  async function api(path) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?${path}`, {
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

  async function fetchCurrent(id) {
    const fields = "id,title,category_name,cover_image,published_at,created_at";
    const rows = await api(`select=${encodeURIComponent(fields)}&id=eq.${encodeURIComponent(id)}&status=eq.published&limit=1`);
    return rows[0] || null;
  }

  async function fetchPublished(limit = 240) {
    const fields = "id,title,category_name,cover_image,published_at,created_at";
    return api(`select=${encodeURIComponent(fields)}&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`);
  }

  function timestamp(article) {
    const value = article?.published_at || article?.created_at || "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  async function repair() {
    const id = new URLSearchParams(location.search).get("id") || "";
    if (!UUID_RE.test(id)) return;

    const root = document.querySelector("#article-root");
    const nav = root?.querySelector(".article-neighbors");
    const relatedSection = root?.querySelector(".related-news");
    const track = root?.querySelector(".related-track");
    if (!root || !nav || !relatedSection || !track) return;

    const [current, latest] = await Promise.all([fetchCurrent(id), fetchPublished(240)]);
    if (!current) return;

    const merged = latest.some((item) => String(item.id) === id) ? latest.slice() : latest.concat(current);
    merged.sort((a, b) => timestamp(b) - timestamp(a));

    const index = merged.findIndex((item) => String(item.id) === id);
    const previous = index > 0 ? merged[index - 1] : null;
    const next = index >= 0 && index < merged.length - 1 ? merged[index + 1] : null;

    const neighborMarkup = `${neighborHtml(previous, "PREVIOUS", "上一篇")}${neighborHtml(next, "NEXT", "下一篇")}`;
    if (neighborMarkup) {
      nav.innerHTML = neighborMarkup;
      nav.hidden = false;
    } else {
      nav.innerHTML = "";
      nav.hidden = true;
    }

    const sameCategory = merged.filter((item) => String(item.id) !== id && item.category_name === current.category_name);
    const otherCategory = merged.filter((item) => String(item.id) !== id && item.category_name !== current.category_name);
    const related = sameCategory.concat(otherCategory).slice(0, 12);

    if (related.length) {
      track.innerHTML = related.map(relatedHtml).join("");
      relatedSection.hidden = false;
    } else {
      track.innerHTML = "";
      relatedSection.hidden = true;
    }
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const ready = document.querySelector("#article-root .article-neighbors") && document.querySelector("#article-root .related-track");
    if (!ready && attempts < 50) return;
    clearInterval(timer);
    if (ready) repair().catch((error) => console.warn("Live article recommendations unavailable", error));
  }, 120);
})();

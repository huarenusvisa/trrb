(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  function validImageUrl(value) {
    const text = String(value || "").trim();
    if (!text || /^(?:javascript|vbscript):/i.test(text)) return "";
    if (text.startsWith("//")) return `https:${text}`;
    return text.replace(/^http:\/\//i, "https://");
  }

  async function fetchCurrentCover(articleId) {
    const select = encodeURIComponent("id,cover_image,title,category_name");
    const url = `${SUPABASE_URL}/rest/v1/articles?select=${select}&id=eq.${encodeURIComponent(articleId)}&status=eq.published&limit=1&_=${Date.now()}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`cover lookup failed: ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  function mountCover(root, row) {
    const url = validImageUrl(row?.cover_image);
    if (!url) return;

    let image = root.querySelector(".article-image");
    const current = String(image?.getAttribute("src") || "");
    const isPlaceholder = !image || /placeholder|category-cover|default-cover/i.test(current) || image.hidden;

    if (!isPlaceholder && current === url) return;

    if (!image) {
      image = document.createElement("img");
      image.className = "article-image";
      image.loading = "eager";
      image.decoding = "async";
      image.fetchPriority = "high";
      image.referrerPolicy = "no-referrer";
      const body = root.querySelector(".article-body");
      if (body) body.before(image);
      else root.appendChild(image);
    }

    image.hidden = false;
    image.alt = row?.title || "新闻图片";
    image.dataset.liveCover = "true";
    image.src = url;
    root.classList.remove("has-no-image", "image-failed");
  }

  async function repairLiveCover() {
    const root = document.querySelector("#article-root");
    const articleId = new URLSearchParams(location.search).get("id");
    if (!root || !articleId) return;

    try {
      const row = await fetchCurrentCover(articleId);
      if (row?.cover_image) mountCover(root, row);
    } catch (error) {
      console.warn("TRRB live cover repair skipped", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(repairLiveCover, 0), { once: true });
  } else {
    setTimeout(repairLiveCover, 0);
  }

  const root = document.querySelector("#article-root");
  if (root) {
    const observer = new MutationObserver(() => repairLiveCover());
    observer.observe(root, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }
})();

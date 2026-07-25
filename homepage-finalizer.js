(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";
  const ICE_ALIASES = new Set(["ICE执法动态", "ICE执法追踪", "ICE新闻", "驱逐快报"]);
  const PLACEHOLDER_RE = /image-placeholder\.svg|category-placeholders|tang-ren-daily-placeholder|^data:image\/svg/i;

  function normalizeCategory(value) {
    const name = String(value || "").trim();
    return ICE_ALIASES.has(name) ? ICE_CATEGORY : name;
  }

  function usableImage(value) {
    const image = String(value || "").trim();
    return Boolean(image) && !PLACEHOLDER_RE.test(image);
  }

  function articleKey(item) {
    const id = String(item?.id || "").trim();
    if (id) return `id:${id}`;
    return `title:${String(item?.title || "").trim().toLowerCase()}`;
  }

  function normalizeArticle(item) {
    return { ...item, category: normalizeCategory(item?.category || item?.category_name) };
  }

  function mergeStable(live, archived) {
    const oldByKey = new Map((Array.isArray(archived) ? archived : []).map((item) => {
      const normalized = normalizeArticle(item);
      return [articleKey(normalized), normalized];
    }));
    const output = [];
    const seen = new Set();

    for (const raw of [...(Array.isArray(live) ? live : []), ...(Array.isArray(archived) ? archived : [])]) {
      const incoming = normalizeArticle(raw);
      const key = articleKey(incoming);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const old = oldByKey.get(key) || {};
      const merged = { ...old, ...incoming };
      if (!usableImage(incoming.image) && usableImage(old.image)) merged.image = old.image;
      if (!String(incoming.excerpt || "").trim() && String(old.excerpt || "").trim()) merged.excerpt = old.excerpt;
      output.push(merged);
    }
    return output;
  }

  function installImageRecovery(root = document) {
    root.querySelectorAll?.("img").forEach((img) => {
      if (!(img instanceof HTMLImageElement) || img.dataset.trrbRecoveryBound === "true") return;
      img.dataset.trrbRecoveryBound = "true";
      const original = img.getAttribute("src") || "";
      img.addEventListener("error", () => {
        if (img.dataset.trrbRetried !== "true" && original && !PLACEHOLDER_RE.test(original)) {
          img.dataset.trrbRetried = "true";
          const joiner = original.includes("?") ? "&" : "?";
          window.setTimeout(() => { img.src = `${original}${joiner}retry=${Date.now()}`; }, 350);
        }
      });
    });
  }

  async function finalize() {
    if (typeof window.renderHome !== "function") return;
    let archived = [];
    try { archived = typeof window.localArticleIndex === "function" ? window.localArticleIndex() : []; } catch {}

    let live = [];
    try {
      if (typeof window.fetchLivePublishedArticles === "function") live = await window.fetchLivePublishedArticles(120);
    } catch (error) {
      console.warn("Homepage final live fetch unavailable", error);
    }

    const articles = mergeStable(live, archived);
    if (articles.length) {
      window.renderHome(articles);
      document.documentElement.dataset.homeFinalized = "true";
    }
    installImageRecovery(document);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) installImageRecovery(node);
      });
    }
  });

  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(finalize, 80);
    window.setTimeout(finalize, 1400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
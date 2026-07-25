(() => {
  "use strict";

  const CACHE_KEY = "trrb-home-render-v1";
  const ids = ["ticker", "hero", "top-list", "sections-grid", "rank-list"];

  function readCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!cached || Date.now() - Number(cached.savedAt || 0) > 10 * 60 * 1000) return null;
      return cached.html && typeof cached.html === "object" ? cached.html : null;
    } catch {
      return null;
    }
  }

  function hasUsefulContent(node) {
    if (!node) return false;
    return Boolean(node.querySelector("a,article,img,li,.hero-slide,.ticker-track") || node.textContent.trim().length > 20);
  }

  function restore() {
    const cached = readCache();
    if (!cached) return;
    for (const id of ids) {
      const node = document.getElementById(id);
      if (!node || hasUsefulContent(node) || !cached[id]) continue;
      node.innerHTML = cached[id];
      node.dataset.restoredFromCache = "true";
    }
  }

  function save() {
    const html = {};
    let useful = 0;
    for (const id of ids) {
      const node = document.getElementById(id);
      if (!node || !hasUsefulContent(node)) continue;
      html[id] = node.innerHTML;
      useful += 1;
    }
    if (useful < 3) return;
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), html })); } catch {}
  }

  function recoverEmptyModules() {
    const empty = ids.some((id) => !hasUsefulContent(document.getElementById(id)));
    if (!empty) return;
    try {
      if (typeof window.renderHome === "function") {
        const archived = typeof window.localArticleIndex === "function" ? window.localArticleIndex() : [];
        if (Array.isArray(archived) && archived.length) window.renderHome(archived);
      }
    } catch (error) {
      console.warn("Homepage recovery skipped", error);
    }
    restore();
  }

  function start() {
    restore();
    const root = document.querySelector("main");
    if (root) {
      let timer = 0;
      new MutationObserver(() => {
        clearTimeout(timer);
        timer = window.setTimeout(save, 120);
      }).observe(root, { childList: true, subtree: true });
    }
    window.setTimeout(recoverEmptyModules, 1200);
    window.setTimeout(recoverEmptyModules, 3500);
    window.addEventListener("pagehide", save);
    window.addEventListener("load", () => window.setTimeout(save, 500), { once: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
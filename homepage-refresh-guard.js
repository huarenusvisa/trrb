(() => {
  "use strict";

  try { sessionStorage.removeItem("trrb-home-render-v1"); } catch {}

  const TARGET_IDS = new Set(["ticker", "hero", "top-list", "sections-grid", "rank-list"]);
  const STARTUP_LOCK_MS = 15000;
  const startedAt = performance.now();
  const firstComplete = new Set();

  function usefulHtml(value) {
    const text = String(value || "");
    return /<(?:a|article|img|li)\b|hero-slide|ticker-track|news-box/i.test(text) || text.replace(/<[^>]*>/g, "").trim().length > 40;
  }

  function installStartupRenderLock() {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (!descriptor?.get || !descriptor?.set || descriptor.set.__trrbWrapped) return;
    const nativeSet = descriptor.set;
    const wrappedSet = function (value) {
      const id = this instanceof HTMLElement ? this.id : "";
      if (TARGET_IDS.has(id)) {
        const incomingUseful = usefulHtml(value);
        const currentUseful = usefulHtml(descriptor.get.call(this));
        const locked = performance.now() - startedAt < STARTUP_LOCK_MS;
        if (incomingUseful && !firstComplete.has(id)) firstComplete.add(id);
        else if (locked && firstComplete.has(id) && currentUseful && incomingUseful) return;
      }
      return nativeSet.call(this, value);
    };
    wrappedSet.__trrbWrapped = true;
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set: wrappedSet
    });
  }

  function addSkeletonStyles() {
    if (document.getElementById("trrb-home-first-paint-style")) return;
    const style = document.createElement("style");
    style.id = "trrb-home-first-paint-style";
    style.textContent = `
      .trrb-skeleton{position:relative;overflow:hidden;background:#eef1f5}
      .trrb-skeleton::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.72),transparent);animation:trrbShimmer 1.15s infinite}
      .trrb-hero-skeleton{height:100%;min-height:426px;border-radius:8px;background:linear-gradient(135deg,#101828,#263247)}
      .trrb-list-skeleton{display:grid;gap:8px;height:426px}
      .trrb-list-skeleton i{display:block;min-height:74px;border-radius:5px;background:#eef1f5}
      .trrb-section-skeleton{height:330px;border-radius:8px}
      .trrb-rank-skeleton{height:220px;border-radius:8px}
      @keyframes trrbShimmer{100%{transform:translateX(100%)}}
      @media(max-width:767px){.trrb-hero-skeleton{min-height:240px}.trrb-list-skeleton{display:none}.trrb-section-skeleton{height:220px}}
    `;
    document.head.appendChild(style);
  }

  function installSkeletons() {
    addSkeletonStyles();
    const hero = document.getElementById("hero");
    const top = document.getElementById("top-list");
    const sections = document.getElementById("sections-grid");
    const rank = document.getElementById("rank-list");
    if (hero && !hero.children.length) hero.innerHTML = '<div class="trrb-skeleton trrb-hero-skeleton" aria-hidden="true"></div>';
    if (top && !top.children.length) top.innerHTML = '<div class="trrb-list-skeleton" aria-hidden="true"><i class="trrb-skeleton"></i><i class="trrb-skeleton"></i><i class="trrb-skeleton"></i><i class="trrb-skeleton"></i><i class="trrb-skeleton"></i></div>';
    if (sections && !sections.children.length) sections.innerHTML = '<div class="trrb-skeleton trrb-section-skeleton" aria-hidden="true"></div>';
    if (rank && !rank.children.length) rank.innerHTML = '<li class="trrb-skeleton trrb-rank-skeleton" aria-hidden="true"></li>';
  }

  installStartupRenderLock();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installSkeletons, { once: true });
  else installSkeletons();
})();
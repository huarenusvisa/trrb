(() => {
  "use strict";
  const placeholderPattern = /(category-placeholders|image-placeholder\.svg|tang-ren-daily-placeholder)/i;

  function escapeXml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
  }

  function palette(owner) {
    const text = `${owner?.textContent || ""}`;
    if (/特朗普|川普|Trump/i.test(text)) return ["#172033", "#7a1f26", "#d8b36a"];
    if (/ICE|移民执法|遣返|递解/i.test(text)) return ["#0f2d4a", "#245d83", "#9ac2dc"];
    if (/中国|北京|上海|官场/i.test(text)) return ["#3a1114", "#9a1d24", "#d7aa5f"];
    return ["#111827", "#374151", "#9ca3af"];
  }

  function fallbackSvg(owner) {
    const [a, b, c] = palette(owner);
    const label = owner?.querySelector(".tag, header h2")?.textContent?.trim() || "唐人日报";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="${escapeXml(label)}新闻封面"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r"><stop stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="990" cy="120" r="270" fill="url(#r)"/><circle cx="180" cy="580" r="230" fill="url(#r)"/><path d="M0 520 C260 430 420 610 690 505 S1030 390 1200 470 V675 H0Z" fill="#000" opacity=".18"/><path d="M0 560 C300 470 520 640 810 535 S1080 460 1200 510" fill="none" stroke="${c}" stroke-width="8" opacity=".35"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function applyFallback(img, owner) {
    owner.classList.remove("no-cover");
    owner.classList.add("generated-cover");
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.removeAttribute("onerror");
    img.dataset.trrbFallbackApplied = "true";
    img.dataset.trrbLoading = "false";
    img.src = fallbackSvg(owner);
  }

  function markImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const owner = img.closest(".hero-slide,.top-list article,.section-lead");
    if (!owner || img.dataset.trrbMediaBound === "true") return;
    img.dataset.trrbMediaBound = "true";
    const src = String(img.currentSrc || img.getAttribute("src") || "");
    if (!src || placeholderPattern.test(src)) {
      applyFallback(img, owner);
      return;
    }
    img.dataset.trrbLoading = img.complete ? "false" : "true";
    img.addEventListener("load", () => { img.dataset.trrbLoading = "false"; }, { once: true });
    img.addEventListener("error", () => applyFallback(img, owner), { once: true });
  }

  function scan(root = document) {
    root.querySelectorAll?.("#hero img,.top-list img,.section-lead img").forEach(markImage);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.("img")) markImage(node);
        scan(node);
      });
    }
  });

  function start() {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
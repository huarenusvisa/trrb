(() => {
  "use strict";
  const placeholderPattern = /(category-placeholders|image-placeholder\.svg|tang-ren-daily-placeholder)/i;

  function markImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    const owner = img.closest(".hero-slide,.top-list article,.section-lead");
    if (!owner) return;
    const src = String(img.currentSrc || img.getAttribute("src") || "");
    if (!src || placeholderPattern.test(src)) {
      owner.classList.add("no-cover");
      img.remove();
      return;
    }
    img.dataset.trrbLoading = img.complete ? "false" : "true";
    img.addEventListener("load", () => { img.dataset.trrbLoading = "false"; }, { once: true });
    img.addEventListener("error", () => { owner.classList.add("no-cover"); img.remove(); }, { once: true });
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

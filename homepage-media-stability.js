(() => {
  "use strict";

  const OWNER_SELECTOR = ".hero-slide,.top-list article,.section-lead";
  const placeholderPattern = /(category-placeholders|image-placeholder\.svg|tang-ren-daily-placeholder)/i;

  function escapeXml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
    }[char]));
  }

  function ownerText(owner) {
    return String(owner?.querySelector("h1,h2,h3")?.textContent || owner?.textContent || "").trim();
  }

  function palette(owner) {
    const text = ownerText(owner);
    if (/特朗普|川普|Trump/i.test(text)) return ["#14213d", "#7f1d1d", "#d6ad60"];
    if (/ICE|移民执法|遣返|递解|边境/i.test(text)) return ["#0b2942", "#205b7c", "#8ec5df"];
    if (/中国|北京|上海|官场/i.test(text)) return ["#351014", "#8f1d24", "#d8a85f"];
    if (/警察|警方|逮捕|法院|犯罪/i.test(text)) return ["#111827", "#334155", "#60a5fa"];
    return ["#111827", "#374151", "#9ca3af"];
  }

  function fallbackSvg(owner) {
    const [a, b, c] = palette(owner);
    const label = owner?.querySelector(".tag,header h2")?.textContent?.trim() || "唐人日报";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="${escapeXml(label)}新闻封面">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
        <radialGradient id="r"><stop stop-color="${c}" stop-opacity=".58"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <rect width="1200" height="675" fill="url(#g)"/>
      <circle cx="1000" cy="105" r="310" fill="url(#r)"/>
      <circle cx="145" cy="610" r="270" fill="url(#r)"/>
      <g opacity=".26" fill="none" stroke="${c}">
        <path d="M-40 500 C250 340 470 610 760 470 S1080 330 1260 430" stroke-width="12"/>
        <path d="M-80 565 C260 405 520 675 850 520 S1100 430 1280 500" stroke-width="5"/>
      </g>
      <g filter="url(#blur)" opacity=".22"><rect x="170" y="145" width="430" height="250" rx="36" fill="${c}"/><rect x="650" y="255" width="300" height="190" rx="34" fill="#fff"/></g>
      <rect y="520" width="1200" height="155" fill="#000" opacity=".2"/>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function createImage(owner) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = owner.matches(".hero-slide.is-active") ? "eager" : "lazy";
    img.width = owner.matches(".top-list article") ? 208 : 1200;
    img.height = owner.matches(".top-list article") ? 148 : 675;

    if (owner.matches(".top-list article")) {
      const badge = owner.querySelector("b");
      badge?.after(img);
    } else {
      owner.prepend(img);
    }
    return img;
  }

  function applyFallback(img, owner) {
    if (!img || !owner) return;
    owner.classList.remove("no-cover");
    owner.classList.add("generated-cover");
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.removeAttribute("onerror");
    img.dataset.trrbFallbackApplied = "true";
    img.dataset.trrbLoading = "false";
    img.src = fallbackSvg(owner);
  }

  function bindImage(img, owner) {
    if (!(img instanceof HTMLImageElement) || !owner) return;
    const current = String(img.getAttribute("src") || img.currentSrc || "");
    if (!current || placeholderPattern.test(current)) {
      applyFallback(img, owner);
      return;
    }
    if (img.dataset.trrbMediaBound === "true") return;
    img.dataset.trrbMediaBound = "true";
    img.dataset.trrbLoading = img.complete ? "false" : "true";
    img.addEventListener("load", () => {
      const loaded = String(img.currentSrc || img.getAttribute("src") || "");
      if (placeholderPattern.test(loaded)) applyFallback(img, owner);
      else img.dataset.trrbLoading = "false";
    });
    img.addEventListener("error", () => applyFallback(img, owner), { once: true });
  }

  function ensureOwner(owner) {
    if (!(owner instanceof HTMLElement)) return;
    let img = owner.querySelector(":scope > img");
    if (!img) img = createImage(owner);
    bindImage(img, owner);
  }

  function scan(root = document) {
    if (root instanceof HTMLElement && root.matches(OWNER_SELECTOR)) ensureOwner(root);
    root.querySelectorAll?.(OWNER_SELECTOR).forEach(ensureOwner);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    }
  });

  function start() {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    let checks = 0;
    const timer = window.setInterval(() => {
      scan();
      checks += 1;
      if (checks >= 12) window.clearInterval(timer);
    }, 750);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
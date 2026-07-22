(function () {
  "use strict";

  const CDN_PATH = "/.netlify/images";
  const WIDTHS = [240, 360, 480, 690, 960, 1200];
  const SKIP_SELECTOR = [
    ".brand img",
    ".reader-qr",
    ".topic-focus-icon",
    "img[src*='category-placeholders']",
    "img[src$='.svg']",
    "img[src^='data:']",
    "img[src^='blob:']"
  ].join(",");

  function normalizeSource(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (source.startsWith(CDN_PATH)) return "";
    if (/^(data:|blob:)/i.test(source)) return "";
    if (/^https?:\/\//i.test(source)) return source;
    try {
      const url = new URL(source, window.location.href);
      if (url.origin === window.location.origin) return url.pathname + url.search;
      return url.href;
    } catch {
      return source;
    }
  }

  function cdnUrl(source, width) {
    const params = new URLSearchParams({
      url: source,
      w: String(width),
      q: "72"
    });
    return `${CDN_PATH}?${params.toString()}`;
  }

  function imageProfile(img) {
    if (img.closest(".hero-card, #hero, .hero-slide")) {
      return { target: 690, sizes: "(max-width: 760px) 100vw, 690px", widths: [480, 690, 960, 1200] };
    }
    if (img.closest("#top-list, .top-list")) {
      return { target: 240, sizes: "208px", widths: [240, 360, 480] };
    }
    if (img.closest(".section-lead, .sections-grid")) {
      return { target: 520, sizes: "(max-width: 760px) 100vw, 512px", widths: [360, 480, 690, 960] };
    }
    const declared = Number(img.getAttribute("width") || 0);
    const target = declared > 0 ? Math.min(Math.max(declared, 240), 690) : 520;
    return {
      target,
      sizes: `(max-width: 760px) 100vw, ${target}px`,
      widths: WIDTHS.filter((width) => width <= Math.max(target * 2, 480))
    };
  }

  function fallbackFor(img) {
    const inline = String(img.getAttribute("onerror") || "");
    const match = inline.match(/this\.src=['\"]([^'\"]+)['\"]/i);
    if (match?.[1]) return match[1];
    const category = img.closest("article")?.querySelector(".tag, header h2")?.textContent?.trim() || "";
    if (typeof window.TRRB_categoryPlaceholder === "function") return window.TRRB_categoryPlaceholder(category);
    return "./assets/category-placeholders/generic.svg";
  }

  function restoreImage(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.trrbFallbackApplied === "true") return;
    img.dataset.trrbFallbackApplied = "true";
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.removeAttribute("onerror");

    const original = String(img.dataset.trrbOriginalSrc || "").trim();
    const current = String(img.currentSrc || img.src || "");
    if (original && !current.includes(original) && !original.startsWith(CDN_PATH)) {
      img.src = original;
      img.addEventListener("error", () => {
        img.removeAttribute("srcset");
        img.src = fallbackFor(img);
      }, { once: true });
      return;
    }
    img.src = fallbackFor(img);
  }

  function optimizeImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.matches(SKIP_SELECTOR) || img.closest(".brand")) return;

    const current = img.getAttribute("src") || "";
    const source = normalizeSource(img.dataset.trrbOriginalSrc || current);
    if (!source) return;

    if (!img.dataset.trrbOriginalSrc) img.dataset.trrbOriginalSrc = source;
    img.dataset.trrbFallbackApplied = "false";
    const profile = imageProfile(img);
    const widths = Array.from(new Set(profile.widths.concat(profile.target))).sort((a, b) => a - b);

    img.srcset = widths.map((width) => `${cdnUrl(source, width)} ${width}w`).join(", ");
    img.sizes = profile.sizes;
    img.src = cdnUrl(source, profile.target);
    img.decoding = "async";

    const isPrimaryHero = Boolean(img.closest(".hero-slide.is-active"));
    if (isPrimaryHero) {
      img.loading = "eager";
      img.fetchPriority = "high";
    } else {
      img.loading = "lazy";
      img.fetchPriority = "auto";
    }

    img.dataset.trrbImageOptimized = "true";
  }

  function optimizeTree(root) {
    if (root instanceof HTMLImageElement) optimizeImage(root);
    if (root && typeof root.querySelectorAll === "function") root.querySelectorAll("img").forEach(optimizeImage);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) optimizeTree(node);
      });
    }
  });

  function start() {
    document.addEventListener("error", (event) => {
      if (event.target instanceof HTMLImageElement && event.target.dataset.trrbImageOptimized === "true") restoreImage(event.target);
    }, true);
    optimizeTree(document);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
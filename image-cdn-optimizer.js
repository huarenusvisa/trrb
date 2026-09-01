(() => {
  "use strict";

  const PLACEHOLDERS = {
    "重要新闻": "/assets/category-placeholders/important.svg",
    "热门头条": "/assets/category-placeholders/hot.svg",
    "ICE执法动态": "/assets/category-placeholders/deport.svg",
    "美国时政": "/assets/category-placeholders/politics.svg",
    "美国警情": "/assets/category-placeholders/crime.svg",
    "中国官场": "/assets/category-placeholders/china.svg",
    "移民美国": "/assets/category-placeholders/immigration.svg",
    "庇护百科": "/assets/category-placeholders/asylum.svg",
    "深度专题": "/assets/category-placeholders/deep.svg",
    "新闻": "/assets/category-placeholders/generic.svg"
  };

  const BAD_MARKERS = /(?:^$|undefined|null|blob:|image-placeholder\.svg)/i;
  const PLACEHOLDER_MARKERS = /category-placeholders|default-cover|placeholder/i;

  function categoryFor(img) {
    const explicit = String(img.dataset.category || "").trim();
    if (explicit) return explicit;
    const articleTag = document.querySelector(".article-header .tag")?.textContent?.trim();
    if (img.closest(".article-page") && articleTag) return articleTag;
    const box = img.closest(".news-box,.listing-card,.related-item,article");
    const label = box?.querySelector(".tag,.category,header h2")?.textContent?.trim();
    return label || "新闻";
  }

  function fallbackFor(img) {
    const category = categoryFor(img);
    if (typeof window.TRRB_categoryPlaceholder === "function") {
      return window.TRRB_categoryPlaceholder(category);
    }
    return PLACEHOLDERS[category] || PLACEHOLDERS["新闻"];
  }

  function normalizeUrl(raw, category = "新闻") {
    let value = String(raw || "").replace(/\\u0026/g, "&").trim();
    if (BAD_MARKERS.test(value)) return PLACEHOLDERS[category] || PLACEHOLDERS["新闻"];
    if (/^(?:javascript|vbscript):/i.test(value)) return PLACEHOLDERS[category] || PLACEHOLDERS["新闻"];
    if (value.startsWith("//")) value = `https:${value}`;
    if (/^http:\/\//i.test(value)) value = value.replace(/^http:\/\//i, "https://");
    if (value.startsWith("assets/")) value = `/${value}`;
    if (value.startsWith("./assets/")) value = value.slice(1);
    return value;
  }

  function hideUnavailableImage(img) {
    if (img.dataset.trrbUnavailableHidden === "1") return;
    img.dataset.trrbUnavailableHidden = "1";
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.hidden = true;
    img.style.setProperty("display", "none", "important");

    const card = img.closest(".article-page,.archive-card,.listing-card,.news-box,.section-lead,.hero-slide,.top-list,.related-item,.trump-item,.topic-news-thumb,.article-card,article");
    if (card) card.classList.add("has-no-image", "no-image");

    const media = img.closest("picture,.article-image-wrap,.article-cover,.news-thumb,.card-image,.image-wrap,.topic-news-thumb");
    if (media && media !== card && media.children.length <= 1) media.hidden = true;
  }

  function classifyLoadedImage(img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    if (PLACEHOLDER_MARKERS.test(String(img.currentSrc || img.src))) {
      hideUnavailableImage(img);
      return;
    }
    const ratio = img.naturalWidth / img.naturalHeight;
    img.dataset.imageRatio = ratio.toFixed(3);
    img.classList.toggle("trrb-image-portrait", ratio < 0.82);
    img.classList.toggle("trrb-image-square", ratio >= 0.82 && ratio <= 1.18);
    img.classList.toggle("trrb-image-landscape", ratio > 1.18);
  }

  function useFallback(img) {
    if (img.dataset.trrbFallbackDone === "1") return;
    img.dataset.trrbFallbackDone = "1";
    hideUnavailableImage(img);
  }

  function bindImage(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.trrbImageBound === "1") return;
    img.dataset.trrbImageBound = "1";

    const normalized = normalizeUrl(img.getAttribute("src"), categoryFor(img));
    if (normalized && normalized !== img.getAttribute("src")) img.src = normalized;

    img.addEventListener("load", () => {
      if (PLACEHOLDER_MARKERS.test(String(img.currentSrc || img.src))) {
        hideUnavailableImage(img);
        return;
      }
      img.hidden = false;
      img.style.removeProperty("display");
      classifyLoadedImage(img);
    });
    img.addEventListener("error", () => useFallback(img));

    if (img.complete) {
      if (img.naturalWidth > 0) classifyLoadedImage(img);
      else useFallback(img);
    }
  }

  function scan(root = document) {
    root.querySelectorAll?.("img").forEach(bindImage);
  }

  function installStyles() {
    if (document.getElementById("trrb-global-image-system-style")) return;
    const style = document.createElement("style");
    style.id = "trrb-global-image-system-style";
    style.textContent = `
      img{background:#eef1f4}
      .article-page .article-image{width:min(100%,880px)!important;max-width:880px!important;height:auto!important;max-height:none!important;aspect-ratio:auto!important;object-fit:contain!important;object-position:center top!important;background:#eef1f4!important}
      .article-page .article-image.trrb-image-landscape{max-height:680px!important}
      .article-page .article-image.trrb-image-portrait{max-height:820px!important;width:auto!important;max-width:100%!important}
      .listing-card img,.news-box img,.section-lead img,.hero-slide img,.top-list img,.related-item img{display:block;width:100%;height:100%;object-fit:cover;object-position:center top}
      .listing-card img.trrb-image-portrait,.news-box img.trrb-image-portrait,.section-lead img.trrb-image-portrait{object-fit:contain;background:#eef1f4}
      .trrb-image-placeholder{object-fit:cover!important;object-position:center!important}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  window.TRRB_normalizeImageUrl = normalizeUrl;
  window.TRRB_bindImage = bindImage;
  window.TRRB_scanImages = scan;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(), { once: true });
  } else {
    scan();
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLImageElement) bindImage(node);
        scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

(() => {
  "use strict";

  const root = document.querySelector("#article-root");
  if (!root) return;

  const categoryFromPage = () => root.querySelector(".article-header .tag")?.textContent?.trim() || "新闻";
  const fallbackFor = (category) => {
    if (typeof window.TRRB_categoryPlaceholder === "function") {
      return window.TRRB_categoryPlaceholder(category || "新闻");
    }
    return "./image-placeholder.svg";
  };

  const normalize = (img) => {
    if (!img || img.dataset.integrityBound === "true") return;
    img.dataset.integrityBound = "true";

    const markPlaceholder = () => {
      const src = String(img.currentSrc || img.src || "");
      const isPlaceholder = /placeholder|category-cover|default-cover/i.test(src);
      img.dataset.placeholder = isPlaceholder ? "true" : "false";
    };

    img.addEventListener("load", markPlaceholder);
    img.addEventListener("error", () => {
      const fallback = fallbackFor(categoryFromPage());
      if (!img.dataset.integrityFallbackTried && fallback) {
        img.dataset.integrityFallbackTried = "true";
        img.dataset.placeholder = "true";
        img.hidden = false;
        img.src = fallback;
        return;
      }
      img.hidden = true;
    });

    markPlaceholder();
  };

  const ensureImage = () => {
    const header = root.querySelector(".article-header");
    const body = root.querySelector(".article-body");
    if (!header || !body) return;

    let img = root.querySelector(".article-image");
    if (!img) {
      img = document.createElement("img");
      img.className = "article-image";
      img.alt = `${categoryFromPage()}默认封面`;
      img.loading = "eager";
      img.decoding = "async";
      img.dataset.placeholder = "true";
      img.src = fallbackFor(categoryFromPage());
      body.before(img);
    }
    normalize(img);
  };

  ensureImage();
  const observer = new MutationObserver(ensureImage);
  observer.observe(root, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
})();

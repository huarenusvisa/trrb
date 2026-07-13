(function enhanceArticlePageV31() {
  const root = document.querySelector("#article-root");
  if (!root) return;

  const enforcementPattern = /\bICE\b|移民与海关执法局|移民执法|遣返|驱逐|递解|自愿离境|非法移民|逮捕.{0,8}移民|拘捕.{0,8}移民/i;

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function inferCategory(article) {
    if (typeof window.TRRB_inferArticleCategory === "function") {
      return window.TRRB_inferArticleCategory(article);
    }

    const raw = String(article?.category || "新闻").trim() || "新闻";
    const text = `${article?.title || ""} ${article?.excerpt || ""}`;
    if ((raw === "移民美国" || raw === "新闻" || raw === "ICE执法") && enforcementPattern.test(text)) {
      return "驱逐快报";
    }
    return raw;
  }

  function resolveImage(value, category) {
    let text = String(value || "").replaceAll("\\u0026", "&").trim();
    if (!text || text.includes("image-placeholder.svg") || /^(?:javascript|vbscript):/i.test(text)) return "";
    if (text.startsWith("//")) text = "https:" + text;
    if (/^http:\/\//i.test(text)) text = text.replace(/^http:\/\//i, "https://");

    if (typeof window.TRRB_getImageUrl === "function") {
      const resolved = String(window.TRRB_getImageUrl(text, category) || "").trim();
      if (resolved && !resolved.includes("image-placeholder.svg")) return resolved;
    }

    if (text.startsWith("/assets/")) return "." + text;
    if (text.startsWith("assets/")) return "./" + text;
    return text;
  }

  function normalizeNeighbors() {
    const container = root.querySelector(".article-neighbors");
    if (!container) return;

    Array.from(container.children).forEach((item, index) => {
      if (!(item instanceof HTMLElement) || item.classList.contains("is-empty")) return;
      const label = item.querySelector("span");
      if (label) label.textContent = index === 0 ? "上一篇" : "下一篇";
    });
  }

  function ensureRichArticleIndex() {
    if (Array.isArray(window.TRRB_ARTICLE_INDEX) && window.TRRB_ARTICLE_INDEX.some((item) => item?.title)) {
      return Promise.resolve(window.TRRB_ARTICLE_INDEX);
    }

    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-trrb-rich-index="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.TRRB_ARTICLE_INDEX || []), { once: true });
        existing.addEventListener("error", () => resolve([]), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "./articles-home-index.js?v=31.3";
      script.async = true;
      script.dataset.trrbRichIndex = "true";
      script.addEventListener("load", () => resolve(window.TRRB_ARTICLE_INDEX || []), { once: true });
      script.addEventListener("error", () => resolve([]), { once: true });
      document.head.appendChild(script);
    });
  }

  function renderRelatedItem(article) {
    const category = inferCategory(article);
    const image = resolveImage(article.image || "", category);
    const fallback = typeof window.TRRB_categoryPlaceholder === "function"
      ? window.TRRB_categoryPlaceholder(category)
      : "./image-placeholder.svg";

    return `
      <a class="related-item${image ? "" : " has-no-image"}" href="./article.html?id=${encodeURIComponent(article.id)}" role="listitem">
        ${image ? `<img src="${escapeAttribute(image)}" width="500" height="281" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(!this.dataset.fallbackTried){this.dataset.fallbackTried='true';this.src='${escapeAttribute(fallback)}';}else{this.remove();}" alt="" />` : ""}
        <span>${escapeHtml(category)}</span>
        <strong>${escapeHtml(article.title || "")}</strong>
      </a>
    `;
  }

  async function rebuildRelatedReading() {
    const section = root.querySelector(".related-news");
    const track = section?.querySelector(".related-track");
    if (!section || !track) return;

    const currentId = new URLSearchParams(window.location.search).get("id") || "";
    const currentTitle = root.querySelector(".article-header h1")?.textContent?.trim() || "";
    const tag = root.querySelector(".article-header .tag");
    const currentCategory = inferCategory({ category: tag?.textContent || "新闻", title: currentTitle });
    if (tag) tag.textContent = currentCategory;

    const richIndex = await ensureRichArticleIndex();
    const seen = new Set();
    const candidates = (Array.isArray(richIndex) ? richIndex : [])
      .filter((item) => item && item.title && String(item.id) !== String(currentId))
      .map((item) => ({ ...item, category: inferCategory(item) }))
      .sort((a, b) => Number(b.category === currentCategory) - Number(a.category === currentCategory))
      .filter((item) => {
        const key = String(item.id || item.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);

    if (!candidates.length) {
      const existingItems = Array.from(track.querySelectorAll(".related-item"));
      existingItems.forEach((item) => {
        const title = item.querySelector("strong")?.textContent?.trim() || "";
        if (!title) item.remove();
      });
      if (!track.querySelector(".related-item")) section.hidden = true;
      return;
    }

    track.setAttribute("role", "list");
    track.innerHTML = candidates.map(renderRelatedItem).join("");
    section.hidden = false;
    section.dataset.relatedCount = String(candidates.length);
  }

  function createEngagementPanel() {
    if (root.querySelector(".article-engagement")) return;

    const panel = document.createElement("section");
    panel.className = "article-engagement";
    panel.setAttribute("aria-labelledby", "article-engagement-title");
    panel.innerHTML = `
      <header class="article-engagement-header">
        <h2 id="article-engagement-title">参与唐人日报</h2>
        <p>加入读者群、提交线索或曝光经历，所有公开内容均经过人工审核。</p>
      </header>
      <div class="article-engagement-grid">
        <a class="article-engagement-card is-primary" href="./index.html#community">
          <strong>加入读者群</strong>
          <span>获取突发新闻与移民政策更新</span>
        </a>
        <a class="article-engagement-card" href="./expose.html">
          <strong>曝光墙</strong>
          <span>提交真实经历和相关证据</span>
        </a>
        <a class="article-engagement-card" href="./index.html#submit">
          <strong>投稿爆料</strong>
          <span>提交新闻线索、图片或视频</span>
        </a>
        <a class="article-engagement-card" href="./index.html#daily">
          <strong>订阅每日快报</strong>
          <span>每日精选新闻直达邮箱</span>
        </a>
      </div>
    `;

    const related = root.querySelector(".related-news");
    if (related) related.insertAdjacentElement("afterend", panel);
    else root.appendChild(panel);
  }

  function enhance() {
    if (!root.querySelector(".article-header")) return false;
    if (root.dataset.v31Enhanced === "running" || root.dataset.v31Enhanced === "true") return true;

    root.dataset.v31Enhanced = "running";
    normalizeNeighbors();
    createEngagementPanel();
    rebuildRelatedReading()
      .catch((error) => console.warn("TRRB related reading rebuild failed", error))
      .finally(() => { root.dataset.v31Enhanced = "true"; });
    return true;
  }

  if (enhance()) return;

  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });

  observer.observe(root, { childList: true, subtree: true });
})();

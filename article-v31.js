(function enhanceArticlePageV31() {
  const root = document.querySelector("#article-root");
  if (!root) return;

  function normalizeNeighbors() {
    const container = root.querySelector(".article-neighbors");
    if (!container) return;

    Array.from(container.children).forEach((item, index) => {
      if (!(item instanceof HTMLElement) || item.classList.contains("is-empty")) return;
      const label = item.querySelector("span");
      if (label) label.textContent = index === 0 ? "上一篇" : "下一篇";
    });
  }

  function normalizeRelatedReading() {
    const section = root.querySelector(".related-news");
    const track = section?.querySelector(".related-track");
    if (!section || !track) return;

    const seen = new Set();
    let kept = 0;

    Array.from(track.querySelectorAll(".related-item")).forEach((item) => {
      const href = item.getAttribute("href") || "";
      const title = item.querySelector("strong")?.textContent?.trim() || "";
      const key = href || title;

      if (!key || seen.has(key) || kept >= 6) {
        item.remove();
        return;
      }

      seen.add(key);
      kept += 1;
      item.setAttribute("role", "listitem");
    });

    if (!kept) {
      section.hidden = true;
      return;
    }

    track.setAttribute("role", "list");
    section.dataset.relatedCount = String(kept);
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
          <span>提交被骗经历和相关证据</span>
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
    if (root.dataset.v31Enhanced === "true") return true;

    normalizeNeighbors();
    normalizeRelatedReading();
    createEngagementPanel();

    root.dataset.v31Enhanced = "true";
    return true;
  }

  if (enhance()) return;

  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });

  observer.observe(root, { childList: true, subtree: true });
})();

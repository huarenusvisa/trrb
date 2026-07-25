(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";

  function install() {
    if (typeof window.renderCategorySection !== "function" || typeof window.renderSections !== "function") return false;

    if (window.categoryIds) {
      delete window.categoryIds["驱逐快报"];
      window.categoryIds[ICE_CATEGORY] = "ice";
    }

    const baseRenderCategorySection = window.renderCategorySection;
    window.renderCategorySection = function unifiedCategorySection(category, articles) {
      let html = baseRenderCategorySection(category, articles);
      if (category === ICE_CATEGORY) {
        html = html.replace(
          `./listing.html?category=${encodeURIComponent(ICE_CATEGORY)}`,
          "/ice"
        );
      }
      return html;
    };

    window.renderSections = function unifiedSections(articles) {
      const categories = ["美国时政", "美国警情", "中国官场", "移民美国", "庇护百科", ICE_CATEGORY];
      const sections = categories.map((category) => window.renderCategorySection(category, articles));
      if (typeof window.renderExposureWallCard === "function") sections.push(window.renderExposureWallCard());
      const root = document.querySelector("#sections-grid");
      if (root) root.innerHTML = sections.join("");
    };

    refreshIceHome();
    return true;
  }

  async function refreshIceHome() {
    let archived = [];
    try { archived = typeof window.localArticleIndex === "function" ? window.localArticleIndex() : []; } catch {}
    let articles = archived;
    try {
      if (typeof window.fetchLivePublishedArticles === "function") {
        const live = await window.fetchLivePublishedArticles(120);
        articles = typeof window.mergeArticles === "function" ? window.mergeArticles(live, archived) : live;
      }
    } catch (error) {
      console.warn("ICE homepage synchronization unavailable", error);
    }
    if (articles.length && typeof window.renderSections === "function") window.renderSections(articles);
  }

  if (!install()) {
    window.addEventListener("load", () => install(), { once: true });
  }
})();

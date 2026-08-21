(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";
  const ICE_ALIASES = new Set(["ICE执法动态", "ICE执法追踪", "ICE新闻", "驱逐快报"]);

  function normalizeCategory(value) {
    const name = String(value || "").trim();
    return ICE_ALIASES.has(name) ? ICE_CATEGORY : name;
  }

  function isIceArticle(item) {
    const topic = String(item?.topicKey || item?.topic_key || "").trim().toLowerCase();
    const primary = String(item?.category || item?.category_name || "").trim();
    return topic === "ice" || ICE_ALIASES.has(primary);
  }

  function install() {
    if (typeof window.renderCategorySection !== "function" || typeof window.renderSections !== "function") return false;

    if (window.categoryIds) {
      delete window.categoryIds["驱逐快报"];
      window.categoryIds[ICE_CATEGORY] = "ice";
    }

    const baseRenderCategorySection = window.renderCategorySection;
    const baseRenderSections = window.renderSections;

    window.renderCategorySection = function unifiedCategorySection(category, articles) {
      const normalizedArticles = (Array.isArray(articles) ? articles : []).map((item) => {
        const primaryCategory = normalizeCategory(item?.category || item?.category_name);

        // ICE is secondary topic membership. Only the ICE card receives an ICE
        // category projection; primary-category cards keep their original placement.
        if (category === ICE_CATEGORY && isIceArticle(item)) {
          return { ...item, category: ICE_CATEGORY, primary_category: primaryCategory };
        }

        return { ...item, category: primaryCategory };
      });

      let html = baseRenderCategorySection(category, normalizedArticles);
      if (category === ICE_CATEGORY) {
        html = html.replace(
          `./listing.html?category=${encodeURIComponent(ICE_CATEGORY)}`,
          "/ice"
        );
      }
      return html;
    };

    window.renderSections = function unifiedSections(articles) {
      const source = Array.isArray(articles) ? articles : [];

      // Preserve the complete homepage section set owned by articles-home.js.
      baseRenderSections(source);

      const root = document.querySelector("#sections-grid");
      if (!root) return;

      const iceHtml = window.renderCategorySection(ICE_CATEGORY, source);
      const existing = root.querySelector("#ice");
      if (existing) existing.outerHTML = iceHtml;
      else root.insertAdjacentHTML("beforeend", iceHtml);

      // Homepage order is intentionally shared by desktop and mobile:
      // 美国时政 first, ICE执法动态 second.
      const politics = root.querySelector("#politics");
      const ice = root.querySelector("#ice");
      if (politics && ice && politics.nextElementSibling !== ice) {
        politics.insertAdjacentElement("afterend", ice);
      }
    };

    return true;
  }

  if (!install()) window.addEventListener("load", install, { once: true });
})();

(() => {
  "use strict";

  const ICE_CATEGORY = "ICE执法动态";
  const ICE_ALIASES = new Set(["ICE执法动态", "ICE执法追踪", "ICE新闻", "驱逐快报"]);

  function normalizeCategory(value) {
    const name = String(value || "").trim();
    return ICE_ALIASES.has(name) ? ICE_CATEGORY : name;
  }

  function install() {
    if (typeof window.renderCategorySection !== "function") return false;

    if (window.categoryIds) {
      delete window.categoryIds["驱逐快报"];
      window.categoryIds[ICE_CATEGORY] = "ice";
    }

    const baseRenderCategorySection = window.renderCategorySection;
    window.renderCategorySection = function unifiedCategorySection(category, articles) {
      const normalizedArticles = (Array.isArray(articles) ? articles : []).map((item) => ({
        ...item,
        category: normalizeCategory(item?.category || item?.category_name)
      }));
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
      const normalizedArticles = (Array.isArray(articles) ? articles : []).map((item) => ({
        ...item,
        category: normalizeCategory(item?.category || item?.category_name)
      }));
      const categories = ["重要新闻", "热门头条", ICE_CATEGORY];
      const sections = categories.map((category) => window.renderCategorySection(category, normalizedArticles));
      const root = document.querySelector("#sections-grid");
      if (root) root.innerHTML = sections.join("");
    };

    return true;
  }

  if (!install()) window.addEventListener("load", install, { once: true });
})();
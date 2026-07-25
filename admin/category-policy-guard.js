(() => {
  "use strict";
  const RETIRED = new Set(["trump", "deport"]);

  async function enforceRetiredCategories() {
    if (!window.supabaseClient) return;
    for (const slug of RETIRED) {
      const result = await window.supabaseClient.from("categories").update({
        is_active: false,
        show_in_navigation: false,
        show_on_homepage: false,
        auto_fetch: false,
        ai_rewrite: false,
        auto_publish: false,
        include_in_sitemap: false,
        include_in_google_news: false,
        include_in_rss: false,
        push_x: false,
        push_telegram: false
      }).eq("slug", slug);
      if (result.error) console.warn(`Retired category /${slug} policy failed`, result.error.message);
    }
    window.TRRBCategoryManager?.load?.();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const standard = document.getElementById("apply-standard-categories");
    standard?.addEventListener("click", () => window.setTimeout(enforceRetiredCategories, 1800));
    document.querySelectorAll('.nav-btn[data-page="categories"]').forEach((button) => {
      button.addEventListener("click", () => window.setTimeout(enforceRetiredCategories, 500));
    });
  });
})();

(() => {
  "use strict";

  // Compatibility shim only. The live homepage hero is owned by
  // articles-home-live-fix.js, with homepage-startup-stability.js as the
  // final safety guard. Do not wrap window.renderHome here: multiple wrappers
  // were racing and could replace valid live news with stale/empty UI.
  function renderFocusHero() {
    if (typeof window.TRRB_refreshHomepageFocus === "function") {
      return window.TRRB_refreshHomepageFocus(true);
    }
    return false;
  }

  window.TRRB_isHomepageFocusArticle = (article) => Boolean(article?.id && article?.title);
  window.TRRB_renderFocusHero = renderFocusHero;
  window.TRRB_HOME_FOCUS_COMPAT_SHIM = true;
})();

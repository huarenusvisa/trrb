(() => {
  "use strict";

  const html = document.documentElement;
  let finalized = false;
  let recoveryAttempted = false;

  function heroReady() {
    const hero = document.querySelector("#hero");
    if (!hero) return false;
    if (hero.querySelector(".hero-slide")) return true;
    return Boolean(String(hero.textContent || "").trim());
  }

  function rankReady() {
    const rank = document.querySelector("#rank-list");
    if (!rank) return false;
    return rank.querySelectorAll("li").length > 0 || Boolean(String(rank.textContent || "").trim());
  }

  function sectionsReady() {
    const root = document.querySelector("#sections-grid");
    return Boolean(root?.children?.length);
  }

  function repairLegacyEmptyHeroOnce() {
    if (recoveryAttempted) return false;
    const hero = document.querySelector("#hero");
    if (!hero || !hero.querySelector(".hero-focus-empty")) return false;

    const source = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    if (!source.length || typeof window.renderHeroCarousel !== "function") return false;

    const visual = source.filter((item) => {
      if (typeof window.hasRealImage === "function") return window.hasRealImage(item);
      return Boolean(String(item?.image || item?.cover_image || "").trim());
    });
    const candidates = (visual.length ? visual : source).slice(0, 5);
    if (!candidates.length) return false;

    recoveryAttempted = true;
    window.renderHeroCarousel(candidates);
    hero.dataset.recommendationMode = "general-home-recovery";
    hero.dataset.recommendationCount = String(candidates.length);
    hero.dataset.focusOnly = "false";
    hero.dataset.focusCount = "0";
    return true;
  }

  function finalize(force = false) {
    if (finalized) return;
    if (!force && !(heroReady() && rankReady() && sectionsReady())) return;
    finalized = true;
    html.dataset.homeFinalUi = "true";
    html.dataset.homeFinalUiAt = new Date().toISOString();
  }

  function check() {
    finalize(false);
    return finalized;
  }

  function start() {
    // This guard is intentionally passive. CSS owns section order; normal data
    // rendering is owned by articles-home.js. Do not mutate the DOM in response
    // to every mutation or run repeated repair loops.
    [120, 320, 700, 1100].forEach((delay) => {
      window.setTimeout(() => {
        if (!finalized) check();
      }, delay);
    });

    window.setTimeout(() => {
      if (!heroReady()) repairLegacyEmptyHeroOnce();
      finalize(false);
    }, 1350);

    // Never leave the page masked behind a skeleton just because one secondary
    // feed is slow. Reveal once, without reordering or rebuilding modules.
    window.setTimeout(() => finalize(true), 1700);

    window.addEventListener("pageshow", () => finalize(true));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();

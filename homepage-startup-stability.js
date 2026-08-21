(() => {
  "use strict";

  const html = document.documentElement;
  let queued = false;
  let finalized = false;
  let repairingHero = false;

  function enforceSectionOrder() {
    const grid = document.querySelector("#sections-grid");
    if (!grid) return;
    const politics = grid.querySelector("#politics");
    const ice = grid.querySelector("#ice");
    if (politics && ice && politics.nextElementSibling !== ice) politics.insertAdjacentElement("afterend", ice);
  }

  function repairLegacyEmptyHero() {
    if (repairingHero) return false;
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

    repairingHero = true;
    try {
      window.renderHeroCarousel(candidates);
      hero.dataset.recommendationMode = "general-home-fallback";
      hero.dataset.recommendationCount = String(candidates.length);
      hero.dataset.focusOnly = "false";
      hero.dataset.focusCount = "0";
      return true;
    } finally {
      repairingHero = false;
    }
  }

  function heroReady() {
    repairLegacyEmptyHero();
    const hero = document.querySelector("#hero");
    if (!hero) return false;
    if (hero.querySelector(".hero-slide.is-active,.hero-slide")) return true;
    if (hero.querySelector(".hero-focus-empty")) return false;
    if (hero.dataset.recommendationMode && hero.dataset.recommendationCount !== "0") return true;
    return Boolean(String(hero.textContent || "").trim());
  }

  function rankReady() {
    const rank = document.querySelector("#rank-list");
    if (!rank) return false;
    return rank.querySelectorAll("li").length > 0;
  }

  function finalize(force = false) {
    enforceSectionOrder();
    repairLegacyEmptyHero();
    if (finalized) return;
    if (!force && !(heroReady() && rankReady())) return;
    finalized = true;
    html.dataset.homeFinalUi = "true";
    html.dataset.homeFinalUiAt = new Date().toISOString();
  }

  function queueCheck() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enforceSectionOrder();
      repairLegacyEmptyHero();
      finalize(false);
    });
  }

  function start() {
    enforceSectionOrder();
    repairLegacyEmptyHero();
    const observer = new MutationObserver(queueCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    [80, 180, 350, 650, 1000, 1400, 2200, 3500].forEach((delay) => {
      window.setTimeout(() => {
        enforceSectionOrder();
        repairLegacyEmptyHero();
        finalize(false);
      }, delay);
    });

    // Never leave mobile or desktop masked behind a skeleton if one secondary feed is slow.
    window.setTimeout(() => {
      repairLegacyEmptyHero();
      finalize(true);
    }, 1800);

    window.addEventListener("pageshow", () => {
      enforceSectionOrder();
      repairLegacyEmptyHero();
      if (!finalized) finalize(heroReady() || rankReady());
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
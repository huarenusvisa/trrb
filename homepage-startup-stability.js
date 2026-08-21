(() => {
  "use strict";

  const html = document.documentElement;
  let queued = false;
  let finalized = false;

  function enforceSectionOrder() {
    const grid = document.querySelector("#sections-grid");
    if (!grid) return;
    const politics = grid.querySelector("#politics");
    const ice = grid.querySelector("#ice");
    if (politics && ice && politics.nextElementSibling !== ice) politics.insertAdjacentElement("afterend", ice);
  }

  function heroReady() {
    const hero = document.querySelector("#hero");
    if (!hero) return false;
    if (hero.querySelector(".hero-slide.is-active,.hero-slide,.hero-focus-empty")) return true;
    if (hero.dataset.recommendationMode) return true;
    return Boolean(String(hero.textContent || "").trim());
  }

  function rankReady() {
    const rank = document.querySelector("#rank-list");
    if (!rank) return false;
    return rank.querySelectorAll("li").length > 0;
  }

  function finalize(force = false) {
    enforceSectionOrder();
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
      finalize(false);
    });
  }

  function start() {
    enforceSectionOrder();
    const observer = new MutationObserver(queueCheck);
    observer.observe(document.body, { childList: true, subtree: true });

    [80, 180, 350, 650, 1000, 1400].forEach((delay) => {
      window.setTimeout(() => {
        enforceSectionOrder();
        finalize(false);
      }, delay);
    });

    // Never leave mobile or desktop masked behind a skeleton if one secondary feed is slow.
    window.setTimeout(() => finalize(true), 1800);

    window.addEventListener("pageshow", () => {
      enforceSectionOrder();
      if (!finalized) finalize(heroReady() || rankReady());
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
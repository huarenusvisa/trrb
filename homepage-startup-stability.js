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
    if (hero.dataset.recommendationMode === "longform-politics-only") return true;
    const tag = hero.querySelector(".hero-overlay .tag");
    return Boolean(tag && String(tag.textContent || "").trim() === "今日要闻");
  }

  function rankReady() {
    const rank = document.querySelector("#rank-list");
    if (!rank) return false;
    const rows = rank.querySelectorAll("li");
    return rows.length > 0 && !rank.querySelector(".rank-empty");
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

    [80, 180, 350, 650, 1000, 1600, 2400].forEach((delay) => {
      window.setTimeout(() => {
        enforceSectionOrder();
        finalize(false);
      }, delay);
    });

    // Never keep the page masked indefinitely if one of the live endpoints fails.
    window.setTimeout(() => finalize(true), 3600);

    window.addEventListener("pageshow", () => {
      enforceSectionOrder();
      if (!finalized) finalize(false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();

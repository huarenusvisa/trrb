(function () {
  const immigrationPaths = [
    ["赴美留学", "/immigrate/?path=study"],
    ["赴美工作", "/immigrate/?path=work"],
    ["职业移民", "/immigrate/?path=employment"],
    ["家庭移民", "/immigrate/?path=family"],
    ["人道主义庇护", "/immigrate/?path=humanitarian"],
    ["境内身份转换", "/immigrate/?path=change-status"],
    ["入籍美国公民", "/immigrate/?path=citizenship"]
  ];

  const legalPaths = [
    ["最高法院", "/legal/?source=SCOTUS"],
    ["巡回法院", "/legal/?source=US_CIRCUIT"],
    ["BIA裁决", "/legal/?source=BIA"],
    ["行政命令", "/legal/?source=WHITE_HOUSE"],
    ["联邦新规", "/legal/?source=FEDERAL_REGISTER"]
  ];

  function immigrationMarkup() {
    return `
      <header class="immigration-hub-head">
        <h2>移民美国</h2>
        <a href="/immigrate/">进入知识库</a>
      </header>
      <a class="immigration-hub-feature" href="/immigrate/" aria-label="进入移民美国知识库">
        <strong>找到适合您的美国身份途径</strong>
      </a>
      <div class="immigration-hub-grid">
        ${immigrationPaths.map(([name, href], index) => `<a class="${index === immigrationPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all" href="/immigrate/">查看全部移民知识</a>`;
  }

  function legalMarkup() {
    return `
      <header class="immigration-hub-head legal-hub-head">
        <h2>美国判例与新规</h2>
        <a href="/legal/">进入数据库</a>
      </header>
      <a class="immigration-hub-feature legal-hub-feature" href="/legal/" aria-label="进入美国判例与新规数据库">
        <strong>追踪美国最新判例、裁决与政府新规</strong>
      </a>
      <div class="immigration-hub-grid legal-hub-grid">
        ${legalPaths.map(([name, href], index) => `<a class="${index === legalPaths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all legal-hub-all" href="/legal/">查看全部判例与新规</a>`;
  }

  function replaceImmigrationCard(root) {
    const card = root.querySelector("#immigration") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "移民美国");
    if (!card || card.dataset.knowledgeHub === "true") return;
    card.dataset.knowledgeHub = "true";
    card.classList.add("immigration-knowledge-card");
    card.innerHTML = immigrationMarkup();
  }

  function replaceExposureCard(root) {
    const card = root.querySelector("#exposure-wall") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "曝光墙");
    if (!card || card.dataset.legalHub === "true") return;
    card.dataset.legalHub = "true";
    card.id = "legal-home-hub";
    card.classList.remove("expose-wall-box");
    card.classList.add("immigration-knowledge-card", "legal-knowledge-card");
    card.innerHTML = legalMarkup();
  }

  function replaceCards() {
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    replaceImmigrationCard(root);
    replaceExposureCard(root);
  }

  function start() {
    replaceCards();
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    new MutationObserver(replaceCards).observe(root, { childList: true, subtree: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
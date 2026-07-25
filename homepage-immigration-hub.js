(function () {
  const paths = [
    ["赴美留学", "/immigrate/?path=study"],
    ["赴美工作", "/immigrate/?path=work"],
    ["职业移民", "/immigrate/?path=employment"],
    ["家庭移民", "/immigrate/?path=family"],
    ["人道主义庇护", "/immigrate/?path=humanitarian"],
    ["境内身份转换", "/immigrate/?path=change-status"],
    ["入籍美国公民", "/immigrate/?path=citizenship"]
  ];

  function markup() {
    return `
      <header class="immigration-hub-head">
        <h2>移民美国</h2>
        <a href="/immigrate/">进入知识库</a>
      </header>
      <a class="immigration-hub-feature" href="/immigrate/" aria-label="进入移民美国知识库">
        <strong>找到适合您的美国身份途径</strong>
      </a>
      <div class="immigration-hub-grid">
        ${paths.map(([name, href], index) => `<a class="${index === paths.length - 1 ? "is-wide" : ""}" href="${href}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="immigration-hub-all" href="/immigrate/">查看全部移民知识</a>`;
  }

  function replaceCard() {
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    const card = root.querySelector("#immigration") || Array.from(root.querySelectorAll(".news-box")).find((item) => item.querySelector("h2")?.textContent.trim() === "移民美国");
    if (!card || card.dataset.knowledgeHub === "true") return;
    card.dataset.knowledgeHub = "true";
    card.classList.add("immigration-knowledge-card");
    card.innerHTML = markup();
  }

  function start() {
    replaceCard();
    const root = document.querySelector("#sections-grid");
    if (!root) return;
    new MutationObserver(replaceCard).observe(root, { childList: true, subtree: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
(function () {
  const paths = [
    ["赴美留学", "/immigrate/?path=study", "F-1 · J-1 · OPT"],
    ["赴美工作", "/immigrate/?path=work", "H-1B · L-1 · O-1"],
    ["职业移民", "/immigrate/?path=employment", "EB-1A · NIW · EB-5"],
    ["家庭移民", "/immigrate/?path=family", "婚姻绿卡 · F2A · 亲属移民"],
    ["人道主义庇护", "/immigrate/?path=humanitarian", "庇护 · U签证 · VAWA"],
    ["境内身份转换", "/immigrate/?path=change-status", "延期 · 转身份 · I-485"],
    ["入籍美国公民", "/immigrate/?path=citizenship", "N-400 · 面试 · 宣誓"]
  ];

  function markup() {
    return `
      <header class="immigration-hub-head">
        <div><h2>移民美国</h2><p>美国移民知识导航</p></div>
        <a href="/immigrate/">进入知识库</a>
      </header>
      <a class="immigration-hub-feature" href="/immigrate/" aria-label="进入移民美国知识库">
        <span class="immigration-hub-emblem" aria-hidden="true">US</span>
        <span><strong>找到适合您的美国身份路径</strong><small>按留学、工作、移民、家庭与入籍目标快速查找</small></span>
      </a>
      <div class="immigration-hub-grid">
        ${paths.map(([name, href, detail]) => `<a href="${href}"><strong>${name}</strong><small>${detail}</small><span aria-hidden="true">›</span></a>`).join("")}
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
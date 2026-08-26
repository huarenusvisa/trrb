(() => {
  "use strict";

  const boards = [
    ["USCIS 面谈", "uscis_interview"],
    ["上庭交流", "court_experience"],
    ["移民互助", "immigration_help"],
    ["ICE 经历", "ice_experience"],
    ["律师点评", "lawyer_review"],
    ["投稿爆料", "tipoff"]
  ];
  let rendered = false;

  function installTheme() {
    if (document.getElementById("trrb-community-home-theme")) return;
    const style = document.createElement("style");
    style.id = "trrb-community-home-theme";
    style.textContent = `
      #community-home-hub.community-knowledge-card{display:flex;flex-direction:column;gap:9px;background:#fff!important;border:1px solid #ecd9d0!important;border-top:4px solid #b4232d!important;box-shadow:0 7px 24px rgba(15,23,42,.055)!important;min-height:238px;box-sizing:border-box}
      #community-home-hub .community-home-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #community-home-hub .community-home-head h2{margin:0;font-size:23px;line-height:1.2}
      #community-home-hub .community-home-head a{color:#a61e28;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap}
      #community-home-hub .community-home-feature{display:flex;align-items:center;min-height:58px;padding:11px 15px;border-radius:9px;background:linear-gradient(135deg,#8a1821,#c73641);color:#fff;text-decoration:none}
      #community-home-hub .community-home-feature strong{font-size:15px;line-height:1.35}
      #community-home-hub .community-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      #community-home-hub .community-home-grid a{position:relative;display:flex;align-items:center;min-height:44px;padding:8px 27px 8px 11px;border:1px solid #eee3df;border-radius:8px;background:#fffaf8;color:#171717;text-decoration:none;font-size:13px;font-weight:750;transition:.18s ease}
      #community-home-hub .community-home-grid a:hover,#community-home-hub .community-home-grid a:focus-visible{border-color:#b4232d;background:#fff5f1;transform:translateY(-1px);outline:none}
      #community-home-hub .community-home-grid span{position:absolute;right:10px;color:#b4232d;font-size:18px}
      #community-home-hub .community-home-all{display:block;margin-top:auto;padding:9px;border-radius:8px;background:#f7f2f0;color:#9b1c26;font-weight:800;text-align:center;text-decoration:none}
      @media(max-width:420px){#community-home-hub .community-home-grid{grid-template-columns:1fr 1fr}#community-home-hub.community-knowledge-card{min-height:230px}}
    `;
    document.head.appendChild(style);
  }

  function markup() {
    return `
      <header class="community-home-head"><h2>移民社区</h2><a href="/community/">进入社区</a></header>
      <a class="community-home-feature" href="/community/"><strong>分享真实经历 · 问问题 · 互相帮助</strong></a>
      <div class="community-home-grid">
        ${boards.map(([name, category]) => `<a href="/community/?category=${category}"><strong>${name}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </div>
      <a class="community-home-all" href="/community/">查看全部社区讨论</a>`;
  }

  function baseHomeReady() {
    const root = document.querySelector("#sections-grid");
    const articles = Array.isArray(window.TRRB_LAST_HOME_ARTICLES) ? window.TRRB_LAST_HOME_ARTICLES : [];
    return Boolean(root?.children?.length && articles.length);
  }

  function renderOnce() {
    if (!baseHomeReady()) return false;
    const root = document.querySelector("#sections-grid");
    if (!root) return false;
    let card = root.querySelector("#community-home-hub");
    if (!card) {
      card = document.createElement("article");
      card.id = "community-home-hub";
      card.className = "news-box community-knowledge-card";
      root.appendChild(card);
    }
    card.dataset.communityHub = "true";
    card.classList.remove("category-empty");
    card.classList.add("community-knowledge-card");
    card.innerHTML = markup();
    rendered = true;
    window.TRRB_HOME_COMMUNITY_RENDERED = true;
    return true;
  }

  function boot() {
    installTheme();
    const started = Date.now();
    const tick = () => {
      if (!rendered && baseHomeReady()) renderOnce();
      if (rendered || Date.now() - started > 8000) return;
      window.setTimeout(tick, 80);
    };
    tick();

    const installGuard = () => {
      const root = document.querySelector("#sections-grid");
      if (!root || root.dataset.communityGuardBound === "true") return false;
      root.dataset.communityGuardBound = "true";
      new MutationObserver(() => {
        if (root.querySelector("#community-home-hub") || !baseHomeReady()) return;
        rendered = false;
        renderOnce();
      }).observe(root, { childList: true });
      return true;
    };
    if (!installGuard()) window.setTimeout(installGuard, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

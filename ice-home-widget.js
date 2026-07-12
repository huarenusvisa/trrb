(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const card = findIceCard();
    if (!card) return;

    makeClickable(card);
    injectStyle();
    card.classList.add("ice-live-card");

    try {
      const response = await fetch(`/data/ice-news.json?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const items = await response.json();
      renderMeta(card, Array.isArray(items) ? items : []);
    } catch {
      renderMeta(card, []);
    }
  }

  function findIceCard() {
    const candidates = [...document.querySelectorAll("a,button,li,div,section")]
      .filter(element => {
        const text = normalize(element.textContent);
        return text.includes("ICE执法") && text.length <= 120;
      })
      .sort((a, b) => normalize(a.textContent).length - normalize(b.textContent).length);

    const label = candidates[0];
    if (!label) return null;
    return label.closest("a") ||
      label.closest(".topic-item,.topic-card,.special-item,.focus-item,.feature-card") ||
      label.parentElement || label;
  }

  function makeClickable(card) {
    if (card.tagName === "A") {
      card.setAttribute("href", "/topic/ice/");
      return;
    }
    const anchor = card.querySelector("a");
    if (anchor) {
      anchor.setAttribute("href", "/topic/ice/");
      return;
    }
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => location.assign("/topic/ice/"));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") location.assign("/topic/ice/");
    });
  }

  function renderMeta(card, items) {
    if (card.querySelector(".ice-live-meta")) return;
    const latest = items[0];
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const todayCount = items.filter(item => nyDate(item.published_at) === today).length;

    const box = document.createElement("div");
    box.className = "ice-live-meta";
    box.innerHTML = `
      <span class="ice-live-badge"><i></i>自动更新</span>
      <span class="ice-live-count">今日 ${todayCount} 条</span>
      <span class="ice-live-latest">${escapeHtml(latest?.title || "等待首次同步ICE官方信息")}</span>
    `;
    card.appendChild(box);
  }

  function nyDate(value) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(value));
  }

  function injectStyle() {
    if (document.getElementById("ice-live-card-style")) return;
    const style = document.createElement("style");
    style.id = "ice-live-card-style";
    style.textContent = `
      .ice-live-card{position:relative!important;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease!important;overflow:hidden!important}
      .ice-live-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(15,87,145,.12)!important}
      .ice-live-meta{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(18,116,180,.14);font-size:11px;line-height:1.35;color:#3f5870}
      .ice-live-badge{display:inline-flex;align-items:center;gap:5px;font-weight:700;color:#0874b9}
      .ice-live-badge i{width:7px;height:7px;border-radius:50%;background:#e4002b;box-shadow:0 0 0 4px rgba(228,0,43,.10)}
      .ice-live-count{font-weight:700;color:#6c7d8c;white-space:nowrap}
      .ice-live-latest{grid-column:1/-1;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#5a6774}
      @media(max-width:640px){.ice-live-meta{font-size:10px}.ice-live-latest{max-width:100%}}
    `;
    document.head.appendChild(style);
  }

  function normalize(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]);
  }
})();

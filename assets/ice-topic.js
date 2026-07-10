(() => {
  "use strict";

  const PAGE_SIZE = 20;
  let items = [];
  let visible = PAGE_SIZE;

  document.addEventListener("DOMContentLoaded", load);

  async function load() {
    const list = document.querySelector("#ice-news-list");
    try {
      const [newsResponse, stateResponse] = await Promise.all([
        fetch(`/data/ice-news.json?v=${Date.now()}`, { cache: "no-store" }),
        fetch(`/data/ice-state.json?v=${Date.now()}`, { cache: "no-store" })
      ]);
      if (!newsResponse.ok) throw new Error(`HTTP ${newsResponse.status}`);
      items = await newsResponse.json();
      items = Array.isArray(items) ? items : [];
      const state = stateResponse.ok ? await stateResponse.json() : {};
      renderStats(items, state);
      render();
    } catch (error) {
      list.innerHTML = `<div class="ice-empty"><strong>暂时无法读取ICE新闻</strong><span>${escapeHtml(error.message)}</span></div>`;
    }
  }

  function render() {
    const list = document.querySelector("#ice-news-list");
    const loadMore = document.querySelector("#ice-load-more");
    const subset = items.slice(0, visible);

    if (!subset.length) {
      list.innerHTML = `<div class="ice-empty"><strong>等待首次自动同步</strong><span>运行GitHub Actions后，ICE官方信息会自动出现在这里。</span></div>`;
      loadMore.hidden = true;
      return;
    }

    list.innerHTML = subset.map(cardHtml).join("");
    loadMore.hidden = visible >= items.length;
    loadMore.onclick = () => {
      visible += PAGE_SIZE;
      render();
    };
  }

  function cardHtml(item, index) {
    const image = item.image_url
      ? `<a class="ice-card-image" href="${escapeAttr(item.url)}"><img src="${escapeAttr(item.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
      : `<a class="ice-card-image ice-card-placeholder" href="${escapeAttr(item.url)}" aria-label="查看新闻"><span>ICE</span></a>`;

    return `<article class="ice-news-card${index === 0 ? " ice-news-card-featured" : ""}">
      ${image}
      <div class="ice-card-content">
        <div class="ice-card-topline"><span>ICE官方信息</span><time datetime="${escapeAttr(item.published_at)}">${escapeHtml(formatDate(item.published_at))}</time></div>
        <h2><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.summary)}</p>
        <div class="ice-card-footer"><span>来源：美国移民与海关执法局</span><a href="${escapeAttr(item.url)}">查看全文 →</a></div>
      </div>
    </article>`;
  }

  function renderStats(news, state) {
    const today = nyDate(new Date());
    const todayCount = news.filter(item => nyDate(new Date(item.published_at)) === today).length;
    setText("#ice-today-count", String(todayCount));
    setText("#ice-total-count", String(news.length));
    setText("#ice-last-sync", state.last_run_at ? formatDateTime(state.last_run_at) : "尚未同步");
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function nyDate(value) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(value);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[char]);
  }
  function escapeAttr(value) { return escapeHtml(value); }
})();

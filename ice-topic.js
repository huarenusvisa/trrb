(() => {
  "use strict";

  const DATA_URLS = {
    news: "/data/ice-news.json",
    state: "/data/ice-state.json",
    dashboard: "/data/ice-dashboard.json"
  };
  const NEWS_PAGE_SIZE = 20;

  let dashboard = null;
  let news = [];
  let selectedRange = "24h";
  let selectedMetric = "events";
  let selectedState = "";
  let visibleNewsCount = NEWS_PAGE_SIZE;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.documentElement.dataset.iceLayout = "architecture-v1";
    startNewYorkClock();

    try {
      const [newsResult, stateResult, dashboardResult] = await Promise.allSettled([
        fetchJson(DATA_URLS.news, []),
        fetchJson(DATA_URLS.state, {}),
        fetchJson(DATA_URLS.dashboard, null)
      ]);

      news = newsResult.status === "fulfilled" && Array.isArray(newsResult.value)
        ? normalizeNewsItems(newsResult.value)
        : [];

      const state = stateResult.status === "fulfilled" ? stateResult.value : {};
      const rawDashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
      dashboard = normalizeDashboard(rawDashboard) || makeDashboardFallback(news, state);

      renderSummary();
      renderTodayEvents();
      renderNews();
      bindControls();
    } catch (error) {
      console.error("ICE data loading failed:", error);
      dashboard = makeDashboardFallback([], {});
      renderSummary();
      renderTodayEvents();
      renderNews();
      setText("latest-sync", "最近同步：暂无数据");
    }

    try {
      await renderHeatmap();
    } catch (error) {
      console.warn("ICE heatmap skipped:", error);
      safeShowFallback([]);
    }
  }

  function normalizeNewsItems(items) {
    const seen = new Set();
    return items
      .filter(item => item && typeof item === "object")
      .filter(item => {
        const key = String(item.x_post_id || item.id || item.source_url || item.url || item.title || "").trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) =>
        new Date(b.published_at || b.created_at || 0) -
        new Date(a.published_at || a.created_at || 0)
      );
  }

  async function fetchJson(url, fallback) {
    try {
      const joiner = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${joiner}v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return fallback;
      return await response.json();
    } catch (error) {
      console.warn(`ICE JSON unavailable: ${url}`, error);
      return fallback;
    }
  }

  function normalizeDashboard(value) {
    if (!value || typeof value !== "object") return null;
    if (value.today && value.heatmap) return value;
    return null;
  }

  function startNewYorkClock() {
    const update = () => setText("ny-live-time", formatDateTimeSeconds(new Date()));
    update();
    window.setInterval(update, 1000);
  }

  function renderSummary() {
    const today = dashboard?.today || {};
    setText("today-people", `${Number(today.known_people || 0)}人`);
    setText("today-locations", `${Number(today.location_count || 0)}处`);
    setText("latest-sync", `最近同步：${formatDateTimeSeconds(dashboard?.latest_sync_at || dashboard?.generated_at)}`);
  }

  function renderTodayEvents() {
    const root = document.getElementById("today-event-list");
    if (!root) return;
    const events = Array.isArray(dashboard?.today?.events) ? dashboard.today.events : [];
    if (!events.length) {
      root.innerHTML = '<div class="ice-empty">今天暂无同时披露抓捕或拘留、时间和地点的公开信息。</div>';
      return;
    }

    root.innerHTML = events.map(event => {
      const time = formatEventTime(event);
      const location = event.location_text ||
        [event.city, event.state_name || event.state_code].filter(Boolean).join("，") ||
        "地点未披露";
      const count = Number.isInteger(event.people_count) && event.people_count > 0
        ? `${event.people_count}人`
        : "人数未披露";
      const basis = event.time_basis || (event.occurred_at ? "执法时间" : "官方公开时间");
      return `
        <article class="ice-event-row">
          <div class="ice-event-time">${escapeHtml(time)}</div>
          <div class="ice-event-place">${escapeHtml(location)}</div>
          <div class="ice-event-count">${escapeHtml(count)}</div>
          <div class="ice-event-meta">${escapeHtml(basis)} · <a href="${escapeAttr(event.article_url || "#")}">${escapeHtml(event.article_title || "查看相关报道")}</a></div>
        </article>`;
    }).join("");
  }

  function renderNews() {
    const root = document.getElementById("ice-news-list");
    const loadMore = document.getElementById("load-more-news");
    const countNote = document.getElementById("news-count-note");
    if (!root) return;

    const filtered = selectedState
      ? news.filter(item => extractStateCodes(item).includes(selectedState))
      : news;

    const shown = filtered.slice(0, visibleNewsCount);
    if (!shown.length) {
      root.innerHTML = '<div class="ice-empty">当前筛选范围暂无已发布的ICE新闻。</div>';
      if (loadMore) loadMore.hidden = true;
      if (countNote) countNote.textContent = "共0条";
      return;
    }

    root.innerHTML = shown.map((item, index) => renderNewsCard(item, index)).join("");
    bindImageFallbacks(root);

    if (countNote) countNote.textContent = `已显示${shown.length}条，共${filtered.length}条`;
    if (loadMore) {
      loadMore.hidden = shown.length >= filtered.length;
      loadMore.textContent = `再加载${Math.min(NEWS_PAGE_SIZE, filtered.length - shown.length)}条`;
    }
  }

  function renderNewsCard(item, index) {
    const states = extractStateCodes(item);
    const imageUrl = normalizeIceImageUrl(item.image_url);
    const title = String(item.title || "ICE执法动态").trim();
    const briefTitle = normalizeIceBriefTitle(title);
    const summary = normalizeIceBriefText(item.summary);
    const sourceName = String(item.source_name || "ICE执法信息").trim();
    const publishedAt = String(item.published_at || item.created_at || "");
    const articleUrl = String(item.url || item.source_url || "#");

    const image = imageUrl
      ? `<a class="ice-news-media" href="${escapeAttr(articleUrl)}" aria-label="${escapeAttr(title)}">
          <img src="${escapeAttr(imageUrl)}" alt="" aria-hidden="true"
            loading="${index < 3 ? "eager" : "lazy"}"
            ${index < 2 ? 'fetchpriority="high"' : ""}
            referrerpolicy="no-referrer">
        </a>`
      : "";

    return `
      <article
        class="ice-news-card ice-news-item ${imageUrl ? "has-image" : "no-image"}"
        data-states="${escapeAttr(states.join(","))}"
        data-brief-title="${escapeAttr(briefTitle)}"
      >
        ${image}
        <div class="ice-news-body">
          <div class="ice-news-meta">
            <span class="ice-news-source" title="${escapeAttr(sourceName)}">${escapeHtml(sourceName)}</span>
            <time datetime="${escapeAttr(publishedAt)}">${escapeHtml(formatDateTimeSeconds(publishedAt))}</time>
          </div>
          <h3><a href="${escapeAttr(articleUrl)}">${escapeHtml(imageUrl ? title : briefTitle)}</a></h3>
          <p>${escapeHtml(summary)}</p>
          <a class="ice-news-link" href="${escapeAttr(articleUrl)}">${imageUrl ? "查看全文" : "查看详情"} →</a>
        </div>
      </article>`;
  }

  function bindImageFallbacks(root) {
    root.querySelectorAll(".ice-news-media img").forEach(image => {
      const fallback = () => {
        const card = image.closest(".ice-news-card");
        if (!card || card.classList.contains("no-image")) return;
        image.closest(".ice-news-media")?.remove();
        card.classList.remove("has-image");
        card.classList.add("no-image");
        const title = card.querySelector("h3 a");
        if (title) title.textContent = card.dataset.briefTitle || "ICE执法最新动态";
        const link = card.querySelector(".ice-news-link");
        if (link) link.textContent = "查看详情 →";
      };
      image.addEventListener("error", fallback, { once: true });
      if (image.complete && image.naturalWidth === 0) fallback();
    });
  }

  function extractStateCodes(item) {
    const direct = Array.isArray(item.state_codes)
      ? item.state_codes.map(normalizeStateCode).filter(Boolean)
      : [];
    const fromEvents = Array.isArray(item.enforcement_events)
      ? item.enforcement_events.map(event => normalizeStateCode(event.state_code)).filter(Boolean)
      : [];
    return [...new Set([...direct, ...fromEvents])];
  }

  function normalizeIceImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || /\s/.test(raw)) return "";
    const isHttp = /^https?:\/\//i.test(raw);
    const isSitePath = raw.startsWith("/") && !raw.startsWith("//");
    if (!isHttp && !isSitePath) return "";
    try {
      const parsed = new URL(raw, window.location.origin);
      if (!["http:", "https:"].includes(parsed.protocol)) return "";
      return isSitePath ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href;
    } catch {
      return "";
    }
  }

  function normalizeIceBriefTitle(value) {
    let clean = String(value || "ICE执法动态")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[。！？!?]+$/g, "")
      .replace(/美国移民与海关执法局/g, "ICE")
      .replace(/美国国土安全部/g, "DHS")
      .trim();

    if (!clean) clean = "ICE执法最新动态";

    const clauses = clean.split(/[，,:：；;｜|—–-]/).map(part => part.trim()).filter(Boolean);
    const preferred = clauses.find(part => {
      const length = Array.from(part).length;
      return length >= 8 && length <= 18;
    });
    if (preferred) clean = preferred;

    let chars = Array.from(clean);
    if (chars.length > 18) {
      clean = chars.slice(0, 18).join("").replace(/[，、：:；;]+$/g, "");
      chars = Array.from(clean);
    }
    if (chars.length < 8) {
      clean = `${clean}相关动态`;
      chars = Array.from(clean);
    }
    if (chars.length > 18) clean = chars.slice(0, 18).join("").replace(/[，、：:；;]+$/g, "");
    return clean;
  }

  function normalizeIceBriefText(value) {
    const clean = String(value || "ICE相关公开信息已更新。")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const chars = Array.from(clean);
    return chars.length > 110 ? `${chars.slice(0, 110).join("")}…` : clean;
  }

  function bindControls() {
    document.getElementById("range-controls")?.addEventListener("click", async event => {
      const button = event.target.closest("button[data-range]");
      if (!button) return;
      selectedRange = button.dataset.range;
      setActiveButton("range-controls", button);
      await renderHeatmap();
    });

    document.getElementById("metric-controls")?.addEventListener("click", async event => {
      const button = event.target.closest("button[data-metric]");
      if (!button) return;
      selectedMetric = button.dataset.metric;
      setActiveButton("metric-controls", button);
      await renderHeatmap();
    });

    document.getElementById("clear-state-filter")?.addEventListener("click", () => filterByState(""));
    document.getElementById("load-more-news")?.addEventListener("click", () => {
      visibleNewsCount += NEWS_PAGE_SIZE;
      renderNews();
    });
  }

  function setActiveButton(parentId, active) {
    document.querySelectorAll(`#${parentId} button`).forEach(button => button.classList.toggle("is-active", button === active));
  }

  async function renderHeatmap() {
    const rows = dashboard?.heatmap?.[selectedRange]?.states || [];
    const totals = summarizeRows(rows);
    updateHeatmapSummary(totals);
    renderTopStates(rows);

    const note = document.getElementById("heatmap-note");
    note.textContent = `${rangeLabel(selectedRange)}共公开${selectedMetric === "people" ? `${totals.people}人` : `${totals.events}起事件`}`;

    if (!rows.length) {
      safeShowFallback(rows);
      return;
    }

    try {
      await ensurePlotly();
      const map = document.getElementById("ice-heatmap");
      if (!map) return;
      map.hidden = false;
      const fallback = document.getElementById("heatmap-fallback");
      if (fallback) fallback.hidden = true;
      const values = rows.map(row => Number(row[selectedMetric] || 0));
      const isPeople = selectedMetric === "people";
      await window.Plotly.react(map, [{
        type: "choropleth",
        locationmode: "USA-states",
        locations: rows.map(row => row.code),
        z: values,
        text: rows.map(row => `${row.name || row.code}<br>事件：${Number(row.events || 0)}<br>已披露人数：${Number(row.people || 0)}`),
        hovertemplate: "%{text}<extra></extra>",
        colorscale: isPeople
          ? [[0, "#edf8f2"], [.25, "#bfe4ce"], [.6, "#55ae7d"], [1, "#167447"]]
          : [[0, "#edf6fa"], [.25, "#b8dce9"], [.6, "#4b9fbe"], [1, "#005f88"]],
        marker: { line: { color: "#ffffff", width: 1.2 } },
        colorbar: {
          title: isPeople ? "人数" : "事件",
          thickness: 10,
          len: .62,
          x: .98,
          y: .5,
          tickfont: { size: 11 },
          titlefont: { size: 12 }
        }
      }], {
        autosize: true,
        margin: { l: 0, r: 28, t: 8, b: 4 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        geo: {
          scope: "usa",
          projection: { type: "albers usa" },
          showlakes: true,
          lakecolor: "#ffffff",
          bgcolor: "#ffffff"
        }
      }, {
        responsive: true,
        displayModeBar: false,
        scrollZoom: false
      });
      map.removeAllListeners?.("plotly_click");
      map.on?.("plotly_click", data => filterByState(data?.points?.[0]?.location || ""));
    } catch (error) {
      console.warn("Plotly unavailable, using fallback list.", error);
      safeShowFallback(rows);
    }
  }

  function summarizeRows(rows) {
    return rows.reduce((acc, row) => {
      acc.events += Number(row.events || 0);
      acc.people += Number(row.people || 0);
      if (Number(row.events || 0) > 0 || Number(row.people || 0) > 0) acc.states += 1;
      return acc;
    }, { events: 0, people: 0, states: 0 });
  }

  function updateHeatmapSummary(totals) {
    setText("map-range-label", rangeLabel(selectedRange));
    setText("map-total-events", String(totals.events));
    setText("map-total-people", `${totals.people}人`);
    setText("map-active-states", String(totals.states));
    setText("ranking-metric-label", selectedMetric === "people" ? "按已披露人数排序" : "按事件数排序");
    setText("heatmap-description", `按州展示${rangeLabel(selectedRange)}公开执法${selectedMetric === "people" ? "人数" : "事件"}，点击州可筛选相关动态。`);
  }

  function renderTopStates(rows) {
    const root = document.getElementById("top-state-list");
    if (!root) return;
    const sorted = [...rows]
      .sort((a, b) => Number(b[selectedMetric] || 0) - Number(a[selectedMetric] || 0))
      .filter(row => Number(row[selectedMetric] || 0) > 0)
      .slice(0, 8);
    if (!sorted.length) {
      root.innerHTML = '<div class="ice-empty">当前范围暂无州级数据。</div>';
      return;
    }
    const max = Math.max(...sorted.map(row => Number(row[selectedMetric] || 0)), 1);
    root.innerHTML = sorted.map((row, index) => {
      const value = Number(row[selectedMetric] || 0);
      return `<button class="top-state-row" type="button" data-state="${escapeAttr(row.code)}">
        <span class="rank">${index + 1}</span>
        <b>${escapeHtml(row.code)}</b>
        <span class="top-state-bar"><i style="width:${Math.max(6, value / max * 100)}%"></i></span>
        <strong>${value}</strong>
      </button>`;
    }).join("");
    root.querySelectorAll("button[data-state]").forEach(button => button.addEventListener("click", () => filterByState(button.dataset.state)));
  }

  function safeShowFallback(rows) {
    const map = document.getElementById("ice-heatmap");
    const fallback = document.getElementById("heatmap-fallback");
    if (!map && !fallback) return;
    if (map) map.hidden = true;
    if (!fallback) return;
    fallback.hidden = false;
    if (!rows.length) {
      fallback.innerHTML = '<div class="ice-empty">当前时间范围内暂无可定位到州的ICE公开执法数据。</div>';
      return;
    }
    const max = Math.max(...rows.map(row => Number(row[selectedMetric] || 0)), 1);
    fallback.innerHTML = `<div class="ice-state-rank">${rows.slice(0, 15).map(row => {
      const value = Number(row[selectedMetric] || 0);
      return `<button class="ice-state-rank-row" type="button" data-state="${escapeAttr(row.code)}">
        <b>${escapeHtml(row.code)}</b>
        <span class="ice-state-bar"><i style="width:${Math.max(4, value / max * 100)}%"></i></span>
        <strong>${value}</strong>
      </button>`;
    }).join("")}</div>`;
    fallback.querySelectorAll("button[data-state]").forEach(button => button.addEventListener("click", () => filterByState(button.dataset.state)));
  }

  function filterByState(state) {
    selectedState = normalizeStateCode(state);
    visibleNewsCount = NEWS_PAGE_SIZE;
    renderNews();

    const clear = document.getElementById("clear-state-filter");
    if (clear) clear.hidden = !selectedState;

    const note = document.getElementById("news-sort-note");
    if (note) {
      const count = selectedState
        ? news.filter(item => extractStateCodes(item).includes(selectedState)).length
        : news.length;
      note.textContent = selectedState
        ? `当前筛选：${selectedState}（${count}条）`
        : "按发布时间倒序排列";
    }

    if (selectedState) {
      document.getElementById("latest-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function makeDashboardFallback(items, state) {
    return {
      latest_sync_at: state?.last_run_at || "",
      total_published: items.length,
      today: { known_people: 0, event_count: 0, location_count: 0, events: [] },
      heatmap: { "24h": { states: [] }, "7d": { states: [] }, "30d": { states: [] } }
    };
  }

  function formatEventTime(event) {
    if (event.occurred_at) return formatByPrecision(event.occurred_at, event.time_precision);
    return `${formatDateTimeSeconds(event.published_at || event.basis_time)}（公开）`;
  }

  function formatByPrecision(value, precision) {
    const full = dateParts(value);
    if (!full) return "时间未披露";
    if (precision === "date") return `${full.year}/${full.month}/${full.day}`;
    if (precision === "hour") return `${full.year}/${full.month}/${full.day} ${full.hour}时`;
    if (precision === "minute") return `${full.year}/${full.month}/${full.day} ${full.hour}:${full.minute}`;
    return `${full.year}/${full.month}/${full.day} ${full.hour}:${full.minute}:${full.second}`;
  }

  function formatDateTimeSeconds(value) {
    const parts = dateParts(value);
    if (!parts) return "—";
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function dateParts(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: String(Number(map.year)), month: String(Number(map.month)), day: String(Number(map.day)),
      hour: map.hour, minute: map.minute, second: map.second
    };
  }

  function ensurePlotly() {
    if (window.Plotly) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ice-plotly="true"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.plot.ly/plotly-2.35.2.min.js";
      script.async = true;
      script.dataset.icePlotly = "true";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function rangeLabel(range) {
    return ({ "24h": "过去24小时", "7d": "过去7天", "30d": "过去30天" })[range] || range;
  }

  function normalizeStateCode(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(raw)) return raw;
    const aliases = {
      FLORIDA: "FL", TEXAS: "TX", CALIFORNIA: "CA", ARIZONA: "AZ", NEW_YORK: "NY", "NEW YORK": "NY",
      GEORGIA: "GA", ILLINOIS: "IL", MASSACHUSETTS: "MA", COLORADO: "CO", WASHINGTON: "WA",
      PENNSYLVANIA: "PA", VIRGINIA: "VA", MARYLAND: "MD", NEW_JERSEY: "NJ", "NEW JERSEY": "NJ"
    };
    return aliases[raw] || "";
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function escapeAttr(value) { return escapeHtml(value); }

})();

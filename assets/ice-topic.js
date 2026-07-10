(() => {
  "use strict";

  const DATA_URLS = {
    news: "/data/ice-news.json",
    state: "/data/ice-state.json",
    dashboard: "/data/ice-dashboard.json"
  };

  let dashboard = null;
  let news = [];
  let selectedRange = "24h";
  let selectedMetric = "events";
  let selectedState = "";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    startNewYorkClock();
    try {
      const [newsResult, stateResult, dashboardResult] = await Promise.allSettled([
        fetchJson(DATA_URLS.news, []),
        fetchJson(DATA_URLS.state, {}),
        fetchJson(DATA_URLS.dashboard, null)
      ]);
      news = newsResult.status === "fulfilled" && Array.isArray(newsResult.value) ? newsResult.value : [];
      const state = stateResult.status === "fulfilled" ? stateResult.value : {};
      dashboard = dashboardResult.status === "fulfilled" && dashboardResult.value
        ? dashboardResult.value
        : makeDashboardFallback(news, state);

      renderSummary();
      renderTodayEvents();
      renderNews();
      bindControls();
      await renderHeatmap();
    } catch (error) {
      console.error("ICE topic failed:", error);
      setText("today-people", "—");
      setText("today-locations", "—");
      setText("latest-sync", "最近同步：加载失败");
      document.getElementById("today-event-list").innerHTML = '<div class="ice-empty">暂时无法读取ICE统计数据。</div>';
      document.getElementById("ice-news-list").innerHTML = '<div class="ice-empty">暂时无法读取ICE新闻。</div>';
    }
  }

  async function fetchJson(url, fallback) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return response.json();
  }

  function startNewYorkClock() {
    const update = () => {
      setText("ny-live-time", formatDateTimeSeconds(new Date()));
    };
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
    const events = Array.isArray(dashboard?.today?.events) ? dashboard.today.events : [];
    if (!events.length) {
      root.innerHTML = '<div class="ice-empty">今天暂无同时披露抓捕/拘留、时间和地点的ICE官方信息。</div>';
      return;
    }

    root.innerHTML = events.map(event => {
      const time = formatEventTime(event);
      const location = event.location_text || [event.city, event.state_name || event.state_code].filter(Boolean).join("，") || "地点未披露";
      const count = Number.isInteger(event.people_count) && event.people_count > 0 ? `${event.people_count}人` : "人数未披露";
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
    const sorted = [...news].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    if (!sorted.length) {
      root.innerHTML = '<div class="ice-empty">暂时没有已发布的ICE新闻。</div>';
      return;
    }

    root.innerHTML = sorted.map(item => {
      const states = Array.isArray(item.state_codes)
        ? item.state_codes
        : [...new Set((item.enforcement_events || []).map(event => event.state_code).filter(Boolean))];
      const image = item.image_url
        ? `<div class="ice-news-thumb-wrap"><img class="ice-news-thumb" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title || "ICE官方图片")}" loading="lazy" referrerpolicy="no-referrer"></div>`
        : '<div class="ice-news-thumb-wrap" aria-hidden="true"></div>';
      return `
        <article class="ice-news-card" data-states="${escapeAttr(states.join(","))}">
          ${image}
          <div class="ice-news-body">
            <div class="ice-news-meta">
              <span class="ice-news-label">${escapeHtml(item.source_name || "ICE执法信息")}</span>
              <time datetime="${escapeAttr(item.published_at || "")}">${escapeHtml(formatDateTimeSeconds(item.published_at))}</time>
            </div>
            <h3><a href="${escapeAttr(item.url || "#")}">${escapeHtml(item.title || "ICE执法动态")}</a></h3>
            <p>${escapeHtml(item.summary || "")}</p>
            <a class="ice-news-link" href="${escapeAttr(item.url || "#")}">查看全文 →</a>
          </div>
        </article>`;
    }).join("");
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
  }

  function setActiveButton(parentId, active) {
    document.querySelectorAll(`#${parentId} button`).forEach(button => button.classList.toggle("is-active", button === active));
  }

  async function renderHeatmap() {
    const rows = dashboard?.heatmap?.[selectedRange]?.states || [];
    const note = document.getElementById("heatmap-note");
    const total = rows.reduce((sum, row) => sum + Number(row[selectedMetric] || 0), 0);
    note.textContent = `${rangeLabel(selectedRange)}共公开${total}${selectedMetric === "people" ? "人" : "起事件"}`;

    if (!rows.length) {
      showFallback(rows);
      return;
    }

    try {
      await ensurePlotly();
      const map = document.getElementById("ice-heatmap");
      map.hidden = false;
      document.getElementById("heatmap-fallback").hidden = true;
      const values = rows.map(row => Number(row[selectedMetric] || 0));
      await window.Plotly.newPlot(map, [{
        type: "choropleth",
        locationmode: "USA-states",
        locations: rows.map(row => row.code),
        z: values,
        text: rows.map(row => `${row.name || row.code}<br>事件：${row.events}<br>已披露人数：${row.people}`),
        hovertemplate: "%{text}<extra></extra>",
        colorscale: [[0, "#eaf4f9"], [.25, "#a7d2e3"], [.6, "#3b91b6"], [1, "#005f88"]],
        marker: { line: { color: "#ffffff", width: .8 } },
        colorbar: { title: selectedMetric === "people" ? "人数" : "事件", thickness: 12, len: .72 }
      }], {
        margin: { l: 8, r: 8, t: 20, b: 10 },
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
      map.on?.("plotly_click", data => {
        const state = data?.points?.[0]?.location || "";
        filterByState(state);
      });
    } catch (error) {
      console.warn("Plotly unavailable, using fallback list.", error);
      showFallback(rows);
    }
  }

  function showFallback(rows) {
    const map = document.getElementById("ice-heatmap");
    const fallback = document.getElementById("heatmap-fallback");
    map.hidden = true;
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
    selectedState = state || "";
    let visible = 0;
    document.querySelectorAll(".ice-news-card").forEach(card => {
      const states = (card.dataset.states || "").split(",").filter(Boolean);
      const show = !selectedState || states.includes(selectedState);
      card.hidden = !show;
      if (show) visible += 1;
    });
    const clear = document.getElementById("clear-state-filter");
    clear.hidden = !selectedState;
    const note = document.getElementById("news-sort-note");
    note.textContent = selectedState ? `当前筛选：${selectedState}（${visible}条）` : "按发布时间倒序排列";
    if (selectedState) document.getElementById("latest-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
      year: String(Number(map.year)),
      month: String(Number(map.month)),
      day: String(Number(map.day)),
      hour: map.hour,
      minute: map.minute,
      second: map.second
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

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();

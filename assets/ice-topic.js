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
  let clockTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
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
      startNewYorkClock();
      renderTodayEvents();
      renderNews();
      bindControls();
      await renderHeatmap();
    } catch (error) {
      console.error("ICE topic failed:", error);
      setText("today-people", "—");
      setText("today-locations", "—");
      setText("latest-sync", "加载失败");
      document.getElementById("today-event-list").innerHTML = '<div class="ice-empty">暂时无法读取ICE统计数据。</div>';
      document.getElementById("ice-news-list").innerHTML = '<div class="ice-empty">暂时无法读取ICE新闻。</div>';
    }
  }

  async function fetchJson(url, fallback) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return response.json();
  }

  function renderSummary() {
    const today = dashboard?.today || {};
    setText("today-people", `${Number(today.known_people || 0)}人`);
    setText("today-locations", `${Number(today.location_count || 0)}处`);
    setText("latest-sync", formatDateTimeSeconds(dashboard?.latest_sync_at || dashboard?.generated_at));
  }

  function startNewYorkClock() {
    const update = () => setText("new-york-now", formatDateTimeSeconds(new Date().toISOString()));
    update();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(update, 1000);
  }

  function renderTodayEvents() {
    const root = document.getElementById("today-event-list");
    const events = Array.isArray(dashboard?.today?.events) ? dashboard.today.events : [];
    if (!events.length) {
      root.innerHTML = '<div class="ice-empty">今天暂无同时披露抓捕或拘留、时间和地点的公开信息。</div>';
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
      root.innerHTML = '<div class="ice-empty">过去24小时暂时没有已发布的ICE动态。</div>';
      return;
    }

    root.innerHTML = sorted.map(item => {
      const states = Array.isArray(item.state_codes)
        ? item.state_codes
        : [...new Set((item.enforcement_events || []).map(event => event.state_code).filter(Boolean))];
      const image = item.image_url
        ? `<div class="ice-news-thumb-wrap"><img class="ice-news-thumb" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title || "ICE公开图片")}" loading="lazy" referrerpolicy="no-referrer"></div>`
        : '<div class="ice-news-thumb-wrap ice-news-thumb-empty" aria-hidden="true"></div>';
      return `
        <article class="ice-news-card" data-states="${escapeAttr(states.join(","))}">
          ${image}
          <div class="ice-news-body">
            <div class="ice-news-meta">
              <span class="ice-news-label">ICE公开信息</span>
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
    const eventTotal = rows.reduce((sum, row) => sum + Number(row.events || 0), 0);
    const peopleTotal = rows.reduce((sum, row) => sum + Number(row.people || 0), 0);
    const metricTotal = selectedMetric === "people" ? peopleTotal : eventTotal;

    setText("map-range-stat", rangeLabel(selectedRange));
    setText("map-events-stat", String(eventTotal));
    setText("map-people-stat", `${peopleTotal}人`);
    setText("map-states-stat", String(rows.length));
    setText("rank-title", selectedMetric === "people" ? "按已披露人数排序" : "按事件数排序");
    setText("heatmap-description", `按州展示${rangeLabel(selectedRange)}公开执法事件，点击州可筛选相关动态。`);
    setText("heatmap-note", `${rangeLabel(selectedRange)}共公开${metricTotal}${selectedMetric === "people" ? "人" : "起事件"}`);

    renderStateRank(rows);

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
      const maxValue = Math.max(...values, 1);

      await window.Plotly.newPlot(map, [{
        type: "choropleth",
        locationmode: "USA-states",
        locations: rows.map(row => row.code),
        z: values,
        zmin: 0,
        zmax: maxValue,
        text: rows.map(row => `${row.name || row.code}<br>事件：${row.events}<br>已披露人数：${row.people}`),
        hovertemplate: "%{text}<extra></extra>",
        colorscale: [[0, "#edf7fb"], [.25, "#b8ddea"], [.6, "#55a9c7"], [1, "#006b91"]],
        marker: { line: { color: "#26343c", width: .75 } },
        colorbar: {
          title: selectedMetric === "people" ? "人数" : "事件",
          thickness: 11,
          len: .57,
          x: .98,
          y: .52,
          outlinewidth: 1,
          tickfont: { size: 11 }
        }
      }], {
        autosize: true,
        margin: { l: 4, r: 24, t: 8, b: 4 },
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        geo: {
          scope: "usa",
          projection: { type: "albers usa" },
          showlakes: false,
          showland: true,
          landcolor: "#ffffff",
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
      showFallback(rows);
    }
  }

  function renderStateRank(rows) {
    const root = document.getElementById("state-rank-list");
    if (!rows.length) {
      root.innerHTML = '<div class="ice-rank-empty">当前范围暂无可定位到州的公开事件。</div>';
      return;
    }

    const sorted = [...rows]
      .sort((a, b) => Number(b[selectedMetric] || 0) - Number(a[selectedMetric] || 0))
      .slice(0, 10);
    const max = Math.max(...sorted.map(row => Number(row[selectedMetric] || 0)), 1);

    root.innerHTML = sorted.map((row, index) => {
      const value = Number(row[selectedMetric] || 0);
      return `<button class="ice-state-rank-row" type="button" data-state="${escapeAttr(row.code)}">
        <span class="ice-rank-number">${index + 1}</span>
        <b>${escapeHtml(row.code)}</b>
        <span class="ice-state-bar"><i style="width:${Math.max(4, value / max * 100)}%"></i></span>
        <strong>${value}</strong>
      </button>`;
    }).join("");

    root.querySelectorAll("button[data-state]").forEach(button => {
      button.addEventListener("click", () => filterByState(button.dataset.state));
    });
  }

  function showFallback(rows) {
    const map = document.getElementById("ice-heatmap");
    const fallback = document.getElementById("heatmap-fallback");
    map.hidden = true;
    fallback.hidden = false;
    fallback.innerHTML = rows.length
      ? '<div class="ice-empty">地图暂时无法加载，可使用下方热点州排行筛选新闻。</div>'
      : '<div class="ice-empty">当前时间范围内暂无可定位到州的ICE公开执法数据。</div>';
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

    document.querySelectorAll(".ice-state-rank-row").forEach(row => {
      row.classList.toggle("is-selected", Boolean(selectedState) && row.dataset.state === selectedState);
    });

    const clear = document.getElementById("clear-state-filter");
    clear.hidden = !selectedState;
    const hint = document.getElementById("rank-hint");
    if (hint) hint.textContent = selectedState ? `已筛选 ${selectedState}` : "点击筛选";
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

  function escapeAttr(value) { return escapeHtml(value); }
})();

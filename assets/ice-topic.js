(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
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
    document.documentElement.dataset.iceLayout = "v46";
    startNewYorkClock();

    // 数据加载与地图渲染分离：地图组件缺失或 Plotly 失败时，
    // 不得连带导致统计和新闻显示“加载失败”。
    try {
      const [newsResult, stateResult, dashboardResult] = await Promise.allSettled([
        fetchFirstJson([DATA_URLS.news, "/data/ice-live.json"], []),
        fetchFirstJson([DATA_URLS.state], {}),
        fetchFirstJson([DATA_URLS.dashboard, "/data/ice-stats.json", "/data/ice-map.json"], null)
      ]);

      news = newsResult.status === "fulfilled" && Array.isArray(newsResult.value)
        ? newsResult.value
        : [];

      const liveNews = await fetchLiveArticles("ICE执法");
      if (liveNews.length) news = mergeLiveNews(liveNews, news);

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

  async function fetchLiveArticles(category) {
    const select = "id,title,summary,cover_image,source_name,source_url,published_at,created_at,city,state,arrest_count,count_in_ice_stats,primary_section,category_name,status";
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const filters = [
      `primary_section=eq.${encodeURIComponent(category)}`,
      `category_name=eq.${encodeURIComponent(category)}`
    ];
    const rows = [];

    for (const filter of filters) {
      try {
        const url = `${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&${filter}&order=published_at.desc.nullslast,created_at.desc&limit=100`;
        const response = await fetch(url, { headers, cache: "no-store" });
        if (!response.ok) continue;
        const result = await response.json();
        if (Array.isArray(result)) rows.push(...result);
      } catch (error) {
        console.warn("ICE Supabase query skipped:", error);
      }
    }

    const seen = new Set();
    return rows.filter(row => {
      const key = String(row.id || row.source_url || row.title || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeLiveNews(live, archived) {
    const mapped = live.map(row => {
      const imageUrl = normalizeIceImageUrl(row.cover_image);
      const noImage = !imageUrl;
      return {
        id: row.id,
        title: noImage ? normalizeIceBriefTitle(row.title) : String(row.title || "ICE执法动态").trim(),
        summary: noImage ? normalizeIceBriefText(row.summary) : String(row.summary || "").trim(),
        content_type: noImage ? "brief" : "article",
        image_url: imageUrl,
        source_name: row.source_name,
        source_url: row.source_url,
        published_at: row.published_at || row.created_at,
        url: `/article.html?id=${encodeURIComponent(row.id)}`,
        state_codes: row.state ? [normalizeStateCode(row.state)] : [],
        enforcement_events: []
      };
    });

    // Supabase 与静态 JSON 可能同时包含同一条 X 新闻。优先使用实时数据，
    // 按来源链接和标题双重去重，避免页面出现重复卡片。
    const seen = new Set();
    const result = [];
    for (const item of [...mapped, ...archived]) {
      const sourceKey = String(item.source_url || "").trim().toLowerCase();
      const idKey = String(item.x_post_id || item.id || "").trim().toLowerCase();
      const titleKey = String(item.title || "").replace(/\s+/g, "").toLowerCase();
      const stableKeys = [sourceKey && `source:${sourceKey}`, idKey && `id:${idKey}`].filter(Boolean);
      const keys = stableKeys.length ? stableKeys : [titleKey && `title:${titleKey}`].filter(Boolean);
      if (keys.some(key => seen.has(key))) continue;
      keys.forEach(key => seen.add(key));
      result.push(item);
    }
    return result;
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

  async function fetchFirstJson(urls, fallback) {
    for (const url of urls) {
      const value = await fetchJson(url, null);
      if (value !== null && value !== undefined) return value;
    }
    return fallback;
  }

  function normalizeDashboard(value) {
    if (!value || typeof value !== "object") return null;
    if (value.today && value.heatmap) return value;

    // 兼容 ice-stats.json / ice-map.json 等旧格式。
    const todaySource = value.today || value.stats?.today || {};
    const mapSource = value.heatmap || value.map || {};
    const normalizeRange = range => {
      const source = mapSource?.[range]?.states || mapSource?.[range] || [];
      return { states: Array.isArray(source) ? source : [] };
    };

    return {
      generated_at: value.generated_at || value.updated_at || value.latest_sync_at || "",
      latest_sync_at: value.latest_sync_at || value.updated_at || value.generated_at || "",
      total_published: Number(value.total_published || 0),
      today: {
        date: todaySource.date || "",
        known_people: Number(todaySource.known_people ?? todaySource.confirmed_people ?? 0),
        event_count: Number(todaySource.event_count ?? todaySource.events_count ?? 0),
        location_count: Number(todaySource.location_count ?? todaySource.locations ?? 0),
        events: Array.isArray(todaySource.events) ? todaySource.events : []
      },
      heatmap: {
        "24h": normalizeRange("24h"),
        "7d": normalizeRange("7d"),
        "30d": normalizeRange("30d")
      }
    };
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
    if (!root) return;

    const sorted = [...news].sort(
      (a, b) =>
        new Date(b.published_at || b.created_at || 0) -
        new Date(a.published_at || a.created_at || 0)
    );

    if (!sorted.length) {
      root.innerHTML = '<div class="ice-empty">暂时没有已发布的ICE新闻。</div>';
      return;
    }

    const prepared = sorted.map((item, index) => {
      const states = Array.isArray(item.state_codes)
        ? item.state_codes.map(normalizeStateCode).filter(Boolean)
        : [...new Set(
            (item.enforcement_events || [])
              .map(event => normalizeStateCode(event.state_code))
              .filter(Boolean)
          )];

      return {
        item,
        states,
        key: `ice-news-${index}`,
        imageUrl: normalizeIceImageUrl(item.image_url || item.cover_image)
      };
    });

    // 先全部显示为文字快讯，确保坏图、慢图和懒加载图片不会制造空白卡片。
    root.innerHTML = prepared
      .map(entry => renderBriefNewsRow(entry.item, entry.states, entry.key))
      .join("");

    // 图片只有真正加载成功并达到新闻图片尺寸后，才升级为图片卡片。
    prepared.forEach(async entry => {
      if (!entry.imageUrl) return;

      const imageInfo = await validateNewsImage(entry.imageUrl);
      if (!imageInfo.valid) return;

      const current = root.querySelector(`[data-news-key="${entry.key}"]`);
      if (!current) return;

      const template = document.createElement("template");
      template.innerHTML = renderImageNewsCard(
        entry.item,
        entry.states,
        imageInfo.url,
        entry.key
      ).trim();

      const replacement = template.content.firstElementChild;
      if (replacement) current.replaceWith(replacement);
    });
  }

  function renderImageNewsCard(item, states, imageUrl, newsKey = "") {
    const title = String(item.title || "ICE执法动态").trim();
    const summary = String(item.summary || "").trim();
    const sourceName = String(item.source_name || "ICE执法信息").trim();
    const publishedAt = String(item.published_at || item.created_at || "");
    const articleUrl = String(item.url || item.source_url || "#");

    return `
      <article
        class="ice-news-card has-image ice-news-item"
        data-news-key="${escapeAttr(newsKey)}"
        data-states="${escapeAttr(states.join(","))}"
      >
        <a class="ice-news-thumb-wrap" href="${escapeAttr(articleUrl)}" aria-label="${escapeAttr(title)}">
          <img
            class="ice-news-thumb"
            src="${escapeAttr(imageUrl)}"
            alt=""
            aria-hidden="true"
            loading="eager"
            referrerpolicy="no-referrer"
          >
        </a>
        <div class="ice-news-body">
          <div class="ice-news-meta">
            <span class="ice-news-label">${escapeHtml(sourceName)}</span>
            <time datetime="${escapeAttr(publishedAt)}">${escapeHtml(formatDateTimeSeconds(publishedAt))}</time>
          </div>
          <h3><a href="${escapeAttr(articleUrl)}">${escapeHtml(title)}</a></h3>
          <p>${escapeHtml(summary)}</p>
          <a class="ice-news-link" href="${escapeAttr(articleUrl)}">查看全文 →</a>
        </div>
      </article>`;
  }

  function renderBriefNewsRow(item, states, newsKey = "") {
    const title = normalizeIceBriefTitle(item.title);
    const summary = normalizeIceBriefText(item.summary);
    const sourceName = String(item.source_name || "ICE执法信息").trim();
    const publishedAt = String(item.published_at || item.created_at || "");
    const articleUrl = String(item.url || item.source_url || "#");

    return `
      <article
        class="ice-brief-row ice-news-item"
        data-news-key="${escapeAttr(newsKey)}"
        data-states="${escapeAttr(states.join(","))}"
      >
        <time datetime="${escapeAttr(publishedAt)}">${escapeHtml(formatDateTimeSeconds(publishedAt))}</time>
        <div class="ice-brief-copy">
          <h3><a href="${escapeAttr(articleUrl)}">${escapeHtml(title)}</a></h3>
          <p>${escapeHtml(summary)}</p>
        </div>
        <a class="ice-brief-source" href="${escapeAttr(articleUrl)}">${escapeHtml(sourceName)}</a>
      </article>`;
  }

  function validateNewsImage(value) {
    const url = normalizeIceImageUrl(value);
    if (!url) return Promise.resolve({ valid: false, url: "" });

    return new Promise(resolve => {
      const image = new Image();
      let settled = false;

      const finish = valid => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({
          valid,
          url,
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0
        });
      };

      const timer = window.setTimeout(() => finish(false), 8000);

      image.referrerPolicy = "no-referrer";
      image.decoding = "async";
      image.onload = () => {
        const width = image.naturalWidth || 0;
        const height = image.naturalHeight || 0;

        // 排除头像、Logo、追踪像素、失效占位图。
        finish(width >= 300 && height >= 160);
      };
      image.onerror = () => finish(false);
      image.src = url;
    });
  }

  function normalizeIceImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw || /\s/.test(raw)) return "";

    const isAbsoluteHttp =
      raw.startsWith("https://") ||
      raw.startsWith("http://") ||
      raw.startsWith("//");
    const isSitePath = raw.startsWith("/") && !raw.startsWith("//");

    // 账号名、alt文字和普通文本即使非空，也不能被当作图片地址。
    if (!isAbsoluteHttp && !isSitePath) return "";

    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

      return isSitePath
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : parsed.href;
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
    return chars.length > 90 ? `${chars.slice(0, 90).join("")}…` : clean;
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
    let visible = 0;
    document.querySelectorAll(".ice-news-item").forEach(card => {
      const states = (card.dataset.states || "").split(",").filter(Boolean);
      const show = !selectedState || states.includes(selectedState);
      card.hidden = !show;
      if (show) visible += 1;
    });
    const clear = document.getElementById("clear-state-filter");
    if (clear) clear.hidden = !selectedState;
    const note = document.getElementById("news-sort-note");
    if (note) note.textContent = selectedState ? `当前筛选：${selectedState}（${visible}条）` : "按发布时间倒序排列";
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

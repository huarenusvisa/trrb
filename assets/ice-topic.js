(() => {
  "use strict";

  const DATA_URLS = {
    news: "/data/ice-news.json",
    dashboard: "/data/ice-dashboard.json",
    map: "/data/ice-map-events.json"
  };

  const RANGE_HOURS = { "24h": 24, "7d": 168, "30d": 720 };
  const US_MAINLAND_BOUNDS = [[24.396308, -124.848974], [49.384358, -66.885444]];
  const TYPE_LABELS = { arrest: "抓捕/拘留", removal: "遣返", other: "其他行动" };
  let news = [];
  let dashboard = null;
  let mapData = { events: [] };
  let selectedRange = "24h";
  let selectedType = "all";
  let map = null;
  let cluster = null;
  let userMarker = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const [newsResult, dashboardResult, mapResult] = await Promise.allSettled([
      fetchJson(DATA_URLS.news, []),
      fetchJson(DATA_URLS.dashboard, null),
      fetchJson(DATA_URLS.map, { events: [] })
    ]);
    news = newsResult.status === "fulfilled" && Array.isArray(newsResult.value) ? newsResult.value : [];
    dashboard = dashboardResult.status === "fulfilled" ? dashboardResult.value : null;
    mapData = mapResult.status === "fulfilled" && mapResult.value ? mapResult.value : { events: [] };

    renderSummary();
    startClock();
    renderNews();
    bindControls();
    initMap();
    renderMapEvents();
  }

  async function fetchJson(url, fallback) {
    try {
      const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return fallback;
      return await response.json();
    } catch { return fallback; }
  }

  function renderSummary() {
    const today = dashboard?.today || {};
    setText("today-people", `${Number(today.known_people || 0)}人`);
    setText("today-locations", `${Number(today.location_count || 0)}处`);
    setText("latest-sync", formatNyDateTime(dashboard?.latest_sync_at || dashboard?.generated_at));
  }

  function startClock() {
    const tick = () => setText("ny-clock", formatNyDateTime(new Date().toISOString()));
    tick();
    window.setInterval(tick, 1000);
  }

  function initMap() {
    const root = document.getElementById("ice-live-map");
    if (!root || !window.L) {
      document.getElementById("map-empty").hidden = false;
      return;
    }
    const usBounds = L.latLngBounds(US_MAINLAND_BOUNDS);
    map = L.map(root, {
      zoomControl: true,
      minZoom: 4,
      maxZoom: 16,
      worldCopyJump: false,
      maxBounds: usBounds.pad(0.03),
      maxBoundsViscosity: 1
    });
    map.fitBounds(usBounds, { padding: [6, 6], animate: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      noWrap: true,
      bounds: usBounds.pad(0.08),
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 52,
      spiderfyOnMaxZoom: true,
      iconCreateFunction(group) {
        const count = group.getChildCount();
        const size = count < 10 ? "small" : count < 50 ? "medium" : "large";
        return L.divIcon({
          html: `<span>${count}</span>`,
          className: `ice-cluster ice-cluster-${size}`,
          iconSize: L.point(44, 44)
        });
      }
    });
    map.addLayer(cluster);
    window.setTimeout(() => map.invalidateSize(), 250);
  }

  function bindControls() {
    document.getElementById("range-controls")?.addEventListener("click", event => {
      const button = event.target.closest("button[data-range]");
      if (!button) return;
      selectedRange = button.dataset.range;
      activate("range-controls", button);
      renderMapEvents();
    });
    document.getElementById("type-controls")?.addEventListener("click", event => {
      const button = event.target.closest("button[data-type]");
      if (!button) return;
      selectedType = button.dataset.type;
      activate("type-controls", button);
      renderMapEvents();
    });
    document.getElementById("reset-map")?.addEventListener("click", resetToUnitedStates);
    document.getElementById("locate-me")?.addEventListener("click", locateUser);
  }

  function activate(parentId, active) {
    document.querySelectorAll(`#${parentId} button`).forEach(btn => btn.classList.toggle("is-active", btn === active));
  }

  function filteredEvents() {
    const cutoff = Date.now() - RANGE_HOURS[selectedRange] * 3600 * 1000;
    return (Array.isArray(mapData.events) ? mapData.events : []).filter(event => {
      const time = Date.parse(event.basis_time || event.published_at || "");
      const typeOk = selectedType === "all" || event.category === selectedType;
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      return Number.isFinite(time) && time >= cutoff && typeOk && isInsideMainlandUS(lat, lng);
    });
  }

  function renderMapEvents() {
    const events = filteredEvents();
    updateMapSummary(events);
    const empty = document.getElementById("map-empty");
    empty.hidden = events.length > 0;
    if (!map || !cluster) return;
    cluster.clearLayers();
    events.forEach(event => cluster.addLayer(makeMarker(event)));
    if (events.length) {
      const bounds = cluster.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(.22), { maxZoom: 8, animate: false });
    } else {
      resetToUnitedStates();
    }
  }

  function isInsideMainlandUS(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= US_MAINLAND_BOUNDS[0][0] && lat <= US_MAINLAND_BOUNDS[1][0] &&
      lng >= US_MAINLAND_BOUNDS[0][1] && lng <= US_MAINLAND_BOUNDS[1][1];
  }

  function resetToUnitedStates() {
    if (!map || !window.L) return;
    map.fitBounds(L.latLngBounds(US_MAINLAND_BOUNDS), { padding: [6, 6], animate: false });
  }

  function makeMarker(event) {
    const category = event.category || "other";
    const precision = event.location_precision === "state" ? " state-only" : "";
    const icon = L.divIcon({
      className: "ice-marker-wrap",
      html: `<span class="ice-marker ice-marker-${category}${precision}" aria-hidden="true"><i></i></span>`,
      iconSize: [34, 44],
      iconAnchor: [17, 42],
      popupAnchor: [0, -38]
    });
    const marker = L.marker([event.latitude, event.longitude], { icon, title: event.title || "ICE公开事件" });
    marker.bindPopup(popupHtml(event), { maxWidth: 320, className: "ice-popup" });
    return marker;
  }

  function popupHtml(event) {
    const people = Number(event.people_count) > 0 ? `${event.people_count}人` : "人数未披露";
    const location = event.location_text || [event.city, event.state_name || event.state_code].filter(Boolean).join("，") || "地点未披露";
    const precision = event.location_precision === "state" ? "（州级位置）" : "";
    return `<article class="ice-popup-card">
      <span class="ice-popup-type">${escapeHtml(TYPE_LABELS[event.category] || "ICE公开事件")}</span>
      <h3>${escapeHtml(event.title || "ICE公开事件")}</h3>
      <dl>
        <div><dt>时间</dt><dd>${escapeHtml(formatNyDateTime(event.basis_time || event.published_at))}</dd></div>
        <div><dt>地点</dt><dd>${escapeHtml(location + precision)}</dd></div>
        <div><dt>人数</dt><dd>${escapeHtml(people)}</dd></div>
      </dl>
      <p>${escapeHtml(event.summary || "")}</p>
      <a href="${escapeAttr(event.article_url || "#")}">查看全文 →</a>
    </article>`;
  }

  function updateMapSummary(events) {
    const people = events.reduce((sum, event) => sum + (Number(event.people_count) || 0), 0);
    const states = new Set(events.map(event => event.state_code).filter(Boolean));
    setText("visible-event-count", String(events.length));
    setText("summary-range", ({ "24h": "过去24小时", "7d": "过去7天", "30d": "过去30天" })[selectedRange]);
    setText("summary-events", String(events.length));
    setText("summary-people", `${people}人`);
    setText("summary-states", String(states.size));
  }

  function locateUser() {
    if (!map || !navigator.geolocation) return;
    const button = document.getElementById("locate-me");
    button.disabled = true;
    button.textContent = "定位中…";
    navigator.geolocation.getCurrentPosition(position => {
      const latlng = [position.coords.latitude, position.coords.longitude];
      if (!isInsideMainlandUS(latlng[0], latlng[1])) {
        button.disabled = false;
        button.textContent = "仅限美国本土";
        window.setTimeout(() => button.textContent = "◎ 定位附近", 1800);
        resetToUnitedStates();
        return;
      }
      if (userMarker) userMarker.remove();
      userMarker = L.circleMarker(latlng, { radius: 8, color: "#fff", weight: 3, fillColor: "#1267e5", fillOpacity: 1 }).addTo(map);
      userMarker.bindPopup("您的大致位置").openPopup();
      map.setView(latlng, 8);
      button.disabled = false;
      button.textContent = "◎ 定位附近";
    }, () => {
      button.disabled = false;
      button.textContent = "无法定位";
      window.setTimeout(() => button.textContent = "◎ 定位附近", 1800);
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  }

  function renderNews() {
    const root = document.getElementById("ice-news-list");
    const sorted = [...news].sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    if (!sorted.length) {
      root.innerHTML = '<div class="ice-empty">暂时没有已发布的ICE新闻。</div>';
      return;
    }

    const flashes = sorted.filter(item => item.is_flash || item.display_mode === "flash" || item.content_type === "flash");
    const stories = sorted.filter(item => !(item.is_flash || item.display_mode === "flash" || item.content_type === "flash"));

    const flashSection = flashes.length ? `<section class="ice-flash-section" aria-labelledby="ice-flash-title">
      <div class="ice-flash-heading">
        <h3 id="ice-flash-title">ICE实时快讯</h3>
        <span>过去24小时</span>
      </div>
      <div class="ice-flash-list">
        ${flashes.map(renderFlash).join("")}
      </div>
    </section>` : "";

    const storySection = stories.length ? `<section class="ice-story-section" aria-labelledby="ice-story-title">
      <div class="ice-story-heading"><h3 id="ice-story-title">ICE重点新闻</h3></div>
      <div class="ice-story-list">${stories.map(renderStory).join("")}</div>
    </section>` : "";

    root.innerHTML = flashSection + storySection;
  }

  function renderFlash(item) {
    const href = item.click_url || item.official_url || item.source_url || "#";
    const external = /^https?:\/\//i.test(href);
    return `<article class="ice-flash-item">
      <time>${escapeHtml(formatNyTime(item.published_at))}</time>
      <div class="ice-flash-copy">
        <h4><a href="${escapeAttr(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(item.title || "ICE实时动态")}</a></h4>
        <p>${escapeHtml(item.summary || "")}</p>
      </div>
      <span class="ice-flash-source">${escapeHtml(item.source_name || "公开来源")}</span>
    </article>`;
  }

  function renderStory(item) {
    const image = item.image_url
      ? `<div class="ice-news-thumb-wrap"><img class="ice-news-thumb" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.title || "ICE公开图片")}" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="ice-news-thumb-wrap" aria-hidden="true"></div>';
    return `<article class="ice-news-card">
      ${image}
      <div class="ice-news-body">
        <div class="ice-news-meta"><span class="ice-news-label">${escapeHtml(item.source_name || "ICE公开信息")}</span><time>${escapeHtml(formatNyDateTime(item.published_at))}</time></div>
        <h3><a href="${escapeAttr(item.url || item.click_url || item.source_url || "#")}">${escapeHtml(item.title || "ICE执法动态")}</a></h3>
        <p>${escapeHtml(item.summary || "")}</p>
        <a class="ice-news-link" href="${escapeAttr(item.url || item.click_url || item.source_url || "#")}">查看全文 →</a>
      </div>
    </article>`;
  }

  function formatNyTime(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "--:--";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  }


  function formatNyDateTime(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "—";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(new Date(value));
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${Number(m.year)}/${Number(m.month)}/${Number(m.day)} ${m.hour}:${m.minute}:${m.second}`;
  }

  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }
  function escapeAttr(value) { return escapeHtml(value); }
})();

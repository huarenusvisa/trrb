(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 12;
  const USA_BOUNDS = window.L
    ? L.latLngBounds(L.latLng(24.2, -125.0), L.latLng(49.7, -66.4))
    : null;

  const PLACE_COORDINATES = {
    "new york city": [40.7128, -74.0060], "new york": [40.7128, -74.0060], "nyc": [40.7128, -74.0060], "纽约": [40.7128, -74.0060],
    "los angeles": [34.0522, -118.2437], "洛杉矶": [34.0522, -118.2437],
    "chicago": [41.8781, -87.6298], "芝加哥": [41.8781, -87.6298],
    "houston": [29.7604, -95.3698], "休斯敦": [29.7604, -95.3698],
    "phoenix": [33.4484, -112.0740], "费城": [39.9526, -75.1652],
    "philadelphia": [39.9526, -75.1652], "san antonio": [29.4241, -98.4936],
    "san diego": [32.7157, -117.1611], "圣迭戈": [32.7157, -117.1611],
    "dallas": [32.7767, -96.7970], "达拉斯": [32.7767, -96.7970],
    "austin": [30.2672, -97.7431], "san francisco": [37.7749, -122.4194], "旧金山": [37.7749, -122.4194],
    "seattle": [47.6062, -122.3321], "denver": [39.7392, -104.9903],
    "washington dc": [38.9072, -77.0369], "washington, dc": [38.9072, -77.0369], "华盛顿": [38.9072, -77.0369],
    "boston": [42.3601, -71.0589], "波士顿": [42.3601, -71.0589],
    "miami": [25.7617, -80.1918], "迈阿密": [25.7617, -80.1918],
    "atlanta": [33.7490, -84.3880], "detroit": [42.3314, -83.0458],
    "minneapolis": [44.9778, -93.2650], "portland": [45.5152, -122.6784],
    "las vegas": [36.1699, -115.1398], "new orleans": [29.9511, -90.0715],
    "baltimore": [39.2904, -76.6122], "cleveland": [41.4993, -81.6944],
    "sacramento": [38.5816, -121.4944], "el paso": [31.7619, -106.4850],
    "alabama": [32.8067, -86.7911], "alaska": [64.2008, -152.4937], "arizona": [34.0489, -111.0937],
    "arkansas": [34.9697, -92.3731], "california": [36.7783, -119.4179], "colorado": [39.5501, -105.7821],
    "connecticut": [41.6032, -73.0877], "delaware": [38.9108, -75.5277], "florida": [27.6648, -81.5158],
    "georgia": [32.1656, -82.9001], "hawaii": [19.8968, -155.5828], "idaho": [44.0682, -114.7420],
    "illinois": [40.6331, -89.3985], "indiana": [40.2672, -86.1349], "iowa": [41.8780, -93.0977],
    "kansas": [39.0119, -98.4842], "kentucky": [37.8393, -84.2700], "louisiana": [30.9843, -91.9623],
    "maine": [45.2538, -69.4455], "maryland": [39.0458, -76.6413], "massachusetts": [42.4072, -71.3824],
    "michigan": [44.3148, -85.6024], "minnesota": [46.7296, -94.6859], "mississippi": [32.3547, -89.3985],
    "missouri": [37.9643, -91.8318], "montana": [46.8797, -110.3626], "nebraska": [41.4925, -99.9018],
    "nevada": [38.8026, -116.4194], "new hampshire": [43.1939, -71.5724], "new jersey": [40.0583, -74.4057],
    "new mexico": [34.5199, -105.8701], "north carolina": [35.7596, -79.0193], "north dakota": [47.5515, -101.0020],
    "ohio": [40.4173, -82.9071], "oklahoma": [35.4676, -97.5164], "oregon": [43.8041, -120.5542],
    "pennsylvania": [41.2033, -77.1945], "rhode island": [41.5801, -71.4774], "south carolina": [33.8361, -80.8987],
    "south dakota": [43.9695, -99.9018], "tennessee": [35.5175, -86.5804], "texas": [31.9686, -99.9018],
    "utah": [39.3210, -111.0937], "vermont": [44.5588, -72.5778], "virginia": [37.4316, -78.6569],
    "washington state": [47.4009, -120.7401], "west virginia": [38.5976, -80.4549], "wisconsin": [43.7844, -88.7879],
    "wyoming": [43.0760, -107.2903]
  };

  const STATE_CODES = {
    AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado",
    CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho",
    IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana",
    ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
    MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey",
    NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
    OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
    TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington state",
    WV: "west virginia", WI: "wisconsin", WY: "wyoming"
  };

  let allData = [];
  let visibleCount = PAGE_SIZE;
  let currentRange = "24h";
  let currentType = "all";
  let map = null;
  let markerLayer = null;
  let tileLoaded = false;

  const el = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.,，。;；:：()（）]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseMetadata(value) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) return {};
    try { return JSON.parse(value); } catch { return {}; }
  }

  function inferType(value) {
    const explicit = normalize(value.event_type || value.type || value.action_type);
    const text = normalize(`${value.title || ""} ${value.summary || ""} ${explicit}`);
    if (/arrest|detain|detention|custody|raid|抓捕|拘留|羁押/.test(text)) return "arrest";
    if (/removal|removed|deport|repatriat|遣返|递解|驱逐/.test(text)) return "removal";
    return "other";
  }

  function mapArticle(row) {
    const metadata = parseMetadata(row.metadata);
    const location = metadata.location_text || [metadata.city, metadata.state_code].filter(Boolean).join(", ");
    const item = {
      id: row.id,
      title: row.title || "ICE执法动态",
      summary: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 180),
      content: row.content || "",
      image: row.cover_image || "",
      time: row.published_at || row.source_created_at || row.created_at || "",
      source: row.source_account ? `@${row.source_account}` : "唐人日报编辑部",
      source_url: row.source_url || "",
      article_url: `/article.html?id=${encodeURIComponent(row.id)}`,
      location,
      city: metadata.city || "",
      state: metadata.state_code || "",
      people: Number(metadata.people_count || 0),
      lat: metadata.lat,
      lng: metadata.lng,
      event_type: metadata.event_type || ""
    };
    item.type = inferType(item);
    return item;
  }

  async function fetchIceArticles(limit = 100) {
    const select = [
      "id", "title", "summary", "content", "cover_image", "published_at", "created_at",
      "source_account", "source_url", "source_created_at", "metadata", "topic_key", "status"
    ].join(",");
    const url = `${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&topic_key=eq.ice&status=eq.published&order=published_at.desc.nullslast,created_at.desc&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/json"
        }
      });
      if (!response.ok) throw new Error(`Supabase ${response.status}`);
      const rows = await response.json();
      return (Array.isArray(rows) ? rows : []).map(mapArticle);
    } finally {
      clearTimeout(timer);
    }
  }

  function itemTime(item) {
    const time = new Date(item.time || 0);
    return Number.isNaN(time.getTime()) ? null : time;
  }

  function withinRange(item) {
    const time = itemTime(item);
    if (!time) return currentRange === "30d";
    const hours = { "24h": 24, "7d": 168, "30d": 720 }[currentRange] || 24;
    return Date.now() - time.getTime() <= hours * 60 * 60 * 1000;
  }

  function filteredData() {
    return allData.filter((item) => {
      const typeMatches = currentType === "all" || item.type === currentType;
      return typeMatches && withinRange(item);
    });
  }

  function isTodayNewYork(value) {
    const time = itemTime(value);
    if (!time) return false;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    });
    return formatter.format(time) === formatter.format(new Date());
  }

  function updateStats() {
    const today = allData.filter(isTodayNewYork);
    const people = today.reduce((sum, item) => sum + Math.max(0, Number(item.people || 0)), 0);
    const locations = new Set(today.map((item) => item.location || item.city || item.state).filter(Boolean));
    if (el("today-count")) el("today-count").textContent = `${people}人`;
    if (el("today-places")) el("today-places").textContent = `${locations.size}处`;
  }

  function formatTime(item) {
    const time = itemTime(item);
    if (!time) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(time);
  }

  function renderNews() {
    const box = el("ice-news-list");
    if (!box) return;
    const items = filteredData().slice(0, visibleCount);
    if (!items.length) {
      box.innerHTML = `
        <article class="ice-news-item no-image">
          <div class="ice-news-copy">
            <h3>暂无符合当前筛选条件的ICE动态</h3>
            <p>系统已连接实时数据库；新内容发布后会自动显示。</p>
          </div>
        </article>`;
    } else {
      box.innerHTML = items.map((item) => {
        const image = item.image
          ? `<a href="${escapeHtml(item.article_url)}"><img class="ice-news-thumb" src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
          : "";
        return `
          <article class="ice-news-item ${item.image ? "" : "no-image"}">
            ${image}
            <div class="ice-news-copy">
              <h3><a href="${escapeHtml(item.article_url)}">${escapeHtml(item.title)}</a></h3>
              <p>${escapeHtml(item.summary)}</p>
              <div class="ice-news-source">${escapeHtml(formatTime(item))} · 来源：${escapeHtml(item.source)}</div>
            </div>
          </article>`;
      }).join("");
    }

    const loadMore = el("load-more");
    if (loadMore) loadMore.hidden = visibleCount >= filteredData().length;
  }

  function coordinateFor(item) {
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];

    const text = normalize(`${item.location || ""} ${item.city || ""} ${item.state || ""} ${item.title || ""} ${item.summary || ""}`);
    if (!text) return null;

    const place = Object.keys(PLACE_COORDINATES)
      .sort((a, b) => b.length - a.length)
      .find((key) => text.includes(key));
    if (place) return PLACE_COORDINATES[place];

    for (const [code, stateName] of Object.entries(STATE_CODES)) {
      if (new RegExp(`(^|\\W)${code.toLowerCase()}($|\\W)`, "i").test(text)) {
        return PLACE_COORDINATES[stateName] || null;
      }
    }
    return null;
  }

  function showMapState(id) {
    ["ice-map-loading", "ice-map-empty", "ice-map-error"].forEach((name) => {
      el(name)?.classList.toggle("hidden", name !== id);
    });
  }

  function hideMapStates() {
    ["ice-map-loading", "ice-map-empty", "ice-map-error"].forEach((name) => el(name)?.classList.add("hidden"));
  }

  function markerStyle(type, count) {
    const colors = {
      arrest: { fillColor: "#d92d20", color: "#7a271a" },
      removal: { fillColor: "#175cd3", color: "#1849a9" },
      other: { fillColor: "#7f56d9", color: "#53389e" }
    };
    return {
      ...(colors[type] || colors.other), fillOpacity: 0.88, opacity: 1, weight: 2,
      radius: Math.min(17, 7 + Math.sqrt(Math.max(1, count)) * 2)
    };
  }

  function typeLabel(type) {
    return { arrest: "抓捕/拘留", removal: "遣返", other: "其他行动" }[type] || "其他行动";
  }

  function popupHtml(item) {
    const location = item.location || item.city || item.state || "地点待确认";
    const people = Number(item.people || 0);
    return `
      <article class="ice-map-popup">
        <span class="popup-type popup-${escapeHtml(item.type)}">${escapeHtml(typeLabel(item.type))}</span>
        <h3><a href="${escapeHtml(item.article_url)}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary)}</p>
        <dl>
          <div><dt>地点</dt><dd>${escapeHtml(location)}</dd></div>
          <div><dt>时间</dt><dd>${escapeHtml(formatTime(item))}</dd></div>
          ${people > 0 ? `<div><dt>确认人数</dt><dd>${people}人</dd></div>` : ""}
          <div><dt>来源</dt><dd>${escapeHtml(item.source)}</dd></div>
        </dl>
      </article>`;
  }

  function initMap() {
    if (!window.L || !el("ice-map") || !USA_BOUNDS) {
      showMapState("ice-map-error");
      return;
    }
    map = L.map("ice-map", {
      center: [38.8, -96.5], zoom: 4, minZoom: 4, maxZoom: 10,
      maxBounds: USA_BOUNDS, maxBoundsViscosity: 1, worldCopyJump: false
    });
    map.fitBounds(USA_BOUNDS, { padding: [4, 4] });
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 4, maxZoom: 10, noWrap: true, bounds: USA_BOUNDS,
      attribution: "&copy; OpenStreetMap contributors"
    });
    tiles.on("load", () => { tileLoaded = true; renderMarkers(); });
    tiles.on("tileerror", () => { if (!tileLoaded) showMapState("ice-map-error"); });
    tiles.addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    window.addEventListener("resize", () => map?.invalidateSize());
  }

  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const mapped = filteredData()
      .map((item) => ({ item, coordinates: coordinateFor(item) }))
      .filter(({ coordinates }) => coordinates && coordinates[0] >= 24.2 && coordinates[0] <= 49.7 && coordinates[1] >= -125 && coordinates[1] <= -66.4);

    mapped.forEach(({ item, coordinates }) => {
      const count = Number(item.people || 1);
      L.circleMarker(coordinates, markerStyle(item.type, count))
        .bindPopup(popupHtml(item), { maxWidth: 320, className: "ice-popup-shell" })
        .addTo(markerLayer);
    });

    if (!mapped.length) {
      showMapState("ice-map-empty");
      map.fitBounds(USA_BOUNDS, { padding: [4, 4] });
      return;
    }
    hideMapStates();
    if (mapped.length === 1) map.setView(mapped[0].coordinates, 5);
    else map.fitBounds(L.latLngBounds(mapped.map((entry) => entry.coordinates)), { padding: [36, 36], maxZoom: 6 });
  }

  function updateNewYorkClock() {
    const now = new Date();
    if (el("ny-time")) el("ny-time").textContent = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(now);
    if (el("ny-date")) el("ny-date").textContent = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
    }).format(now);
  }

  function bindControls() {
    document.querySelectorAll(".range-tabs [data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        currentRange = button.dataset.range || "24h";
        visibleCount = PAGE_SIZE;
        document.querySelectorAll(".range-tabs [data-range]").forEach((item) => item.classList.toggle("active", item === button));
        renderNews();
        renderMarkers();
      });
    });
    document.querySelectorAll(".type-tabs [data-type]").forEach((button) => {
      button.addEventListener("click", () => {
        currentType = button.dataset.type || "all";
        visibleCount = PAGE_SIZE;
        document.querySelectorAll(".type-tabs [data-type]").forEach((item) => item.classList.toggle("active", item === button));
        renderNews();
        renderMarkers();
      });
    });
    el("load-more")?.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderNews();
    });
  }

  async function start() {
    updateNewYorkClock();
    setInterval(updateNewYorkClock, 1000);
    bindControls();
    initMap();
    try {
      allData = await fetchIceArticles();
      window.TRRB_ICE_DATA = allData;
      updateStats();
      renderNews();
      renderMarkers();
    } catch (error) {
      console.error("ICE实时数据加载失败", error);
      allData = [];
      updateStats();
      renderNews();
      showMapState("ice-map-empty");
      const box = el("ice-news-list");
      if (box) {
        box.innerHTML = `
          <article class="ice-news-item no-image">
            <div class="ice-news-copy">
              <h3>ICE实时数据接口暂时不可用</h3>
              <p>请稍后刷新页面，系统会自动重试。</p>
            </div>
          </article>`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();

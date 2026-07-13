(() => {
  "use strict";

  const DATA_URL = "/data/ice-data.json";
  const USA_BOUNDS = L.latLngBounds(
    L.latLng(24.2, -125.0),
    L.latLng(49.7, -66.4)
  );

  const USA_OUTLINE = [
    [49.0, -124.7], [48.4, -123.0], [46.3, -123.9], [43.2, -124.4],
    [40.0, -124.3], [37.8, -123.0], [34.5, -120.5], [32.5, -117.1],
    [32.5, -114.7], [31.3, -111.0], [31.3, -108.2], [31.8, -106.5],
    [29.8, -104.5], [29.2, -103.0], [28.8, -100.0], [26.0, -97.2],
    [29.5, -95.0], [29.2, -90.0], [30.1, -88.0], [29.2, -85.0],
    [25.2, -81.0], [26.5, -80.0], [30.7, -81.5], [32.0, -80.5],
    [35.0, -76.0], [37.0, -75.5], [39.0, -74.0], [41.0, -72.0],
    [42.8, -70.8], [44.5, -67.0], [47.0, -68.0], [45.0, -71.0],
    [45.0, -74.0], [44.8, -82.0], [43.0, -83.0], [46.5, -84.0],
    [48.0, -89.0], [49.0, -95.0], [49.0, -124.7]
  ];

  const PLACE_COORDINATES = {
    "new york": [40.7128, -74.0060],
    "new york city": [40.7128, -74.0060],
    "nyc": [40.7128, -74.0060],
    "los angeles": [34.0522, -118.2437],
    "chicago": [41.8781, -87.6298],
    "houston": [29.7604, -95.3698],
    "phoenix": [33.4484, -112.0740],
    "philadelphia": [39.9526, -75.1652],
    "san antonio": [29.4241, -98.4936],
    "san diego": [32.7157, -117.1611],
    "dallas": [32.7767, -96.7970],
    "san jose": [37.3382, -121.8863],
    "austin": [30.2672, -97.7431],
    "jacksonville": [30.3322, -81.6557],
    "fort worth": [32.7555, -97.3308],
    "columbus": [39.9612, -82.9988],
    "charlotte": [35.2271, -80.8431],
    "san francisco": [37.7749, -122.4194],
    "indianapolis": [39.7684, -86.1581],
    "seattle": [47.6062, -122.3321],
    "denver": [39.7392, -104.9903],
    "washington": [38.9072, -77.0369],
    "washington dc": [38.9072, -77.0369],
    "boston": [42.3601, -71.0589],
    "el paso": [31.7619, -106.4850],
    "detroit": [42.3314, -83.0458],
    "nashville": [36.1627, -86.7816],
    "portland": [45.5152, -122.6784],
    "memphis": [35.1495, -90.0490],
    "oklahoma city": [35.4676, -97.5164],
    "las vegas": [36.1699, -115.1398],
    "louisville": [38.2527, -85.7585],
    "baltimore": [39.2904, -76.6122],
    "milwaukee": [43.0389, -87.9065],
    "albuquerque": [35.0844, -106.6504],
    "tucson": [32.2226, -110.9747],
    "fresno": [36.7378, -119.7871],
    "sacramento": [38.5816, -121.4944],
    "mesa": [33.4152, -111.8315],
    "kansas city": [39.0997, -94.5786],
    "atlanta": [33.7490, -84.3880],
    "omaha": [41.2565, -95.9345],
    "colorado springs": [38.8339, -104.8214],
    "raleigh": [35.7796, -78.6382],
    "miami": [25.7617, -80.1918],
    "long beach": [33.7701, -118.1937],
    "virginia beach": [36.8529, -75.9780],
    "oakland": [37.8044, -122.2712],
    "minneapolis": [44.9778, -93.2650],
    "tulsa": [36.1540, -95.9928],
    "tampa": [27.9506, -82.4572],
    "arlington": [32.7357, -97.1081],
    "new orleans": [29.9511, -90.0715],
    "cleveland": [41.4993, -81.6944],
    "bakersfield": [35.3733, -119.0187],
    "aurora": [39.7294, -104.8319],
    "anaheim": [33.8366, -117.9143],
    "honolulu": [21.3069, -157.8583],
    "anchorage": [61.2181, -149.9003],

    "alabama": [32.8067, -86.7911],
    "arizona": [34.0489, -111.0937],
    "arkansas": [34.9697, -92.3731],
    "california": [36.7783, -119.4179],
    "colorado": [39.5501, -105.7821],
    "connecticut": [41.6032, -73.0877],
    "delaware": [38.9108, -75.5277],
    "florida": [27.6648, -81.5158],
    "georgia": [32.1656, -82.9001],
    "idaho": [44.0682, -114.7420],
    "illinois": [40.6331, -89.3985],
    "indiana": [40.2672, -86.1349],
    "iowa": [41.8780, -93.0977],
    "kansas": [39.0119, -98.4842],
    "kentucky": [37.8393, -84.2700],
    "louisiana": [30.9843, -91.9623],
    "maine": [45.2538, -69.4455],
    "maryland": [39.0458, -76.6413],
    "massachusetts": [42.4072, -71.3824],
    "michigan": [44.3148, -85.6024],
    "minnesota": [46.7296, -94.6859],
    "mississippi": [32.3547, -89.3985],
    "missouri": [37.9643, -91.8318],
    "montana": [46.8797, -110.3626],
    "nebraska": [41.4925, -99.9018],
    "nevada": [38.8026, -116.4194],
    "new hampshire": [43.1939, -71.5724],
    "new jersey": [40.0583, -74.4057],
    "new mexico": [34.5199, -105.8701],
    "north carolina": [35.7596, -79.0193],
    "north dakota": [47.5515, -101.0020],
    "ohio": [40.4173, -82.9071],
    "oklahoma": [35.4676, -97.5164],
    "oregon": [43.8041, -120.5542],
    "pennsylvania": [41.2033, -77.1945],
    "rhode island": [41.5801, -71.4774],
    "south carolina": [33.8361, -80.8987],
    "south dakota": [43.9695, -99.9018],
    "tennessee": [35.5175, -86.5804],
    "texas": [31.9686, -99.9018],
    "utah": [39.3210, -111.0937],
    "vermont": [44.5588, -72.5778],
    "virginia": [37.4316, -78.6569],
    "washington state": [47.4009, -120.7401],
    "west virginia": [38.5976, -80.4549],
    "wisconsin": [43.7844, -88.7879],
    "wyoming": [43.0760, -107.2903]
  };

  const stateAbbreviations = {
    " al": "alabama", " az": "arizona", " ar": "arkansas", " ca": "california",
    " co": "colorado", " ct": "connecticut", " de": "delaware", " fl": "florida",
    " ga": "georgia", " id": "idaho", " il": "illinois", " in": "indiana",
    " ia": "iowa", " ks": "kansas", " ky": "kentucky", " la": "louisiana",
    " me": "maine", " md": "maryland", " ma": "massachusetts", " mi": "michigan",
    " mn": "minnesota", " ms": "mississippi", " mo": "missouri", " mt": "montana",
    " ne": "nebraska", " nv": "nevada", " nh": "new hampshire", " nj": "new jersey",
    " nm": "new mexico", " ny": "new york", " nc": "north carolina",
    " nd": "north dakota", " oh": "ohio", " ok": "oklahoma", " or": "oregon",
    " pa": "pennsylvania", " ri": "rhode island", " sc": "south carolina",
    " sd": "south dakota", " tn": "tennessee", " tx": "texas", " ut": "utah",
    " vt": "vermont", " va": "virginia", " wa": "washington state",
    " wv": "west virginia", " wi": "wisconsin", " wy": "wyoming"
  };

  let map = null;
  let markerLayer = null;
  let allData = [];
  let currentRange = "24h";
  let currentType = "all";
  let tileLoaded = false;

  function el(id) {
    return document.getElementById(id);
  }

  function showOnlyState(id) {
    ["ice-map-loading", "ice-map-empty", "ice-map-error"].forEach((name) => {
      const node = el(name);
      if (node) node.classList.toggle("hidden", name !== id);
    });
  }

  function hideMapStates() {
    ["ice-map-loading", "ice-map-empty", "ice-map-error"].forEach((name) => {
      el(name)?.classList.add("hidden");
    });
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.,，。;；:：()（）]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function coordinateFor(item) {
    const lat = number(item.lat ?? item.latitude);
    const lng = number(item.lng ?? item.lon ?? item.longitude);
    if (lat !== null && lng !== null) return [lat, lng];

    if (Array.isArray(item.coordinates) && item.coordinates.length >= 2) {
      const first = number(item.coordinates[0]);
      const second = number(item.coordinates[1]);
      if (first !== null && second !== null) {
        return Math.abs(first) > 90 ? [second, first] : [first, second];
      }
    }

    const location = normalize(
      item.location || item.city || item.state || item.place || item.address
    );
    if (!location) return null;

    const exact = PLACE_COORDINATES[location];
    if (exact) return exact;

    const match = Object.keys(PLACE_COORDINATES)
      .sort((a, b) => b.length - a.length)
      .find((key) => location.includes(key));
    if (match) return PLACE_COORDINATES[match];

    const padded = ` ${location} `;
    const abbreviation = Object.keys(stateAbbreviations)
      .find((key) => padded.includes(`${key} `) || padded.endsWith(`${key.trim()} `));
    if (abbreviation) return PLACE_COORDINATES[stateAbbreviations[abbreviation]];

    return null;
  }

  function itemTime(item) {
    const value = item.time || item.created_at || item.date || item.published_at;
    const time = new Date(value || 0);
    return Number.isNaN(time.getTime()) ? null : time;
  }

  function itemType(item) {
    const explicit = normalize(item.type || item.action_type || item.event_type);
    const text = normalize(`${item.title || ""} ${item.summary || ""} ${explicit}`);

    if (
      explicit === "arrest" ||
      /arrest|detain|detention|custody|raid|抓捕|拘留|羁押/.test(text)
    ) return "arrest";

    if (
      explicit === "removal" ||
      /removal|removed|deport|repatriat|遣返|递解|驱逐/.test(text)
    ) return "removal";

    return "other";
  }

  function withinRange(item) {
    const time = itemTime(item);
    if (!time) return currentRange === "30d";

    const hours = {
      "24h": 24,
      "7d": 24 * 7,
      "30d": 24 * 30
    }[currentRange] || 24;

    return Date.now() - time.getTime() <= hours * 60 * 60 * 1000;
  }

  function filteredData() {
    return allData.filter((item) => {
      const typeMatches = currentType === "all" || itemType(item) === currentType;
      return typeMatches && withinRange(item);
    });
  }

  function markerStyle(type, count) {
    const colors = {
      arrest: { fillColor: "#d92d20", color: "#7a271a" },
      removal: { fillColor: "#175cd3", color: "#1849a9" },
      other: { fillColor: "#7f56d9", color: "#53389e" }
    };
    const color = colors[type] || colors.other;
    return {
      ...color,
      fillOpacity: 0.88,
      opacity: 1,
      weight: 2,
      radius: Math.min(17, 7 + Math.sqrt(Math.max(1, count)) * 2)
    };
  }

  function formatTime(value) {
    const time = itemTime(value);
    if (!time) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(time);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function popupHtml(item) {
    const count = Number(item.people || item.arrests || item.count || 0);
    const location = item.location || item.city || item.state || "地点待确认";
    const source = item.source || item.source_account || "公开信源";
    return `
      <article class="ice-map-popup">
        <span class="popup-type popup-${itemType(item)}">${escapeHtml(typeLabel(itemType(item)))}</span>
        <h3>${escapeHtml(item.title || "ICE执法动态")}</h3>
        <p>${escapeHtml(item.summary || "")}</p>
        <dl>
          <div><dt>地点</dt><dd>${escapeHtml(location)}</dd></div>
          <div><dt>时间</dt><dd>${escapeHtml(formatTime(item))}</dd></div>
          ${count > 0 ? `<div><dt>确认人数</dt><dd>${count}人</dd></div>` : ""}
          <div><dt>来源</dt><dd>${escapeHtml(source)}</dd></div>
        </dl>
      </article>
    `;
  }

  function typeLabel(type) {
    return {
      arrest: "抓捕/拘留",
      removal: "遣返",
      other: "其他行动"
    }[type] || "其他行动";
  }

  function initMap() {
    if (!window.L || !el("ice-map")) {
      showOnlyState("ice-map-error");
      return false;
    }

    map = L.map("ice-map", {
      center: [38.8, -96.5],
      zoom: 4,
      minZoom: 4,
      maxZoom: 10,
      maxBounds: USA_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      zoomControl: true,
      attributionControl: true
    });

    map.fitBounds(USA_BOUNDS, { padding: [4, 4] });

    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 4,
      maxZoom: 10,
      noWrap: true,
      bounds: USA_BOUNDS,
      attribution: "&copy; OpenStreetMap contributors"
    });

    tiles.on("load", () => {
      tileLoaded = true;
      if (!filteredData().some((item) => coordinateFor(item))) {
        showOnlyState("ice-map-empty");
      } else {
        hideMapStates();
      }
    });

    tiles.on("tileerror", () => {
      if (!tileLoaded) showOnlyState("ice-map-error");
    });

    tiles.addTo(map);

    L.polygon(USA_OUTLINE, {
      color: "#175cd3",
      weight: 2,
      opacity: 0.7,
      fillColor: "#2e90fa",
      fillOpacity: 0.04,
      interactive: false
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);

    setTimeout(() => {
      map.invalidateSize();
      if (!tileLoaded && el("ice-map-loading") && !el("ice-map-loading").classList.contains("hidden")) {
        showOnlyState("ice-map-error");
      }
    }, 5000);

    window.addEventListener("resize", () => map?.invalidateSize());
    return true;
  }

  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();

    const visible = filteredData();
    const mapped = visible
      .map((item) => ({ item, coordinates: coordinateFor(item) }))
      .filter((entry) => {
        if (!entry.coordinates) return false;
        const [lat, lng] = entry.coordinates;
        return lat >= 24.2 && lat <= 49.7 && lng >= -125.0 && lng <= -66.4;
      });

    mapped.forEach(({ item, coordinates }) => {
      const count = Number(item.people || item.arrests || item.count || 1);
      L.circleMarker(coordinates, markerStyle(itemType(item), count))
        .bindPopup(popupHtml(item), {
          maxWidth: 320,
          className: "ice-popup-shell"
        })
        .addTo(markerLayer);
    });

    if (mapped.length === 0) {
      showOnlyState("ice-map-empty");
      map.fitBounds(USA_BOUNDS, { padding: [4, 4] });
      return;
    }

    hideMapStates();

    if (mapped.length === 1) {
      map.setView(mapped[0].coordinates, 5, { animate: true });
    } else {
      const bounds = L.latLngBounds(mapped.map((entry) => entry.coordinates));
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: 6,
        animate: true
      });
    }
  }

  function bindTabs() {
    document.querySelectorAll(".range-tabs [data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        currentRange = button.dataset.range || "24h";
        document.querySelectorAll(".range-tabs [data-range]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderMarkers();
      });
    });

    document.querySelectorAll(".type-tabs [data-type]").forEach((button) => {
      button.addEventListener("click", () => {
        currentType = button.dataset.type || "all";
        document.querySelectorAll(".type-tabs [data-type]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderMarkers();
      });
    });
  }

  function updateNewYorkClock() {
    const now = new Date();
    const time = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(now);

    const date = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).format(now);

    if (el("ny-time")) el("ny-time").textContent = time;
    if (el("ny-date")) el("ny-date").textContent = date;
  }

  async function loadData() {
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`ICE数据读取失败：${response.status}`);
      const data = await response.json();
      allData = Array.isArray(data) ? data : [];
      renderMarkers();
    } catch (error) {
      console.error(error);
      allData = [];
      showOnlyState("ice-map-empty");
    }
  }

  async function start() {
    updateNewYorkClock();
    setInterval(updateNewYorkClock, 1000);
    bindTabs();

    if (!initMap()) return;
    await loadData();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        map?.invalidateSize();
        loadData();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", start);
})();

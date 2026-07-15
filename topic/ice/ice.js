(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 12;
  const REFRESH_MS = 60000;
  const USA_BOUNDS = window.L ? L.latLngBounds(L.latLng(24.2, -125), L.latLng(49.7, -66.4)) : null;

  const PLACES = {
    "new york city":[40.7128,-74.006],"new york":[40.7128,-74.006],"nyc":[40.7128,-74.006],"纽约":[40.7128,-74.006],"布鲁克林":[40.6782,-73.9442],"皇后区":[40.7282,-73.7949],"法拉盛":[40.7675,-73.8331],
    "los angeles":[34.0522,-118.2437],"洛杉矶":[34.0522,-118.2437],"chicago":[41.8781,-87.6298],"芝加哥":[41.8781,-87.6298],"houston":[29.7604,-95.3698],"休斯敦":[29.7604,-95.3698],
    "phoenix":[33.4484,-112.074],"philadelphia":[39.9526,-75.1652],"费城":[39.9526,-75.1652],"san antonio":[29.4241,-98.4936],"san diego":[32.7157,-117.1611],"圣迭戈":[32.7157,-117.1611],
    "dallas":[32.7767,-96.797],"达拉斯":[32.7767,-96.797],"austin":[30.2672,-97.7431],"san francisco":[37.7749,-122.4194],"旧金山":[37.7749,-122.4194],"seattle":[47.6062,-122.3321],
    "denver":[39.7392,-104.9903],"washington dc":[38.9072,-77.0369],"华盛顿":[38.9072,-77.0369],"boston":[42.3601,-71.0589],"波士顿":[42.3601,-71.0589],"miami":[25.7617,-80.1918],"迈阿密":[25.7617,-80.1918],
    "atlanta":[33.749,-84.388],"detroit":[42.3314,-83.0458],"minneapolis":[44.9778,-93.265],"portland":[45.5152,-122.6784],"las vegas":[36.1699,-115.1398],"new orleans":[29.9511,-90.0715],
    "baltimore":[39.2904,-76.6122],"cleveland":[41.4993,-81.6944],"sacramento":[38.5816,-121.4944],"el paso":[31.7619,-106.485],
    "california":[36.7783,-119.4179],"texas":[31.9686,-99.9018],"florida":[27.6648,-81.5158],"illinois":[40.6331,-89.3985],"arizona":[34.0489,-111.0937],"maine":[45.2538,-69.4455],
    "massachusetts":[42.4072,-71.3824],"new jersey":[40.0583,-74.4057],"pennsylvania":[41.2033,-77.1945],"virginia":[37.4316,-78.6569],"georgia":[32.1656,-82.9001],"colorado":[39.5501,-105.7821],
    "washington state":[47.4009,-120.7401],"oregon":[43.8041,-120.5542],"nevada":[38.8026,-116.4194],"ohio":[40.4173,-82.9071],"michigan":[44.3148,-85.6024],"minnesota":[46.7296,-94.6859]
  };

  const el = (id) => document.getElementById(id);
  let allData = [];
  let visibleCount = PAGE_SIZE;
  let currentRange = "24h";
  let currentType = "all";
  let map = null;
  let markerLayer = null;

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[.,，。;；:：()（）]/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseMetadata(value) {
    if (value && typeof value === "object") return value;
    try { return typeof value === "string" ? JSON.parse(value) : {}; } catch { return {}; }
  }
  function inferType(item) {
    const text = normalize(`${item.event_type || ""} ${item.title || ""} ${item.summary || ""}`);
    if (/arrest|detain|detention|custody|raid|apprehend|抓捕|拘留|羁押|逮捕|带走/.test(text)) return "arrest";
    if (/removal|removed|deport|repatriat|遣返|递解|驱逐/.test(text)) return "removal";
    return "other";
  }
  function textCount(text) {
    const source = String(text || "");
    const patterns = [
      /(?:逮捕|抓捕|拘留|羁押|扣押|带走|押送)[^。；;，,]{0,18}?(\d{1,3})\s*(?:名|人|位)/,
      /(\d{1,3})\s*(?:名|人|位)[^。；;，,]{0,18}?(?:被捕|被拘留|遭拘留|被带走|被押送)/,
      /\b(?:arrested|detained|apprehended|took into custody)\s+(\d{1,3})\b/i,
      /\b(\d{1,3})\s+(?:people|persons|men|women|migrants|immigrants)[^.!?]{0,24}\b(?:arrested|detained|apprehended)\b/i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = Number(match?.[1]);
      if (value > 0 && value <= 500) return { value, estimated: false };
    }
    if (/(?:一名|一位|1名|1位|一人|a man|a woman|one man|one woman|one person|a detainee)/i.test(source) && /(拘留|羁押|被捕|逮捕|带走|押送|detain|arrest|custody)/i.test(source)) return { value: 1, estimated: false };
    if (/(?:两名|两人|2名|2人|two people|two men|two women)/i.test(source) && /(拘留|羁押|被捕|逮捕|detain|arrest|custody)/i.test(source)) return { value: 2, estimated: false };
    if (/数十(?:名|人)|dozens/i.test(source)) return { value: 20, estimated: true };
    if (/近百(?:名|人)|nearly one hundred/i.test(source)) return { value: 90, estimated: true };
    if (/数百(?:名|人)|hundreds/i.test(source)) return { value: 200, estimated: true };
    return { value: 0, estimated: false };
  }
  function mapArticle(row) {
    const metadata = parseMetadata(row.metadata);
    const fallback = textCount(`${row.title || ""} ${row.summary || ""} ${row.content || ""}`);
    const candidates = [metadata.people_count, metadata.detained_count, metadata.arrested_count, metadata.removed_count, row.arrest_count]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 500);
    const people = candidates.length ? Math.max(...candidates) : fallback.value;
    const location = metadata.location_text || [metadata.city || row.city, metadata.state_code || row.state].filter(Boolean).join(", ");
    const item = {
      id: row.id,
      title: row.title || "ICE执法动态",
      summary: row.summary || String(row.content || "").replace(/\s+/g, " ").slice(0, 220),
      content: row.content || "",
      image: row.cover_image || "",
      time: row.published_at || row.source_created_at || row.event_date || row.created_at || "",
      source: row.source_account ? `@${row.source_account}` : (row.source_name || "唐人日报编辑部"),
      article_url: `/article.html?id=${encodeURIComponent(row.id)}`,
      location,
      city: metadata.city || row.city || "",
      state: metadata.state_code || row.state || "",
      people,
      estimated: Boolean(metadata.people_count_estimated || metadata.estimated_count || (!candidates.length && fallback.estimated)),
      lat: metadata.lat,
      lng: metadata.lng,
      event_type: metadata.event_type || ""
    };
    item.type = inferType(item);
    return item;
  }
  async function fetchIceArticles(limit = 200) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", "id,title,summary,content,cover_image,published_at,created_at,source_account,source_name,source_url,source_created_at,event_date,arrest_count,city,state,metadata,topic_key,status");
    url.searchParams.set("topic_key", "eq.ice");
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json",
        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase ${response.status}: ${detail}`);
    }

    const rows = await response.json();
    return (Array.isArray(rows) ? rows : []).map(mapArticle);
  }
  function itemTime(item) {
    const date = new Date(item.time || 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function rangeHours() { return { "24h": 24, "7d": 168, "30d": 720 }[currentRange] || 24; }
  function withinRange(item) {
    const time = itemTime(item);
    return Boolean(time) && Date.now() - time.getTime() <= rangeHours() * 3600000;
  }
  function rangeData(ignoreType = false) {
    return allData.filter((item) => withinRange(item) && (ignoreType || currentType === "all" || item.type === currentType));
  }
  function rangeLabel() { return { "24h": "近24小时", "7d": "近7天", "30d": "近30天" }[currentRange] || "近24小时"; }
  function updateStats() {
    const items = rangeData();
    const people = items.reduce((sum, item) => sum + Math.max(0, Number(item.people || 0)), 0);
    const estimated = items.some((item) => item.estimated && item.people > 0);
    const locations = new Set(items.map((item) => normalize(item.location || item.city || item.state)).filter(Boolean));
    if (el("people-stat-label")) el("people-stat-label").textContent = `${rangeLabel()}涉及人数`;
    if (el("places-stat-label")) el("places-stat-label").textContent = `${rangeLabel()}涉及地点`;
    if (el("today-count")) el("today-count").textContent = `${estimated ? "约" : ""}${people}人`;
    if (el("today-places")) el("today-places").textContent = `${locations.size}处`;
    if (el("stats-note")) el("stats-note").textContent = estimated ? "含保守估算值，数据仅供参考" : "根据已发布信息自动汇总";
  }
  function formatTime(item) {
    const time = itemTime(item);
    if (!time) return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
  }
  function renderNews() {
    const box = el("ice-news-list");
    if (!box) return;
    const data = rangeData();
    const items = data.slice(0, visibleCount);
    box.innerHTML = items.length ? items.map((item) => {
      const image = item.image ? `<a href="${escapeHtml(item.article_url)}"><img class="ice-news-thumb" src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>` : "";
      const count = item.people > 0 ? `<span>涉及${item.estimated ? "约" : ""}${item.people}人</span>` : "";
      return `<article class="ice-news-item ${item.image ? "" : "no-image"}">${image}<div class="ice-news-copy"><h3><a href="${escapeHtml(item.article_url)}">${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.summary)}</p><div class="ice-news-source">${escapeHtml(formatTime(item))} · 来源：${escapeHtml(item.source)} ${count}</div></div></article>`;
    }).join("") : `<article class="ice-news-item no-image"><div class="ice-news-copy"><h3>暂无符合当前筛选条件的ICE动态</h3><p>页面每分钟自动读取数据库；新内容成功发布后会自动显示。</p></div></article>`;
    if (el("load-more")) el("load-more").hidden = visibleCount >= data.length;
  }
  function coordinateFor(item) {
    const lat = Number(item.lat), lng = Number(item.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    const text = normalize(`${item.location} ${item.city} ${item.state} ${item.title} ${item.summary}`);
    const key = Object.keys(PLACES).sort((a,b) => b.length-a.length).find((name) => text.includes(name));
    return key ? PLACES[key] : null;
  }
  function markerStyle(type, people, frequency) {
    const colors = { arrest:["#d92d20","#7a271a"], removal:["#175cd3","#1849a9"], other:["#7f56d9","#53389e"] };
    const [fillColor,color] = colors[type] || colors.other;
    return { fillColor, color, fillOpacity:.86, opacity:1, weight:2, radius:Math.min(24, 6 + Math.sqrt(Math.max(1, people))*1.4 + Math.sqrt(Math.max(1, frequency))*2.5) };
  }
  function showMapState(id) {
    ["ice-map-loading","ice-map-empty","ice-map-error"].forEach((name) => el(name)?.classList.toggle("hidden", name !== id));
  }
  function hideMapStates() { ["ice-map-loading","ice-map-empty","ice-map-error"].forEach((name) => el(name)?.classList.add("hidden")); }
  function typeLabel(type) { return { arrest:"抓捕/拘留", removal:"遣返", other:"其他行动" }[type] || "其他行动"; }
  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const groups = new Map();
    for (const item of rangeData()) {
      const coords = coordinateFor(item);
      if (!coords || coords[0] < 24.2 || coords[0] > 49.7 || coords[1] < -125 || coords[1] > -66.4) continue;
      const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)}`;
      const group = groups.get(key) || { coords, items:[], people:0, estimated:false, type:item.type };
      group.items.push(item); group.people += Number(item.people || 0); group.estimated ||= item.estimated; groups.set(key, group);
    }
    for (const group of groups.values()) {
      const latest = group.items.sort((a,b) => new Date(b.time)-new Date(a.time))[0];
      const location = latest.location || latest.city || latest.state || "地点待确认";
      const popup = `<article class="ice-map-popup"><span class="popup-type popup-${escapeHtml(group.type)}">${typeLabel(group.type)}</span><h3>${escapeHtml(location)}</h3><p>${rangeLabel()}发生${group.items.length}起相关行动</p><dl><div><dt>涉及人数</dt><dd>${group.estimated ? "约" : ""}${group.people}人</dd></div><div><dt>最近动态</dt><dd><a href="${escapeHtml(latest.article_url)}">${escapeHtml(latest.title)}</a></dd></div></dl></article>`;
      L.circleMarker(group.coords, markerStyle(group.type, group.people, group.items.length)).bindPopup(popup, { maxWidth:320, className:"ice-popup-shell" }).addTo(markerLayer);
    }
    if (!groups.size) { showMapState("ice-map-empty"); map.fitBounds(USA_BOUNDS, { padding:[4,4] }); return; }
    hideMapStates();
    const coords = [...groups.values()].map((g) => g.coords);
    if (coords.length === 1) map.setView(coords[0], 5); else map.fitBounds(L.latLngBounds(coords), { padding:[36,36], maxZoom:6 });
  }
  function initMap() {
    if (!window.L || !el("ice-map") || !USA_BOUNDS) return showMapState("ice-map-error");
    map = L.map("ice-map", { center:[38.8,-96.5], zoom:4, minZoom:4, maxZoom:10, maxBounds:USA_BOUNDS, maxBoundsViscosity:1, worldCopyJump:false });
    map.fitBounds(USA_BOUNDS, { padding:[4,4] });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { minZoom:4, maxZoom:10, noWrap:true, bounds:USA_BOUNDS, attribution:"&copy; OpenStreetMap contributors" }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  function updateClock() {
    const now = new Date();
    if (el("ny-time")) el("ny-time").textContent = new Intl.DateTimeFormat("zh-CN", { timeZone:"America/New_York", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(now);
    if (el("ny-date")) el("ny-date").textContent = new Intl.DateTimeFormat("zh-CN", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit", weekday:"short" }).format(now);
  }
  function renderAll() { updateStats(); renderNews(); renderMarkers(); }
  async function reloadData() {
    try { allData = await fetchIceArticles(); window.TRRB_ICE_DATA = allData; renderAll(); }
    catch (error) { console.error("ICE实时数据加载失败", error); if (!allData.length) { renderNews(); showMapState("ice-map-error"); } }
  }
  function bindControls() {
    document.querySelectorAll(".range-tabs [data-range]").forEach((button) => button.addEventListener("click", () => {
      currentRange = button.dataset.range || "24h"; visibleCount = PAGE_SIZE;
      document.querySelectorAll(".range-tabs [data-range]").forEach((item) => item.classList.toggle("active", item === button)); renderAll();
    }));
    document.querySelectorAll(".type-tabs [data-type]").forEach((button) => button.addEventListener("click", () => {
      currentType = button.dataset.type || "all"; visibleCount = PAGE_SIZE;
      document.querySelectorAll(".type-tabs [data-type]").forEach((item) => item.classList.toggle("active", item === button)); renderAll();
    }));
    el("load-more")?.addEventListener("click", () => { visibleCount += PAGE_SIZE; renderNews(); });
  }
  async function start() {
    updateClock(); setInterval(updateClock, 1000); bindControls(); initMap(); await reloadData(); setInterval(reloadData, REFRESH_MS);
  }
  document.addEventListener("DOMContentLoaded", start);
})();
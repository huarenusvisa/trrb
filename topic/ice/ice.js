(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const PAGE_SIZE = 12;
  const REFRESH_MS = 60000;
  const DEFAULT_US_BOUNDS = window.L ? L.latLngBounds(L.latLng(24.2, -125), L.latLng(49.7, -66.4)) : null;
  const EXTENDED_US_BOUNDS = window.L ? L.latLngBounds(L.latLng(17, -171), L.latLng(72, -50)) : null;

  const PLACES = {
    "new york city":[40.7128,-74.006],"new york":[40.7128,-74.006],"nyc":[40.7128,-74.006],"纽约":[40.7128,-74.006],"brooklyn":[40.6782,-73.9442],"布鲁克林":[40.6782,-73.9442],"queens":[40.7282,-73.7949],"皇后区":[40.7282,-73.7949],"flushing":[40.7675,-73.8331],"法拉盛":[40.7675,-73.8331],
    "los angeles":[34.0522,-118.2437],"洛杉矶":[34.0522,-118.2437],"chicago":[41.8781,-87.6298],"芝加哥":[41.8781,-87.6298],"houston":[29.7604,-95.3698],"休斯敦":[29.7604,-95.3698],
    "phoenix":[33.4484,-112.074],"philadelphia":[39.9526,-75.1652],"费城":[39.9526,-75.1652],"san antonio":[29.4241,-98.4936],"san diego":[32.7157,-117.1611],"圣迭戈":[32.7157,-117.1611],
    "dallas":[32.7767,-96.797],"达拉斯":[32.7767,-96.797],"austin":[30.2672,-97.7431],"san francisco":[37.7749,-122.4194],"旧金山":[37.7749,-122.4194],"seattle":[47.6062,-122.3321],
    "oroville washington":[48.9393,-119.4363],"oroville wa":[48.9393,-119.4363],"oroville":[48.9393,-119.4363],"华州oroville":[48.9393,-119.4363],
    "berkeley california":[37.8715,-122.273],"berkeley ca":[37.8715,-122.273],"berkeley":[37.8715,-122.273],"伯克利":[37.8715,-122.273],
    "milwaukee wisconsin":[43.0389,-87.9065],"milwaukee wi":[43.0389,-87.9065],"milwaukee":[43.0389,-87.9065],"密尔沃基":[43.0389,-87.9065],
    "denver":[39.7392,-104.9903],"washington dc":[38.9072,-77.0369],"华盛顿特区":[38.9072,-77.0369],"boston":[42.3601,-71.0589],"波士顿":[42.3601,-71.0589],"miami":[25.7617,-80.1918],"迈阿密":[25.7617,-80.1918],
    "atlanta":[33.749,-84.388],"detroit":[42.3314,-83.0458],"minneapolis":[44.9778,-93.265],"portland":[45.5152,-122.6784],"las vegas":[36.1699,-115.1398],"new orleans":[29.9511,-90.0715],
    "baltimore":[39.2904,-76.6122],"cleveland":[41.4993,-81.6944],"sacramento":[38.5816,-121.4944],"el paso":[31.7619,-106.485],"biddeford":[43.4926,-70.4534],
    "anchorage":[61.2181,-149.9003],"honolulu":[21.3099,-157.8581],"san juan puerto rico":[18.4655,-66.1057],"san juan":[18.4655,-66.1057],
    "california":[36.7783,-119.4179],"texas":[31.9686,-99.9018],"florida":[27.6648,-81.5158],"illinois":[40.6331,-89.3985],"arizona":[34.0489,-111.0937],"maine":[45.2538,-69.4455],
    "massachusetts":[42.4072,-71.3824],"new jersey":[40.0583,-74.4057],"pennsylvania":[41.2033,-77.1945],"virginia":[37.4316,-78.6569],"georgia":[32.1656,-82.9001],"colorado":[39.5501,-105.7821],
    "washington state":[47.4009,-120.7401],"oregon":[43.8041,-120.5542],"nevada":[38.8026,-116.4194],"ohio":[40.4173,-82.9071],"michigan":[44.3148,-85.6024],"minnesota":[46.7296,-94.6859],
    "wisconsin":[44.5,-89.5],"montana":[46.8797,-110.3626],"north carolina":[35.7596,-79.0193],"south carolina":[33.8361,-80.8987],"tennessee":[35.5175,-86.5804],"kentucky":[37.8393,-84.27],
    "alabama":[32.8067,-86.7911],"mississippi":[32.3547,-89.3985],"louisiana":[31.2448,-92.145],"arkansas":[34.9697,-92.3731],"oklahoma":[35.4676,-97.5164],"kansas":[38.5266,-96.7265],
    "nebraska":[41.4925,-99.9018],"iowa":[41.878,-93.0977],"missouri":[38.5767,-92.1735],"indiana":[40.2672,-86.1349],"west virginia":[38.5976,-80.4549],"maryland":[39.0458,-76.6413],
    "delaware":[38.9108,-75.5277],"connecticut":[41.6032,-73.0877],"rhode island":[41.5801,-71.4774],"vermont":[44.5588,-72.5778],"new hampshire":[43.1939,-71.5724],
    "new mexico":[34.5199,-105.8701],"utah":[39.321,-111.0937],"idaho":[44.0682,-114.742],"wyoming":[43.076,-107.2903],"north dakota":[47.5515,-101.002],"south dakota":[43.9695,-99.9018],
    "alaska":[64.2008,-152.4937],"hawaii":[19.8968,-155.5828],"puerto rico":[18.2208,-66.5901]
  };

  const STATE_CENTERS = {
    AL:[32.8067,-86.7911],AK:[64.2008,-152.4937],AZ:[34.0489,-111.0937],AR:[34.9697,-92.3731],CA:[36.7783,-119.4179],CO:[39.5501,-105.7821],CT:[41.6032,-73.0877],DE:[38.9108,-75.5277],FL:[27.6648,-81.5158],GA:[32.1656,-82.9001],HI:[19.8968,-155.5828],ID:[44.0682,-114.742],IL:[40.6331,-89.3985],IN:[40.2672,-86.1349],IA:[41.878,-93.0977],KS:[38.5266,-96.7265],KY:[37.8393,-84.27],LA:[31.2448,-92.145],ME:[45.2538,-69.4455],MD:[39.0458,-76.6413],MA:[42.4072,-71.3824],MI:[44.3148,-85.6024],MN:[46.7296,-94.6859],MS:[32.3547,-89.3985],MO:[38.5767,-92.1735],MT:[46.8797,-110.3626],NE:[41.4925,-99.9018],NV:[38.8026,-116.4194],NH:[43.1939,-71.5724],NJ:[40.0583,-74.4057],NM:[34.5199,-105.8701],NY:[43,-75],NC:[35.7596,-79.0193],ND:[47.5515,-101.002],OH:[40.4173,-82.9071],OK:[35.4676,-97.5164],OR:[43.8041,-120.5542],PA:[41.2033,-77.1945],RI:[41.5801,-71.4774],SC:[33.8361,-80.8987],SD:[43.9695,-99.9018],TN:[35.5175,-86.5804],TX:[31.9686,-99.9018],UT:[39.321,-111.0937],VT:[44.5588,-72.5778],VA:[37.4316,-78.6569],WA:[47.4009,-120.7401],WV:[38.5976,-80.4549],WI:[44.5,-89.5],WY:[43.076,-107.2903],DC:[38.9072,-77.0369],PR:[18.2208,-66.5901]
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
    if (/removal|removed|deport|repatriat|遣返|递解|驱逐/.test(text)) return "removal";
    if (Number(item.people || 0) > 0) return "arrest";
    return "other";
  }
  function textCount(text) {
    const source = String(text || "");
    const patterns = [
      /(?:逮捕|抓捕|拘留|羁押|扣押|带走|押送)[^。；;，,]{0,24}?(\d{1,3})\s*(?:名|人|位)/,
      /(\d{1,3})\s*(?:名|人|位)[^。；;，,]{0,24}?(?:被捕|被拘留|遭拘留|被带走|被押送|落网)/,
      /\b(?:arrested|detained|apprehended|took into custody|held)\s+(\d{1,3})\b/i,
      /\b(\d{1,3})\s+(?:people|persons|men|women|migrants|immigrants|detainees)[^.!?]{0,30}\b(?:arrested|detained|apprehended|held)\b/i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const value = Number(match?.[1]);
      if (value > 0 && value <= 500) return { value, estimated: false };
    }
    if (/(?:一名|一位|1名|1位|一人|一男子|一女子|a man|a woman|one man|one woman|one person|a detainee|an immigrant)/i.test(source) && /(拘留|羁押|被捕|逮捕|带走|押送|落网|detain|arrest|custody|apprehend|held)/i.test(source)) return { value: 1, estimated: false };
    if (/(?:两名|两人|2名|2人|two people|two men|two women)/i.test(source) && /(拘留|羁押|被捕|逮捕|detain|arrest|custody|apprehend)/i.test(source)) return { value: 2, estimated: false };
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
    const city = metadata.city || row.city || "";
    const state = metadata.state_code || row.state || "";
    const location = metadata.location_text || metadata.location || [city, state].filter(Boolean).join(", ");
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
      city,
      state,
      people,
      estimated: Boolean(metadata.people_count_estimated || metadata.estimated_count || (!candidates.length && fallback.estimated)),
      lat: metadata.lat ?? metadata.latitude,
      lng: metadata.lng ?? metadata.longitude,
      event_type: metadata.event_type || ""
    };
    item.type = inferType(item);
    return item;
  }
  async function fetchIceArticles(limit = 500) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set("select", "id,title,summary,content,cover_image,published_at,created_at,source_account,source_name,source_url,source_created_at,event_date,arrest_count,city,state,metadata,topic_key,status");
    url.searchParams.set("topic_key", "eq.ice");
    url.searchParams.set("status", "eq.published");
    url.searchParams.set("order", "published_at.desc.nullslast,created_at.desc");
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: "application/json", "Cache-Control": "no-cache" }
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
    if (key) return PLACES[key];
    const stateCode = String(item.state || "").trim().toUpperCase();
    if (STATE_CENTERS[stateCode]) return STATE_CENTERS[stateCode];
    return null;
  }
  function markerStyle(type, people, frequency) {
    const colors = { arrest:["#d92d20","#7a271a"], removal:["#175cd3","#1849a9"], other:["#7f56d9","#53389e"] };
    const [fillColor,color] = colors[type] || colors.other;
    return { fillColor, color, fillOpacity:.88, opacity:1, weight:2, radius:Math.min(26, 7 + Math.sqrt(Math.max(1, people))*1.55 + Math.sqrt(Math.max(1, frequency))*2.3) };
  }
  function showMapState(id) {
    ["ice-map-loading","ice-map-empty","ice-map-error"].forEach((name) => el(name)?.classList.toggle("hidden", name !== id));
  }
  function hideMapStates() { ["ice-map-loading","ice-map-empty","ice-map-error"].forEach((name) => el(name)?.classList.add("hidden")); }
  function typeLabel(type) { return { arrest:"抓捕/拘留", removal:"遣返", other:"其他行动" }[type] || "其他行动"; }
  function groupType(items) {
    if (items.some((item) => item.type === "removal")) return "removal";
    if (items.some((item) => Number(item.people || 0) > 0)) return "arrest";
    return "other";
  }
  function ensureCoverageBadge() {
    const shell = el("ice-map")?.parentElement;
    if (!shell) return null;
    let badge = el("ice-map-coverage");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "ice-map-coverage";
      badge.style.cssText = "position:absolute;left:12px;top:12px;z-index:650;background:rgba(255,255,255,.94);border:1px solid #d0d5dd;border-radius:10px;padding:7px 10px;font-size:12px;line-height:1.45;color:#344054;box-shadow:0 2px 8px rgba(16,24,40,.12);max-width:78%;pointer-events:none";
      shell.appendChild(badge);
    }
    return badge;
  }
  function renderMarkers() {
    if (!map || !markerLayer) return;
    markerLayer.clearLayers();
    const groups = new Map();
    const items = rangeData();
    let mappedPeople = 0;
    let unmappedPeople = 0;

    for (const item of items) {
      const coords = coordinateFor(item);
      if (!coords || !EXTENDED_US_BOUNDS.contains(coords)) {
        if (Number(item.people || 0) > 0) unmappedPeople += Number(item.people || 0);
        continue;
      }
      mappedPeople += Number(item.people || 0);
      const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)}`;
      const group = groups.get(key) || { coords, items:[], people:0, estimated:false, type:"other" };
      group.items.push(item);
      group.people += Number(item.people || 0);
      group.estimated ||= item.estimated;
      group.type = groupType(group.items);
      groups.set(key, group);
    }

    const coverage = ensureCoverageBadge();
    if (coverage) coverage.textContent = `地图已定位${mappedPeople}人${unmappedPeople > 0 ? `；另有${unmappedPeople}人缺少明确地点，已计入总数` : "；全部已定位"}`;

    const markers = [];
    for (const group of groups.values()) {
      group.items.sort((a,b) => new Date(b.time)-new Date(a.time));
      const latest = group.items[0];
      const location = latest.location || latest.city || latest.state || "地点待确认";
      const peopleText = group.people > 0 ? `${group.estimated ? "约" : ""}${group.people}人` : "人数未确认";
      const storyLinks = group.items.slice(0, 8).map((item) => `<li><a href="${escapeHtml(item.article_url)}">${escapeHtml(item.title)}</a><small>${escapeHtml(formatTime(item))}${item.people > 0 ? ` · ${item.estimated ? "约" : ""}${item.people}人` : ""}</small></li>`).join("");
      const more = group.items.length > 8 ? `<p>另有${group.items.length - 8}条相关动态</p>` : "";
      const popup = `<article class="ice-map-popup"><span class="popup-type popup-${escapeHtml(group.type)}">${typeLabel(group.type)}</span><h3>${escapeHtml(location)}</h3><p>${rangeLabel()}发生${group.items.length}起相关行动，涉及${peopleText}</p><ul style="margin:8px 0 0;padding-left:18px;max-height:190px;overflow:auto">${storyLinks}</ul>${more}</article>`;
      const marker = L.circleMarker(group.coords, markerStyle(group.type, group.people, group.items.length))
        .bindPopup(popup, { maxWidth:360, minWidth:260, className:"ice-popup-shell", autoPan:true, keepInView:true, autoPanPadding:[30,90], closeButton:true });
      marker.on("click", () => {
        const targetZoom = Math.max(map.getZoom(), 5);
        map.setView(group.coords, targetZoom, { animate:true });
        setTimeout(() => marker.openPopup(), 180);
      });
      marker.addTo(markerLayer);
      markers.push(marker);
    }

    if (!groups.size) {
      showMapState("ice-map-empty");
      map.fitBounds(DEFAULT_US_BOUNDS, { padding:[12,12] });
      return;
    }
    hideMapStates();
    const coords = [...groups.values()].map((g) => g.coords);
    if (coords.length === 1) map.setView(coords[0], 5);
    else map.fitBounds(L.latLngBounds(coords), { paddingTopLeft:[30,45], paddingBottomRight:[30,85], maxZoom:6 });
  }
  function initMap() {
    if (!window.L || !el("ice-map") || !DEFAULT_US_BOUNDS || !EXTENDED_US_BOUNDS) return showMapState("ice-map-error");
    map = L.map("ice-map", { center:[38.8,-96.5], zoom:4, minZoom:2, maxZoom:11, maxBounds:EXTENDED_US_BOUNDS.pad(0.08), maxBoundsViscosity:.65, worldCopyJump:false });
    map.fitBounds(DEFAULT_US_BOUNDS, { padding:[8,8] });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { minZoom:2, maxZoom:11, noWrap:true, bounds:EXTENDED_US_BOUNDS, attribution:"&copy; OpenStreetMap contributors" }).addTo(map);
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
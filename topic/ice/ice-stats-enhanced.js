(() => {
  "use strict";

  const RANGE_LABELS = { "24h": "近24小时", "7d": "近7天", "30d": "近30天" };
  const MAX_SINGLE_EVENT = 500;
  let capturedMap = null;
  let capturedLayer = null;

  if (window.L) {
    const originalMap = L.map;
    L.map = function (...args) { capturedMap = originalMap.apply(this, args); return capturedMap; };
    const originalLayerGroup = L.layerGroup;
    L.layerGroup = function (...args) { const layer = originalLayerGroup.apply(this, args); capturedLayer = layer; return layer; };
  }

  function itemDate(item) {
    const value = new Date(item.time || 0);
    return Number.isNaN(value.getTime()) ? null : value;
  }
  function inRange(item, range) {
    const date = itemDate(item);
    if (!date) return false;
    const hours = { "24h": 24, "7d": 168, "30d": 720 }[range] || 24;
    const age = Date.now() - date.getTime();
    return age >= 0 && age <= hours * 60 * 60 * 1000;
  }
  function activeRange() { return document.querySelector(".range-tabs [data-range].active")?.dataset.range || "24h"; }
  function activeType() { return document.querySelector(".type-tabs [data-type].active")?.dataset.type || "all"; }
  function sourceText(item) {
    return `${item.title || ""}。${item.summary || ""}。${item.content || ""}`
      .replace(/\b20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}\b/g, " ")
      .replace(/\b20\d{2}年/g, " ")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
      .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
      .replace(/\bA#?\s*\d+/gi, " ");
  }
  function extractPeople(item) {
    const source = sourceText(item);
    const stored = Number(item.people || 0);
    if (stored > 0 && stored <= MAX_SINGLE_EVENT) {
      const close = new RegExp(`(?:逮捕|抓捕|拘留|羁押|被捕|遣返)[^。；;]{0,20}${stored}(?:名|人|位)|${stored}(?:名|人|位)[^。；;]{0,20}(?:被逮捕|被捕|被拘留|遭拘留|羁押)`, "i");
      if (close.test(source)) return { value: stored, kind: item.people_count_type || "exact" };
    }
    const patterns = [
      /(?:逮捕|抓捕|拘留|羁押|扣押|遣返|递解)(?:了|约|至少|超过|逾)?\s*(\d{1,3})\s*(?:名|人|位)/,
      /(\d{1,3})\s*(?:名|人|位)(?:非法移民|移民|男子|女子|嫌疑人|人员|公民)?[^。；;]{0,14}(?:被逮捕|被捕|被拘留|遭拘留|落网|羁押)/,
      /(?:arrested|detained|apprehended|deported)\s+(?:about\s+|at least\s+|more than\s+|over\s+)?(\d{1,3})\s+(?:people|persons|migrants|immigrants|individuals)/i
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match) continue;
      const value = Number(match[1]);
      if (value <= 0 || value > MAX_SINGLE_EVENT) continue;
      return { value, kind: /约|about/i.test(match[0]) ? "estimated" : /至少|超过|逾|at least|more than|over/i.test(match[0]) ? "minimum" : "exact" };
    }
    if (/数百(?:名|人)|hundreds? of/i.test(source)) return { value: 200, kind: "estimated" };
    if (/上百(?:名|人)/.test(source)) return { value: 100, kind: "minimum" };
    if (/近百(?:名|人)/.test(source)) return { value: 90, kind: "estimated" };
    if (/数十|几十|dozens? of/i.test(source)) return { value: 20, kind: "estimated" };
    if (/十余(?:名|人)/.test(source)) return { value: 10, kind: "minimum" };
    return { value: 0, kind: "unknown" };
  }
  function prepareData() {
    const data = Array.isArray(window.TRRB_ICE_DATA) ? window.TRRB_ICE_DATA : [];
    data.forEach((item) => {
      const result = extractPeople(item);
      item.people = result.value;
      item.people_count_type = result.kind;
    });
    return data;
  }
  function filteredItems() {
    const range = activeRange();
    const type = activeType();
    return prepareData().filter((item) => inRange(item, range) && (type === "all" || item.type === type));
  }
  function updateStats() {
    const items = filteredItems();
    let exact = 0, estimated = 0, unknown = 0;
    const places = new Set();
    items.forEach((item) => {
      if (item.people_count_type === "estimated") estimated += Number(item.people || 0);
      else if (["exact", "minimum"].includes(item.people_count_type)) exact += Number(item.people || 0);
      else if (item.type === "arrest") unknown += 1;
      const place = item.location || item.city || item.state;
      if (place) places.add(place);
    });
    const total = exact + estimated;
    const range = activeRange();
    const cards = document.querySelectorAll(".ice-stats article");
    const peopleValue = document.getElementById("today-count");
    const placeValue = document.getElementById("today-places");
    if (cards[0]?.querySelector("b")) cards[0].querySelector("b").textContent = `${RANGE_LABELS[range]}涉及人数`;
    if (cards[1]?.querySelector("b")) cards[1].querySelector("b").textContent = `${RANGE_LABELS[range]}涉及地点`;
    if (peopleValue) {
      peopleValue.textContent = `${estimated ? "约" : ""}${total}人`;
      let note = peopleValue.parentElement?.querySelector(".people-estimate-note");
      if (!note && peopleValue.parentElement) {
        note = document.createElement("small");
        note.className = "people-estimate-note";
        note.style.cssText = "display:block;margin-top:3px;color:#667085;font-size:11px;line-height:1.35";
        peopleValue.insertAdjacentElement("afterend", note);
      }
      if (note) note.textContent = estimated ? `确认/最低${exact}人 · 估算${estimated}人${unknown ? ` · ${unknown}起未公布` : ""}` : (unknown ? `另有${unknown}起行动人数未公布` : "均为明确或最低人数");
    }
    if (placeValue) placeValue.textContent = `${places.size}处`;
  }
  function aggregateMap() {
    if (!capturedMap || !capturedLayer || !window.L) return;
    const layers = capturedLayer.getLayers?.() || [];
    if (!layers.length) return;
    const groups = new Map();
    layers.forEach((layer) => {
      const latlng = layer.getLatLng?.();
      if (!latlng) return;
      const key = `${latlng.lat.toFixed(3)},${latlng.lng.toFixed(3)}`;
      const popup = String(layer.getPopup?.()?.getContent?.() || "");
      const people = Number(popup.match(/确认人数<\/dt><dd>(\d+)人/)?.[1] || 0);
      const type = popup.match(/popup-(arrest|removal|other)/)?.[1] || "other";
      const title = popup.match(/<h3>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, "") || "ICE执法动态";
      const group = groups.get(key) || { latlng, events: 0, people: 0, type, titles: [] };
      group.events += 1;
      group.people += Math.min(MAX_SINGLE_EVENT, people);
      if (group.titles.length < 3) group.titles.push(title);
      if (type === "arrest") group.type = "arrest";
      groups.set(key, group);
    });
    capturedLayer.clearLayers();
    const palette = { arrest: { fillColor: "#d92d20", color: "#7a271a" }, removal: { fillColor: "#175cd3", color: "#1849a9" }, other: { fillColor: "#7f56d9", color: "#53389e" } };
    groups.forEach((group) => {
      const intensity = Math.max(1, group.people) + group.events * 4;
      const radius = Math.min(24, 7 + Math.sqrt(intensity) * 1.7);
      const colors = palette[group.type] || palette.other;
      const label = group.people > 0 ? `约${group.people}人` : "人数未公布";
      const popup = `<article class="ice-map-popup"><span class="popup-type popup-${group.type}">地点汇总</span><h3>${group.events}起ICE行动</h3><p>${group.titles.join("；")}</p><dl><div><dt>时间范围</dt><dd>${RANGE_LABELS[activeRange()]}</dd></div><div><dt>行动次数</dt><dd>${group.events}起</dd></div><div><dt>涉及人数</dt><dd>${label}</dd></div></dl><small>人数为公开明确值、最低值或保守估算，仅供趋势参考。</small></article>`;
      L.circleMarker(group.latlng, { ...colors, fillOpacity: 0.88, opacity: 1, weight: 2, radius }).bindPopup(popup, { maxWidth: 340, className: "ice-popup-shell" }).addTo(capturedLayer);
    });
  }
  function refresh() { updateStats(); setTimeout(aggregateMap, 60); }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".range-tabs [data-range],.type-tabs [data-type]").forEach((button) => button.addEventListener("click", () => setTimeout(refresh, 100)));
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (Array.isArray(window.TRRB_ICE_DATA)) { clearInterval(timer); prepareData(); refresh(); }
      else if (attempts > 120) clearInterval(timer);
    }, 100);
  });
})();

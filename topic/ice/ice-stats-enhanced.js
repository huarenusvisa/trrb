(() => {
  "use strict";

  const RANGE_LABELS = {
    "24h": "近24小时",
    "7d": "近7天",
    "30d": "近30天"
  };

  let capturedMap = null;
  let capturedMarkerLayer = null;

  if (window.L) {
    const originalMap = L.map;
    L.map = function (...args) {
      capturedMap = originalMap.apply(this, args);
      return capturedMap;
    };

    const originalLayerGroup = L.layerGroup;
    L.layerGroup = function (...args) {
      const layer = originalLayerGroup.apply(this, args);
      capturedMarkerLayer = layer;
      return layer;
    };
  }

  function rangeHours(range) {
    return { "24h": 24, "7d": 168, "30d": 720 }[range] || 24;
  }

  function itemDate(item) {
    const value = new Date(item.time || 0);
    return Number.isNaN(value.getTime()) ? null : value;
  }

  function inRange(item, range) {
    const date = itemDate(item);
    if (!date) return false;
    const age = Date.now() - date.getTime();
    return age >= 0 && age <= rangeHours(range) * 60 * 60 * 1000;
  }

  function arrestContext(text) {
    return /(逮捕|抓捕|拘留|羁押|被捕|扣押|遣返|递解|arrest(?:ed|s)?|detain(?:ed|s)?|taken into custody|apprehend(?:ed|s)?|deport(?:ed|s)?)/i.test(text);
  }

  function officerContext(text) {
    return /(特工|探员|警察|执法人员|官员|officers?|agents?|troopers?|deputies?|police|personnel|车辆|直升机|helicopters?|vehicles?)/i.test(text);
  }

  function extractPeople(item) {
    const stored = Number(item.people || 0);
    if (stored > 0) {
      return { value: stored, kind: "exact", source: "数据库记录" };
    }

    const text = `${item.title || ""}。${item.summary || ""}。${item.content || ""}`.replace(/,/g, "");
    if (!arrestContext(text)) return { value: 0, kind: "unknown", source: "" };

    const numericPatterns = [
      /(?:至少|最少|超过|逾|多于|不低于)\s*(\d{1,5})\s*(?:名|人|位)?[^。；;]{0,18}(?:非法移民|移民|嫌疑人|人员|人士|individuals?|migrants?|immigrants?|people|persons?)/i,
      /(\d{1,5})\s*(?:名|人|位)?[^。；;]{0,18}(?:非法移民|移民|嫌疑人|人员|人犯|individuals?|migrants?|immigrants?|people|persons?)[^。；;]{0,22}(?:被逮捕|被捕|被拘留|遭拘留|落网|arrested|detained|apprehended)/i,
      /(?:逮捕|抓捕|拘留|羁押|扣押|遣返|递解|arrested|detained|apprehended|deported)[^。；;]{0,22}?(\d{1,5})\s*(?:名|人|位)?/i
    ];

    for (const pattern of numericPatterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const context = match[0];
      if (officerContext(context) && !/(非法移民|移民|嫌疑人|individuals?|migrants?|immigrants?|people|persons?)/i.test(context)) continue;
      const value = Number(match[1]);
      if (value > 0 && value < 100000) {
        const minimum = /至少|最少|超过|逾|多于|不低于|at least|more than|over/i.test(context);
        return { value, kind: minimum ? "minimum" : "exact", source: context.trim() };
      }
    }

    const estimates = [
      { pattern: /数百(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 200 },
      { pattern: /上百(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 100 },
      { pattern: /近百(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 90 },
      { pattern: /数十(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 20 },
      { pattern: /几十(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 20 },
      { pattern: /十余(?:名|人|位)?[^。；;]{0,20}(?:被捕|逮捕|拘留|羁押|移民|人员)/, value: 10 },
      { pattern: /dozens? of [^.;]{0,30}(?:arrested|detained|migrants?|immigrants?|people)/i, value: 20 },
      { pattern: /hundreds? of [^.;]{0,30}(?:arrested|detained|migrants?|immigrants?|people)/i, value: 200 }
    ];

    for (const estimate of estimates) {
      if (estimate.pattern.test(text)) return { value: estimate.value, kind: "estimated", source: "模糊数量保守估算" };
    }

    return { value: 0, kind: "unknown", source: "" };
  }

  function prepareData() {
    const data = Array.isArray(window.TRRB_ICE_DATA) ? window.TRRB_ICE_DATA : [];
    data.forEach((item) => {
      const result = extractPeople(item);
      item.people = result.value;
      item.people_count_type = result.kind;
      item.people_count_source = result.source;
    });
    return data;
  }

  function activeRange() {
    return document.querySelector(".range-tabs [data-range].active")?.dataset.range || "24h";
  }

  function activeType() {
    return document.querySelector(".type-tabs [data-type].active")?.dataset.type || "all";
  }

  function updateStats() {
    const range = activeRange();
    const type = activeType();
    const items = prepareData().filter((item) => inRange(item, range) && (type === "all" || item.type === type));
    const exact = items.filter((item) => item.people_count_type === "exact" || item.people_count_type === "minimum")
      .reduce((sum, item) => sum + Number(item.people || 0), 0);
    const estimated = items.filter((item) => item.people_count_type === "estimated")
      .reduce((sum, item) => sum + Number(item.people || 0), 0);
    const total = exact + estimated;
    const places = new Set(items.map((item) => item.location || item.city || item.state).filter(Boolean));
    const unknown = items.filter((item) => item.type === "arrest" && !Number(item.people || 0)).length;
    const label = RANGE_LABELS[range];

    const statCards = document.querySelectorAll(".ice-stats article");
    const peopleLabel = statCards[0]?.querySelector("b");
    const placeLabel = statCards[1]?.querySelector("b");
    const peopleValue = document.getElementById("today-count");
    const placeValue = document.getElementById("today-places");

    if (peopleLabel) peopleLabel.textContent = `${label}涉及人数`;
    if (placeLabel) placeLabel.textContent = `${label}涉及地点`;
    if (peopleValue) {
      peopleValue.textContent = `${estimated > 0 ? "约" : ""}${total}人`;
      peopleValue.title = estimated > 0
        ? `确认/最低值${exact}人，保守估算${estimated}人${unknown ? `，另有${unknown}起行动人数未公布` : ""}`
        : `${exact}人${unknown ? `；另有${unknown}起行动人数未公布` : ""}`;
      let note = peopleValue.parentElement?.querySelector(".people-estimate-note");
      if (!note && peopleValue.parentElement) {
        note = document.createElement("small");
        note.className = "people-estimate-note";
        note.style.cssText = "display:block;margin-top:3px;color:#667085;font-size:11px;line-height:1.35";
        peopleValue.insertAdjacentElement("afterend", note);
      }
      if (note) note.textContent = estimated > 0
        ? `确认/最低${exact}人 · 估算${estimated}人${unknown ? ` · ${unknown}起未公布` : ""}`
        : `${unknown ? `另有${unknown}起行动人数未公布` : "均为已提取的明确或最低人数"}`;
    }
    if (placeValue) placeValue.textContent = `${places.size}处`;
  }

  function aggregateMapMarkers() {
    if (!capturedMap || !capturedMarkerLayer || !window.L) return;
    const layers = capturedMarkerLayer.getLayers?.() || [];
    if (!layers.length) return;

    const groups = new Map();
    layers.forEach((layer) => {
      const latlng = layer.getLatLng?.();
      if (!latlng) return;
      const key = `${latlng.lat.toFixed(3)},${latlng.lng.toFixed(3)}`;
      const popup = layer.getPopup?.()?.getContent?.() || "";
      const people = Number(String(popup).match(/确认人数<\/dt><dd>(\d+)人/)?.[1] || 0);
      const type = String(popup).match(/popup-(arrest|removal|other)/)?.[1] || "other";
      const title = String(popup).match(/<h3>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, "") || "ICE执法动态";
      const group = groups.get(key) || { latlng, events: 0, people: 0, type, titles: [] };
      group.events += 1;
      group.people += people;
      if (group.titles.length < 3) group.titles.push(title);
      if (type === "arrest") group.type = "arrest";
      groups.set(key, group);
    });

    capturedMarkerLayer.clearLayers();
    const palette = {
      arrest: { fillColor: "#d92d20", color: "#7a271a" },
      removal: { fillColor: "#175cd3", color: "#1849a9" },
      other: { fillColor: "#7f56d9", color: "#53389e" }
    };

    groups.forEach((group) => {
      const intensity = Math.max(1, group.people) + group.events * 4;
      const radius = Math.min(24, 7 + Math.sqrt(intensity) * 1.7);
      const colors = palette[group.type] || palette.other;
      const label = group.people > 0 ? `约${group.people}人` : "人数未公布";
      const popup = `<article class="ice-map-popup"><span class="popup-type popup-${group.type}">地点汇总</span><h3>${group.events}起ICE行动</h3><p>${group.titles.join("；")}</p><dl><div><dt>时间范围</dt><dd>${RANGE_LABELS[activeRange()]}</dd></div><div><dt>行动次数</dt><dd>${group.events}起</dd></div><div><dt>涉及人数</dt><dd>${label}</dd></div></dl><small>人数包含公开明确数字、最低值及保守估算，仅供趋势参考。</small></article>`;
      L.circleMarker(group.latlng, { ...colors, fillOpacity: 0.88, opacity: 1, weight: 2, radius })
        .bindPopup(popup, { maxWidth: 340, className: "ice-popup-shell" })
        .addTo(capturedMarkerLayer);
    });
  }

  function refreshEnhancedView() {
    updateStats();
    window.setTimeout(aggregateMapMarkers, 40);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".range-tabs [data-range], .type-tabs [data-type]").forEach((button) => {
      button.addEventListener("click", () => window.setTimeout(refreshEnhancedView, 60));
    });

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (Array.isArray(window.TRRB_ICE_DATA)) {
        window.clearInterval(timer);
        prepareData();
        document.querySelector(".range-tabs [data-range].active")?.click();
        window.setTimeout(refreshEnhancedView, 120);
      } else if (attempts > 100) {
        window.clearInterval(timer);
      }
    }, 100);
  });
})();

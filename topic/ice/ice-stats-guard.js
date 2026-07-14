(() => {
  "use strict";

  const RANGE_LABELS = { "24h": "近24小时", "7d": "近7天", "30d": "近30天" };
  const MAX_SINGLE_EVENT = 500;

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
  function cleanSource(item) {
    return `${item.title || ""}。${item.summary || ""}。${item.content || ""}`
      .replace(/\b20\d{2}[年\/-]\d{1,2}[月\/-]\d{1,2}\b/g, " ")
      .replace(/\b20\d{2}年/g, " ")
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
      .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
      .replace(/\bA#?\s*\d+/gi, " ");
  }
  function extract(item) {
    const source = cleanSource(item);
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
  function refresh() {
    const data = Array.isArray(window.TRRB_ICE_DATA) ? window.TRRB_ICE_DATA : null;
    if (!data) return;
    const range = document.querySelector(".range-tabs [data-range].active")?.dataset.range || "24h";
    const type = document.querySelector(".type-tabs [data-type].active")?.dataset.type || "all";
    const items = data.filter((item) => inRange(item, range) && (type === "all" || item.type === type));
    let exact = 0, estimated = 0, unknown = 0;
    const places = new Set();
    items.forEach((item) => {
      const result = extract(item);
      item.people = result.value;
      item.people_count_type = result.kind;
      if (result.kind === "estimated") estimated += result.value;
      else if (result.kind === "exact" || result.kind === "minimum") exact += result.value;
      else if (item.type === "arrest") unknown += 1;
      const place = item.location || item.city || item.state;
      if (place) places.add(place);
    });
    const total = exact + estimated;
    const peopleValue = document.getElementById("today-count");
    const placeValue = document.getElementById("today-places");
    const cards = document.querySelectorAll(".ice-stats article");
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
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".range-tabs [data-range],.type-tabs [data-type]").forEach((button) => button.addEventListener("click", () => setTimeout(refresh, 120)));
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (Array.isArray(window.TRRB_ICE_DATA)) { clearInterval(timer); refresh(); }
      else if (tries > 120) clearInterval(timer);
    }, 100);
  });
})();

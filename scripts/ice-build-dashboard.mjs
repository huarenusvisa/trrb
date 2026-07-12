import path from "node:path";
import {
  DATA_DIR, readJson, writeJsonAtomic, newYorkDateKey, isoNow
} from "./ice-utils.mjs";

const NEWS_FILE = path.join(DATA_DIR, "ice-news.json");
const DASHBOARD_FILE = path.join(DATA_DIR, "ice-dashboard.json");
const STATE_FILE = path.join(DATA_DIR, "ice-state.json");

export async function buildIceDashboard() {
  const news = await readJson(NEWS_FILE, []);
  const state = await readJson(STATE_FILE, {});
  const now = isoNow();
  const todayKey = newYorkDateKey(now);

  const normalizedEvents = [];
  for (const item of news) {
    for (const event of Array.isArray(item.enforcement_events) ? item.enforcement_events : []) {
      const basisTime = event.occurred_at || item.published_at;
      if (!basisTime || !Number.isFinite(Date.parse(basisTime))) continue;
      normalizedEvents.push({
        ...event,
        basis_time: new Date(basisTime).toISOString(),
        time_basis: event.occurred_at ? "执法时间" : "公开时间",
        article_title: item.title,
        article_url: item.url,
        state_name: event.state_code || ""
      });
    }
  }

  const todayEvents = normalizedEvents
    .filter(event => ["arrest", "detention"].includes(event.event_type))
    .filter(event => newYorkDateKey(event.basis_time) === todayKey)
    .sort((a, b) => new Date(b.basis_time) - new Date(a.basis_time));

  const dashboard = {
    generated_at: now,
    latest_sync_at: state.last_publish_at || state.last_fetch_at || now,
    timezone: "America/New_York",
    total_published: news.length,
    today: {
      date: todayKey,
      known_people: todayEvents.reduce((sum, event) => sum + (event.people_count || 0), 0),
      event_count: todayEvents.length,
      location_count: new Set(todayEvents.map(event => event.state_code || event.location_text).filter(Boolean)).size,
      unknown_people_events: todayEvents.filter(event => event.people_count == null).length,
      events: todayEvents.slice(0, 20)
    },
    heatmap: {
      "24h": { states: aggregate(normalizedEvents, 24, now) },
      "7d": { states: aggregate(normalizedEvents, 24 * 7, now) },
      "30d": { states: aggregate(normalizedEvents, 24 * 30, now) }
    }
  };

  await writeJsonAtomic(DASHBOARD_FILE, dashboard);
  return dashboard;
}

function aggregate(events, hours, nowIso) {
  const cutoff = Date.parse(nowIso) - hours * 3600000;
  const map = new Map();
  for (const event of events) {
    if (!event.state_code || Date.parse(event.basis_time) < cutoff) continue;
    const row = map.get(event.state_code) || {
      code: event.state_code,
      name: event.state_name || event.state_code,
      events: 0,
      people: 0,
      unknown_people_events: 0
    };
    row.events += 1;
    if (event.people_count == null) row.unknown_people_events += 1;
    else row.people += event.people_count;
    map.set(event.state_code, row);
  }
  return [...map.values()].sort((a, b) => b.events - a.events || b.people - a.people);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  buildIceDashboard()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}

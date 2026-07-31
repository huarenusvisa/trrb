const TOPIC_KEY = 'ice';
const CATEGORY_NAME = 'ICE执法动态';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'access-control-allow-origin': '*'
    },
    body: JSON.stringify(body)
  };
}

function newYorkMidnightIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZoneName: 'shortOffset'
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const match = String(map.timeZoneName || 'GMT-4').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  const sign = match?.[1] === '-' ? -1 : 1;
  const offsetMinutes = sign * (Number(match?.[2] || 4) * 60 + Number(match?.[3] || 0));
  const utcMs = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), 0, 0, 0) - offsetMinutes * 60000;
  return new Date(utcMs).toISOString();
}

async function countRows(base, key, filters) {
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('status', 'eq.published');
  for (const [name, value] of Object.entries(filters)) url.searchParams.set(name, value);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0'
    }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function latestArticle(base, key) {
  const url = new URL(`${base}/rest/v1/articles`);
  url.searchParams.set('select', 'id,title,published_at,source_account,source_url');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('topic_key', `eq.${TOPIC_KEY}`);
  url.searchParams.set('order', 'published_at.desc');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  return rows?.[0] || null;
}

exports.handler = async () => {
  try {
    const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
    if (!base || !key) return json(500, { ok: false, error: 'Missing Supabase environment' });

    const now = new Date();
    const todayStart = newYorkMidnightIso(now);
    const last30h = new Date(now.getTime() - 30 * 3600000).toISOString();
    const [todayByTopic, todayByCategory, recent30h, allTime, latest] = await Promise.all([
      countRows(base, key, { topic_key: `eq.${TOPIC_KEY}`, published_at: `gte.${todayStart}` }),
      countRows(base, key, { category_name: `eq.${CATEGORY_NAME}`, published_at: `gte.${todayStart}` }),
      countRows(base, key, { topic_key: `eq.${TOPIC_KEY}`, published_at: `gte.${last30h}` }),
      countRows(base, key, { topic_key: `eq.${TOPIC_KEY}` }),
      latestArticle(base, key)
    ]);

    return json(200, {
      ok: true,
      checked_at: now.toISOString(),
      timezone: 'America/New_York',
      today_start: todayStart,
      today_published: Math.max(todayByTopic, todayByCategory),
      today_by_topic_key: todayByTopic,
      today_by_category_name: todayByCategory,
      recent_30_hours: recent30h,
      all_time: allTime,
      latest_article: latest
    });
  } catch (error) {
    return json(500, { ok: false, error: String(error?.message || error) });
  }
};

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fwiznbpsqkfgkvyznebz.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

function serviceKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Netlify 尚未设置 SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
    body: JSON.stringify(payload)
  };
}

function parseJson(event) {
  try { return JSON.parse(event.body || "{}"); }
  catch { throw new Error("提交数据格式错误"); }
}

function clean(value, max = 1000) {
  return String(value || "").trim().slice(0, max);
}

function bool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

async function rest(path, options = {}) {
  const key = serviceKey();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.message || data?.error || text || `Supabase ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function publicPost(row) {
  if (!row) return null;
  const { author_contact, ...safe } = row;
  safe.author_name = row.anonymous ? "匿名投稿人" : (row.author_name || "网友投稿");
  return safe;
}

module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY, json, parseJson, clean, bool, rest, publicPost };

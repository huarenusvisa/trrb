const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function safeText(value, max = 20000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function requireSupabase() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) throw new Error(`Netlify缺少环境变量：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || body?.details || body?.raw || `请求失败（${response.status}）`);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  requireSupabase();
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function authenticateAdmin(event) {
  requireSupabase();
  const token = safeText(event.headers.authorization || event.headers.Authorization, 2000).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!user?.id) {
    const error = new Error("后台登录状态无效，请重新登录");
    error.statusCode = 401;
    throw error;
  }

  const email = safeText(user.email, 300).toLowerCase();
  let rows = await rest("admin_users", {
    query: { select: "id,user_id,email,role,is_active", user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" }
  });
  let admin = Array.isArray(rows) ? rows[0] : null;
  if (!admin && email) {
    rows = await rest("admin_users", {
      query: { select: "id,user_id,email,role,is_active", email: `ilike.${email}`, is_active: "eq.true", limit: "1" }
    });
    admin = Array.isArray(rows) ? rows[0] : null;
  }

  const ownerEmail = safeText(process.env.TRRB_OWNER_EMAIL, 300).toLowerCase();
  const ownerUid = safeText(process.env.TRRB_OWNER_UID, 100);
  if (!admin && ownerEmail && ownerUid && user.id === ownerUid && email === ownerEmail) {
    admin = { user_id: ownerUid, email: ownerEmail, role: "owner", is_active: true };
  }

  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) {
    const error = new Error("这个账号没有文章发布权限");
    error.statusCode = 403;
    throw error;
  }
  return { user, admin };
}

module.exports = {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  requestJson,
  rest,
  authenticateAdmin
};

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AUTH_API_KEY = ANON_KEY || SERVICE_KEY;

function safeText(value, max = 20000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function requireSupabase() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!AUTH_API_KEY) missing.push("SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
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

async function authenticateStaff(event, allowedRoles = ["owner", "editor"]) {
  requireSupabase();
  const token = safeText(event.headers.authorization || event.headers.Authorization, 2000).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: AUTH_API_KEY, Authorization: `Bearer ${token}` }
  });
  if (!user?.id) {
    const error = new Error("后台登录状态无效，请重新登录");
    error.statusCode = 401;
    throw error;
  }

  // admin_users.user_id is the single staff authorization source. No e-mail
  // fallback and no environment-variable owner bypass: identity changes must be
  // made explicitly in the protected admin_users table.
  const rows = await rest("admin_users", {
    query: { select: "id,user_id,email,role,is_active", user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" }
  });
  const admin = Array.isArray(rows) ? rows[0] : null;
  const role = String(admin?.role || "").toLowerCase();
  if (!admin || !allowedRoles.includes(role)) {
    const error = new Error("这个账号没有所需后台权限");
    error.statusCode = 403;
    throw error;
  }
  return { user, admin: { ...admin, role } };
}

async function authenticateUser(event) {
  requireSupabase();
  const token = safeText(event.headers.authorization || event.headers.Authorization, 4000).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("请先登录唐人日报账号");
    error.statusCode = 401;
    throw error;
  }
  const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: AUTH_API_KEY, Authorization: `Bearer ${token}` }
  });
  if (!user?.id) {
    const error = new Error("登录状态已失效，请重新登录");
    error.statusCode = 401;
    throw error;
  }
  return { user, token };
}

async function authenticateAdmin(event) {
  return authenticateStaff(event, ["owner", "editor"]);
}

module.exports = {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  requestJson,
  rest,
  authenticateUser,
  authenticateStaff,
  authenticateAdmin
};

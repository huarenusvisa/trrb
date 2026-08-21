function env(name: string) {
  return String((globalThis as any).Netlify?.env?.get?.(name) || "").trim();
}

function clean(value: unknown, max = 500) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function authenticate(req: Request) {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const authKey = env("SUPABASE_ANON_KEY") || serviceKey;
  if (!supabaseUrl || !serviceKey || !authKey) throw Object.assign(new Error("后台数据库环境变量不完整"), { status: 503 });
  const token = clean(req.headers.get("authorization"), 2400).replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("缺少后台登录凭证"), { status: 401 });
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: authKey, Authorization: `Bearer ${token}` } });
  const user = await readJson(userResponse);
  if (!userResponse.ok || !user?.id) throw Object.assign(new Error("后台登录状态无效，请重新登录"), { status: 401 });
  const query = new URL(`${supabaseUrl}/rest/v1/admin_users`);
  query.searchParams.set("select", "id,user_id,email,role,is_active");
  query.searchParams.set("user_id", `eq.${user.id}`);
  query.searchParams.set("is_active", "eq.true");
  query.searchParams.set("limit", "1");
  const adminResponse = await fetch(query, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  const rows = await readJson(adminResponse);
  const admin = Array.isArray(rows) ? rows[0] : null;
  if (!adminResponse.ok || !admin || !["owner", "admin", "editor"].includes(String(admin.role || "").toLowerCase())) {
    throw Object.assign(new Error("这个账号没有财经监控权限"), { status: 403 });
  }
  return { user: { id: user.id, email: user.email }, admin };
}

async function probe(url: URL) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
    const body = await readJson(response);
    return { ok: response.ok && body?.ok !== false, status: response.status, latencyMs: Date.now() - started, body };
  } catch (error: any) {
    return { ok: false, status: 0, latencyMs: Date.now() - started, error: clean(error?.message || error, 240) };
  } finally {
    clearTimeout(timer);
  }
}

export default async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const identity = await authenticate(req);
    const statusUrl = new URL("/api/finance/status", req.url);
    const searchUrl = new URL("/api/finance/search", req.url);
    searchUrl.searchParams.set("q", "AAPL");
    searchUrl.searchParams.set("limit", "1");
    const newsUrl = new URL("/api/finance/news", req.url);
    newsUrl.searchParams.set("limit", "1");
    const [market, search, news] = await Promise.all([probe(statusUrl), probe(searchUrl), probe(newsUrl)]);
    const providerConfigured = Boolean(env("TWELVE_DATA_API_KEY"));
    const checks = [
      { name: "行情状态接口", key: "market-status", ...market, body: undefined },
      { name: "全证券搜索接口", key: "security-search", ...search, body: undefined },
      { name: "唐人日报财经新闻同步", key: "finance-news", ...news, body: undefined }
    ];
    const ok = checks.every((check) => check.ok);
    return json({
      ok,
      checkedAt: new Date().toISOString(),
      mode: providerConfigured ? "provider" : "demo",
      provider: providerConfigured ? "Twelve Data" : "Niulai demo catalog",
      providerConfigured,
      publicDisplayGate: providerConfigured ? "business-key-configured" : "development-only",
      environment: {
        supabaseUrl: Boolean(env("SUPABASE_URL")),
        supabaseServiceRole: Boolean(env("SUPABASE_SERVICE_ROLE_KEY")),
        twelveDataApiKey: providerConfigured
      },
      coverage: market.body?.coverage || null,
      checks,
      operator: { email: identity.user.email, role: identity.admin.role }
    }, ok ? 200 : 207);
  } catch (error: any) {
    console.error("Finance admin health error:", error);
    return json({ ok: false, error: clean(error?.message || error, 240) }, error?.status || 500);
  }
};

export const config = { path: "/api/finance/admin/health" };

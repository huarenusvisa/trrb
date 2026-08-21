import catalog from "./_shared/finance-catalog.js";

const {
  clean,
  coverage,
  demoQuote,
  demoSeries,
  findInstrument,
  inferGroup,
  normalizeInstrument,
  routeKind,
  searchCatalog
} = catalog as any;

const API_BASE = "https://api.twelvedata.com";
const responseCache = new Map<string, { expires: number; value: any }>();
const rateWindows = new Map<string, { started: number; count: number }>();

function env(name: string) {
  return String((globalThis as any).Netlify?.env?.get?.(name) || "").trim();
}

function json(body: any, status = 200, cache = "public, max-age=15, stale-while-revalidate=45") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function clientIp(req: Request) {
  return clean(req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown", 80).split(",")[0];
}

function withinRateLimit(req: Request) {
  const key = clientIp(req);
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.started >= 60_000) {
    rateWindows.set(key, { started: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 90;
}

async function cached<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const current = responseCache.get(key);
  if (current && current.expires > Date.now()) return current.value as T;
  const value = await loader();
  responseCache.set(key, { expires: Date.now() + ttl, value });
  if (responseCache.size > 300) {
    const first = responseCache.keys().next().value;
    if (first) responseCache.delete(first);
  }
  return value;
}

async function twelve(path: string, params: Record<string, string | number | boolean | undefined>, key: string) {
  const url = new URL(path, API_BASE);
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  });
  url.searchParams.set("apikey", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status === "error" || body?.code) {
      throw new Error(clean(body?.message || body?.detail || `Twelve Data ${response.status}`, 240));
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function number(value: any, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compact(value: number | null) {
  if (!Number.isFinite(value as number)) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value as number);
}

function normalizeProviderInstrument(item: any) {
  return normalizeInstrument({
    symbol: item.symbol,
    name: item.instrument_name || item.name || item.symbol,
    exchange: item.exchange || "",
    mic_code: item.mic_code || "",
    country: item.country || "",
    currency: item.currency || "",
    type: item.instrument_type || item.type || "Common Stock",
    group: inferGroup(item)
  });
}

function normalizeProviderQuote(raw: any, requested: any) {
  const instrument = normalizeProviderInstrument({ ...requested, ...raw });
  const price = number(raw.close ?? raw.price, 0) as number;
  const previous = number(raw.previous_close, price) as number;
  const changeAmount = number(raw.change, price - previous) as number;
  const percent = number(raw.percent_change, previous ? (changeAmount / previous) * 100 : 0) as number;
  const range = raw.fifty_two_week || {};
  return {
    ...instrument,
    group: inferGroup(instrument),
    price,
    change: percent,
    change_amount: changeAmount,
    previous_close: previous,
    open: number(raw.open, previous),
    high: number(raw.high, price),
    low: number(raw.low, price),
    volume: number(raw.volume, 0),
    average_volume: number(raw.average_volume, 0),
    market_cap: number(raw.market_cap, null),
    pe: number(raw.pe, null),
    fifty_two_week: {
      low: number(range.low, null),
      high: number(range.high, null),
      range: clean(range.range || "—", 80)
    },
    is_market_open: Boolean(raw.is_market_open),
    datetime: clean(raw.datetime || new Date().toISOString(), 80),
    source: "twelve-data"
  };
}

function frontendQuote(quote: any, series: any[], mode: string) {
  const price = number(quote.price, 0) as number;
  const previous = number(quote.previous_close, price) as number;
  return {
    id: quote.id || `${quote.symbol}|${quote.mic_code || quote.exchange}|${quote.type}`.toUpperCase(),
    symbol: quote.symbol,
    name: quote.name,
    market: quote.exchange || quote.mic_code || "—",
    exchange: quote.exchange,
    mic_code: quote.mic_code,
    country: quote.country,
    currency: quote.currency || "USD",
    type: quote.type,
    group: quote.group || inferGroup(quote),
    route: routeKind(quote.type),
    price,
    change: number(quote.change, 0),
    after: 0,
    open: number(quote.open, previous),
    high: number(quote.high, price),
    low: number(quote.low, price),
    prev: previous,
    marketCap: compact(number(quote.market_cap, null)),
    pe: number(quote.pe, null) ?? "—",
    volume: compact(number(quote.volume, null)),
    range52: quote.fifty_two_week?.range || "—",
    sector: clean(quote.type || "证券", 80),
    description: `${quote.name}（${quote.symbol}）在 ${quote.exchange || quote.mic_code || "相关市场"} 交易。当前页面用于行情与证券信息架构测试。`,
    spark: series.map((point) => number(point.close, 0)).filter((value) => Number.isFinite(value)),
    series,
    realTime: mode === "provider",
    source: mode === "provider" ? "Twelve Data" : "牛来测试数据"
  };
}

async function search(req: Request, url: URL, apiKey: string) {
  const q = clean(url.searchParams.get("q"), 80);
  const market = clean(url.searchParams.get("market") || "all", 20).toLowerCase();
  const limit = Math.min(Math.max(number(url.searchParams.get("limit"), 20) as number, 1), 60);
  if (q.length < 1) return json({ error: "请输入证券代码或名称" }, 400, "no-store");
  if (!apiKey) {
    return json({ mode: "demo", query: q, market, count: searchCatalog(q, { market, limit }).length, items: searchCatalog(q, { market, limit }), coverage: coverage() }, 200, "public, max-age=60");
  }
  try {
    const data = await cached(`search:${q}:${market}:${limit}`, 60_000, () => twelve("/symbol_search", { symbol: q, outputsize: limit, show_plan: true }, apiKey));
    const rows = Array.isArray(data?.data) ? data.data : [];
    const items = rows.map(normalizeProviderInstrument).filter((item: any) => market === "all" || item.group === market).slice(0, limit);
    return json({ mode: "provider", query: q, market, count: items.length, items });
  } catch (error: any) {
    const items = searchCatalog(q, { market, limit });
    return json({ mode: "fallback", query: q, market, count: items.length, items, warning: clean(error?.message || error, 240) }, 200, "no-store");
  }
}

async function quote(req: Request, url: URL, apiKey: string) {
  const symbol = clean(url.searchParams.get("symbol"), 32).toUpperCase();
  const exchange = clean(url.searchParams.get("exchange"), 32).toUpperCase();
  const type = clean(url.searchParams.get("type"), 80);
  if (!symbol) return json({ error: "缺少 symbol" }, 400, "no-store");
  const catalogItem = findInstrument({ symbol, exchange, type });
  if (!apiKey && !catalogItem) return json({ mode: "demo", error: "当前测试证券目录未收录该标的；系统不会生成或替代行情" }, 404, "no-store");
  const fallback = catalogItem || {
    symbol,
    name: symbol,
    exchange: exchange || "UNKNOWN",
    mic_code: exchange,
    country: "",
    currency: "USD",
    type: type || "Common Stock",
    group: "us",
    base_price: 20 + (Array.from(symbol).reduce((sum: number, char: any) => sum + String(char).charCodeAt(0), 0) % 400)
  };
  if (!apiKey) {
    const raw = demoQuote(fallback);
    const series = demoSeries(fallback, 64);
    return json({ mode: "demo", asOf: new Date().toISOString(), instrument: normalizeInstrument(fallback), quote: frontendQuote(raw, series, "demo"), series }, 200, "public, max-age=30");
  }
  try {
    const params = { symbol, exchange: exchange || undefined, type: type || undefined, interval: "1day" };
    const [rawQuote, rawSeries] = await Promise.all([
      cached(`quote:${symbol}:${exchange}:${type}`, 15_000, () => twelve("/quote", params, apiKey)),
      cached(`series:${symbol}:${exchange}:${type}`, 60_000, () => twelve("/time_series", { ...params, outputsize: 64 }, apiKey))
    ]);
    const normalized = normalizeProviderQuote(rawQuote, fallback);
    const series = (Array.isArray(rawSeries?.values) ? rawSeries.values : []).slice().reverse().map((point: any) => ({ datetime: clean(point.datetime, 80), close: number(point.close, 0) }));
    return json({ mode: "provider", asOf: new Date().toISOString(), instrument: normalizeProviderInstrument(rawQuote), quote: frontendQuote(normalized, series, "provider"), series });
  } catch (error: any) {
    if (!catalogItem) return json({ mode: "provider-error", error: clean(error?.message || error, 240) }, 502, "no-store");
    const raw = demoQuote(fallback);
    const series = demoSeries(fallback, 64);
    return json({ mode: "fallback", asOf: new Date().toISOString(), instrument: normalizeInstrument(fallback), quote: frontendQuote(raw, series, "demo"), series, warning: clean(error?.message || error, 240) }, 200, "no-store");
  }
}

function status(apiKey: string) {
  const mode = apiKey ? "provider" : "demo";
  return json({
    ok: true,
    mode,
    provider: apiKey ? "Twelve Data" : "Niulai demo catalog",
    providerConfigured: Boolean(apiKey),
    publicDisplayGate: apiKey ? "business-key-configured" : "development-only",
    coverage: coverage(),
    capabilities: ["search", "quote", "time-series", "multi-market", "news-sync", "watchlist-ready", "alerts-ready"],
    checkedAt: new Date().toISOString()
  }, 200, "no-store");
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 204, "no-store");
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405, "no-store");
  if (!withinRateLimit(req)) return json({ error: "请求过于频繁，请稍后再试" }, 429, "no-store");
  const url = new URL(req.url);
  const apiKey = env("TWELVE_DATA_API_KEY");
  if (url.pathname.endsWith("/search")) return search(req, url, apiKey);
  if (url.pathname.endsWith("/quote")) return quote(req, url, apiKey);
  if (url.pathname.endsWith("/status")) return status(apiKey);
  return json({ error: "Unknown finance endpoint" }, 404, "no-store");
};

export const config = {
  path: ["/api/finance/search", "/api/finance/quote", "/api/finance/status"]
};

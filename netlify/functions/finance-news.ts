let cached: { expires: number; staleUntil: number; value: any } | null = null;
const REQUEST_TIMEOUT_MS = 8_000;
const STALE_CACHE_MS = 30 * 60_000;

function clean(value: unknown, max = 500) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=60, stale-while-revalidate=180" : "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function articleUrl(article: any) {
  const sections: Record<string, string> = {
    "重要新闻": "important-news",
    "热门头条": "hot-headlines",
    "美国时政": "us-politics",
    "美国警情": "us-crime",
    "中国官场": "china-officialdom",
    "庇护百科": "asylum",
    "驱逐快报": "deport",
    "ICE执法动态": "ice"
  };
  const section = sections[clean(article.category_name, 80)] || "news";
  const routeKey = clean(article.slug || article.id, 260);
  return routeKey ? `/${section}/${encodeURIComponent(routeKey)}` : "/";
}

function tagFor(article: any) {
  const text = `${article.title || ""} ${article.summary || ""}`;
  if (/ETF|基金/i.test(text)) return "ETF";
  if (/美联储|利率|通胀|就业|关税/.test(text)) return "MACRO";
  if (/港股|恒生/.test(text)) return "HK";
  if (/A股|沪深|上证|深证/.test(text)) return "CN";
  if (/AI|芯片|半导体|英伟达/i.test(text)) return "TECH";
  return "MARKET";
}

function isFinanceArticle(article: any) {
  if (clean(article.category_name, 80) === "牛来财经") return true;
  const text = `${article.title || ""} ${article.summary || ""}`;
  return /(美股|股票|股市|证券|财经|ETF|基金|指数|道指|纳指|标普|港股|A股|沪深|上证|深证|华尔街|上市公司|美联储|利率|通胀|财报|投资者|债券|黄金|比特币|加密资产|GDP|RPP|市场抛售|市场反弹)/i.test(text);
}

function relativeTime(value: string) {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return "刚刚";
  const minutes = Math.max(1, Math.round((Date.now() - stamp) / 60_000));
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.round(hours / 24)}天前`;
}

async function fetchArticles(url: URL, label: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${label} ${response.status}`);
      const body = await response.json();
      return Array.isArray(body?.articles) ? body.articles : [];
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function fetchTerm(req: Request, term: string) {
  const url = new URL("/.netlify/functions/public-articles", req.url);
  url.searchParams.set("limit", "20");
  url.searchParams.set("q", term);
  return fetchArticles(url, `public-articles q=${term}`);
}

async function fetchCategory(req: Request, category: string) {
  const url = new URL("/.netlify/functions/public-articles", req.url);
  url.searchParams.set("limit", "30");
  url.searchParams.set("category", category);
  return fetchArticles(url, `public-articles category=${category}`);
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 12), 1), 30);
  if (cached && cached.expires > Date.now()) return json({ ...cached.value, limit, articles: cached.value.articles.slice(0, limit), cached: true });
  try {
    const results = await Promise.allSettled([
      fetchCategory(req, "牛来财经"),
      ...["美股", "股票", "ETF", "美联储"].map((term) => fetchTerm(req, term))
    ]);
    const batches = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failedSources = results.flatMap((result, index) => result.status === "rejected"
      ? [clean(result.reason?.message || result.reason || `source ${index + 1}`, 240)]
      : []);
    if (!batches.length) throw new Error(`all finance sources failed: ${failedSources.join("; ")}`);
    const seen = new Set<string>();
    const articles = batches.flat()
      .filter(isFinanceArticle)
      .filter((article) => {
        const key = clean(article.id || article.slug || article.title, 300);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.published_at || b.created_at || 0) - Date.parse(a.published_at || a.created_at || 0))
      .map((article) => ({
        id: clean(article.id, 80),
        title: clean(article.title, 260),
        summary: clean(article.summary, 500),
        category: clean(article.category_name, 80),
        source: clean(article.author || article.source_name || "牛来｜唐人财经", 160),
        originalSource: clean(article.source_name, 200),
        originalUrl: clean(article.source_url, 1200),
        sourceAccount: clean(article.source_account, 160),
        sourcePlatform: clean(article.source_platform, 80),
        publishedAt: article.published_at || article.created_at || null,
        time: relativeTime(article.published_at || article.created_at),
        tag: tagFor(article),
        image: clean(article.cover_image, 1200),
        url: articleUrl(article)
      }));
    const value = {
      ok: true,
      source: "唐人日报公开文章库",
      generatedAt: new Date().toISOString(),
      count: articles.length,
      partial: failedSources.length > 0,
      failedSources,
      articles
    };
    cached = { expires: Date.now() + 120_000, staleUntil: Date.now() + STALE_CACHE_MS, value };
    return json({ ...value, limit, articles: articles.slice(0, limit), cached: false });
  } catch (error: any) {
    console.error("Finance news sync error:", error);
    if (cached && cached.staleUntil > Date.now()) {
      return json({
        ...cached.value,
        limit,
        articles: cached.value.articles.slice(0, limit),
        cached: true,
        stale: true,
        refreshError: clean(error?.message || error, 240)
      });
    }
    return json({ ok: false, error: clean(error?.message || error, 240), articles: [] }, 502);
  }
};

export const config = { path: "/api/finance/news" };

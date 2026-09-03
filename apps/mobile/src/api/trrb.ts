export type NewsArticle = {
  id: string | number;
  title: string;
  slug?: string;
  summary?: string;
  content?: string;
  category_name?: string;
  topic_key?: string;
  cover_image?: string;
  author?: string;
  published_at?: string;
  created_at?: string;
};

export type ArticlePage = {
  articles: NewsArticle[];
  offset: number;
  limit: number;
  next_offset: number | null;
  has_more: boolean;
  category?: string | null;
  q?: string | null;
};

export type TrendingSearch = {
  term: string;
  category?: string;
  score: number;
};

export type ArticleNavigation = {
  previous: NewsArticle | null;
  next: NewsArticle | null;
};

const API_BASE = 'https://trrb.net/.netlify/functions';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const inflight = new Map<string, Promise<any>>();

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `TRRB API ${response.status}`);
  return payload;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url: string, attempt = 0): Promise<any> {
  const existing = inflight.get(url);
  if (existing) return existing;

  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await wait(350 * (attempt + 1));
        return requestJson(url, attempt + 1);
      }
      return await readJson(response);
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await wait(350 * (attempt + 1));
        return requestJson(url, attempt + 1);
      }
      if (error instanceof Error && error.name === 'AbortError') throw new Error('请求超时，请检查网络后重试');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(url, task);
  try {
    return await task;
  } finally {
    if (inflight.get(url) === task) inflight.delete(url);
  }
}

export async function fetchArticles(options: { category?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 40, 1), 200)));
  if (options.category) params.set('category', options.category);

  const payload = await requestJson(`${API_BASE}/public-home-articles?${params.toString()}`);
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles as NewsArticle[];
}

export async function fetchArticlePage(options: { category?: string; q?: string; limit?: number; offset?: number } = {}): Promise<ArticlePage> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 30, 1), 60)));
  params.set('offset', String(Math.max(options.offset ?? 0, 0)));
  if (options.category) params.set('category', options.category);
  if (options.q) params.set('q', options.q.trim());

  const payload = await requestJson(`${API_BASE}/public-articles?${params.toString()}`);
  return {
    articles: Array.isArray(payload?.articles) ? payload.articles : [],
    offset: Number(payload?.offset || 0),
    limit: Number(payload?.limit || options.limit || 30),
    next_offset: payload?.next_offset == null ? null : Number(payload.next_offset),
    has_more: Boolean(payload?.has_more),
    category: payload?.category || null,
    q: payload?.q || null
  };
}

export async function fetchTrendingSearches(): Promise<{ items: TrendingSearch[]; source: string; generatedAt: string }> {
  const payload = await requestJson(`${API_BASE}/public-app-trending-searches`);
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    source: String(payload?.source || ''),
    generatedAt: String(payload?.generated_at || '')
  };
}

export async function fetchArticle(id: string | number) {
  const params = new URLSearchParams({ id: String(id) });
  const payload = await requestJson(`${API_BASE}/public-article?${params.toString()}`);
  return (payload?.article || null) as NewsArticle | null;
}

export async function fetchRelatedArticles(article: NewsArticle, limit = 4) {
  if (!article.category_name) return [] as NewsArticle[];
  const page = await fetchArticlePage({ category: article.category_name, limit: Math.min(Math.max(limit + 1, 2), 12), offset: 0 });
  return page.articles.filter((item) => String(item.id) !== String(article.id)).slice(0, limit);
}

export function articleNavigationFromOrderedArticles(items: NewsArticle[], articleId: string | number): ArticleNavigation | null {
  const index = items.findIndex((item) => String(item.id) === String(articleId));
  if (index < 0) return null;
  return {
    previous: index > 0 ? items[index - 1] : null,
    next: index + 1 < items.length ? items[index + 1] : null,
  };
}

export async function fetchArticleNavigation(articleId: string | number, maxPages = 8): Promise<ArticleNavigation> {
  const ordered: NewsArticle[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchArticlePage({ offset, limit: 60 });
    for (const item of page.articles) {
      const key = String(item.id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      ordered.push(item);
    }

    const navigation = articleNavigationFromOrderedArticles(ordered, articleId);
    if (navigation && (navigation.next || !page.has_more)) return navigation;
    if (!page.has_more || page.next_offset == null) break;
    offset = page.next_offset;
  }

  return articleNavigationFromOrderedArticles(ordered, articleId) || { previous: null, next: null };
}

export function publicationTime(item: NewsArticle) {
  const raw = item.published_at || item.created_at || '';
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortNewestFirst(items: NewsArticle[]) {
  return [...items].sort((a, b) => publicationTime(b) - publicationTime(a));
}

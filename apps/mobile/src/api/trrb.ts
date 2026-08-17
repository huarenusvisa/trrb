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

const API_BASE = 'https://trrb.net/.netlify/functions';

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `TRRB API ${response.status}`);
  return payload;
}

export async function fetchArticles(options: { category?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 40, 1), 200)));
  if (options.category) params.set('category', options.category);

  const response = await fetch(`${API_BASE}/public-home-articles?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await readJson(response);
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles as NewsArticle[];
}

export async function fetchArticlePage(options: { category?: string; q?: string; limit?: number; offset?: number } = {}): Promise<ArticlePage> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 30, 1), 60)));
  params.set('offset', String(Math.max(options.offset ?? 0, 0)));
  if (options.category) params.set('category', options.category);
  if (options.q) params.set('q', options.q.trim());

  const response = await fetch(`${API_BASE}/public-articles?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await readJson(response);
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
  const response = await fetch(`${API_BASE}/public-app-trending-searches`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await readJson(response);
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    source: String(payload?.source || ''),
    generatedAt: String(payload?.generated_at || '')
  };
}

export async function fetchArticle(id: string | number) {
  const params = new URLSearchParams({ id: String(id) });
  const response = await fetch(`${API_BASE}/public-article?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await readJson(response);
  return (payload?.article || null) as NewsArticle | null;
}

export async function fetchRelatedArticles(article: NewsArticle, limit = 4) {
  if (!article.category_name) return [] as NewsArticle[];
  const page = await fetchArticlePage({ category: article.category_name, limit: Math.min(Math.max(limit + 1, 2), 12), offset: 0 });
  return page.articles.filter((item) => String(item.id) !== String(article.id)).slice(0, limit);
}

export function publicationTime(item: NewsArticle) {
  const raw = item.published_at || item.created_at || '';
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortNewestFirst(items: NewsArticle[]) {
  return [...items].sort((a, b) => publicationTime(b) - publicationTime(a));
}

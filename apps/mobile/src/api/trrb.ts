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

export async function fetchArticle(id: string | number) {
  const params = new URLSearchParams({ id: String(id) });
  const response = await fetch(`${API_BASE}/public-article?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  const payload = await readJson(response);
  return (payload?.article || null) as NewsArticle | null;
}

export function publicationTime(item: NewsArticle) {
  const raw = item.published_at || item.created_at || '';
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortNewestFirst(items: NewsArticle[]) {
  return [...items].sort((a, b) => publicationTime(b) - publicationTime(a));
}

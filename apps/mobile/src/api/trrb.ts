export type NewsArticle = {
  id: string | number;
  title: string;
  slug?: string;
  summary?: string;
  content?: string;
  category_name?: string;
  cover_image?: string;
  author?: string;
  published_at?: string;
  created_at?: string;
};

const API_BASE = 'https://trrb.net/.netlify/functions';

export async function fetchArticles(options: { category?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(Math.min(Math.max(options.limit ?? 40, 1), 200)));
  if (options.category) params.set('category', options.category);

  const response = await fetch(`${API_BASE}/public-home-articles?${params.toString()}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`TRRB API ${response.status}`);
  const payload = await response.json();
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles as NewsArticle[];
}

export function publicationTime(item: NewsArticle) {
  const raw = item.published_at || item.created_at || '';
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortNewestFirst(items: NewsArticle[]) {
  return [...items].sort((a, b) => publicationTime(b) - publicationTime(a));
}

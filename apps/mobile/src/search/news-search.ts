import { fetchArticlePage, NewsArticle } from '../api/trrb';
import { addSearchHistory } from '../storage/searchHistory';

export async function searchNews(query: string, category?: string, offset = 0): Promise<{ items: NewsArticle[]; hasMore: boolean; nextOffset: number | null }> {
  const q = query.trim();
  if (!q && !category) return { items: [], hasMore: false, nextOffset: null };
  if (q) await addSearchHistory(q);
  const page = await fetchArticlePage({ q: q || undefined, category, limit: 30, offset });
  return { items: page.articles, hasMore: page.has_more, nextOffset: page.next_offset };
}

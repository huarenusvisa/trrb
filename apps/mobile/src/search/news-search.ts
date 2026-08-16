import { fetchArticlePage, NewsArticle } from '../api/trrb';
import { addSearchHistory } from '../storage/search-history';

export async function searchNews(query: string, offset = 0): Promise<{ items: NewsArticle[]; hasMore: boolean; nextOffset: number | null }> {
  const q = query.trim();
  if (!q) return { items: [], hasMore: false, nextOffset: null };
  await addSearchHistory(q);
  const page = await fetchArticlePage({ q, limit: 30, offset });
  return { items: page.articles, hasMore: page.has_more, nextOffset: page.next_offset };
}

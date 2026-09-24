// The same query rules power public search and the authenticated content list.
function searchTerms(value) {
  return [...new Set(String(value || '').normalize('NFKC').slice(0, 200)
    .replace(/[‐‑‒–—]/g, '-').replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim().split(/\s+/).filter(Boolean))].slice(0, 12);
}

function searchFilter(value) {
  return searchTerms(value).map(term => `or(${['title', 'summary', 'content']
    .map(field => `${field}.ilike.*${term}*`).join(',')})`);
}

function articleListQuery(input = {}, { publicOnly = false, now = Date.now() } = {}) {
  const page = Math.min(100000, Math.max(1, Math.floor(Number(input.page) || 1)));
  const pageSize = Math.min(publicOnly ? 50 : 100, Math.max(1, Math.floor(Number(input.page_size) || (publicOnly ? 24 : 50))));
  const text = String(input.q || '').trim().slice(0, 200);
  const terms = searchTerms(text);
  const query = {
    select: publicOnly
      ? 'id,title,slug,publication_path,summary,category_name,topic_key,cover_image,author,published_at,created_at'
      : 'id,title,category_name,status,visibility,published_at,created_at,cover_image,summary,metadata',
    order: 'published_at.desc.nullslast,created_at.desc,id.desc',
    limit: String(pageSize + 1), offset: String((page - 1) * pageSize)
  };
  const filters = searchFilter(text);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    filters.length = 0;
    query.id = `eq.${text}`;
  }
  if (publicOnly) {
    query.status = 'eq.published';
    query.visibility = 'eq.public';
  } else {
    if (['published', 'draft', 'hidden'].includes(input.status)) query.status = `eq.${input.status}`;
    // This is only a list filter: never change article publication or visibility.
    if (!text) {
      const cutoff = new Date(now - 72 * 60 * 60 * 1000).toISOString();
      filters.push(`or(published_at.gte.${cutoff},and(published_at.is.null,created_at.gte.${cutoff}))`);
    }
  }
  if (input.category) query.category_name = `eq.${String(input.category).slice(0, 100)}`;
  if (filters.length) query.and = `(${filters.join(',')})`;
  return { query, page, pageSize, text, emptySearch: Boolean(text && !terms.length) };
}

function articleCategoryLabel(article) {
  const name = String(article.category_name || '').trim();
  if (['ICE', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报', '美国警情', '美国执法与警情', 'ICE执法与警情'].includes(name)) {
    return name === '美国警情' ? 'ICE执法与警情 · 美国警情' : 'ICE执法与警情';
  }
  const primary = name === '热门头条' ? '中国热门头条' : name;
  return name !== '中国政治' && article.metadata?.editorial_topics?.includes('china-politics')
    ? `${primary} · 中国政治` : primary;
}

module.exports = { searchTerms, searchFilter, articleListQuery, articleCategoryLabel };

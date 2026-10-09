import { readWithRetry } from './paged-read.mjs';

const SELECT = 'publication_path,publication_updated_at,id,title,slug,summary,content,category_id,category_name,topic_key,status,visibility,published_at,created_at,source_url,cover_image,knowledge_migration_batch:metadata->>knowledge_migration_batch,knowledge_path:metadata->>knowledge_path,knowledge_topic:metadata->>knowledge_topic';

const timestamp = (value, fallback) => value ? Date.parse(value) : fallback;
const isTransientReadError = (error) => /\b(?:408|429|500|502|503|504|57014|PGRST002)\b|statement timeout|fetch failed|network|ECONNRESET|AbortError|TimeoutError/i.test(`${error?.status || ''} ${error?.code || ''} ${error?.name || ''}: ${error?.message || error}`);

// Read small batches through the existing primary-key index. Fetching complete
// bodies with a large sorted OFFSET query can exhaust the Data API timeout.
export async function fetchPublishedArticles(rest, { pageSize = 200, minPageSize = 10, maxRows = 100000, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const all = [];
  let cursor = '';
  let currentPageSize = pageSize;
  for (;;) {
    const params = { select: SELECT, status: 'eq.published', visibility: 'eq.public', hidden_at: 'is.null', archived_at: 'is.null', published_at: `lte.${new Date().toISOString()}`, order: 'id.asc', limit: String(currentPageSize) };
    if (cursor) params.id = `gt.${cursor}`;
    let rows;
    try {
      rows = await readWithRetry(() => rest('articles', params), { wait: pause });
    } catch (error) {
      if (!isTransientReadError(error)) throw error;
      const smaller = Math.max(minPageSize, Math.floor(currentPageSize / 2));
      if (smaller >= currentPageSize) throw error;
      currentPageSize = smaller;
      console.warn(`[sitemap] article page timed out; reducing page size to ${currentPageSize}`);
      continue;
    }
    if (!Array.isArray(rows) || rows.length > currentPageSize) throw new Error('Invalid article page; refusing incomplete sitemap');
    for (const row of rows) {
      if (!row?.id || String(row.id) <= cursor) throw new Error('Article cursor did not advance; refusing incomplete sitemap');
      cursor = String(row.id);
      all.push(row);
    }
    if (all.length > maxRows) throw new Error('Article safety limit exceeded; refusing truncated sitemap');
    if (rows.length < currentPageSize) break;
  }
  // Preserve the original newest-first duplicate selection and News ordering.
  return all.sort((a, b) => {
    for (const [field, fallback] of [['published_at', -Infinity], ['created_at', Infinity]]) {
      const left = timestamp(a[field], fallback), right = timestamp(b[field], fallback);
      if (left !== right) return left > right ? -1 : 1;
    }
    return String(a.id) < String(b.id) ? 1 : String(a.id) > String(b.id) ? -1 : 0;
  });
}

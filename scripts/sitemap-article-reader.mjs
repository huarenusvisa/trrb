const SELECT = 'id,title,slug,summary,content,category_id,category_name,topic_key,status,visibility,published_at,created_at,source_url,cover_image';

const timestamp = (value, fallback) => value ? Date.parse(value) : fallback;

// Read small batches through the existing primary-key index. Fetching complete
// bodies with a large sorted OFFSET query can exhaust the Data API timeout.
export async function fetchPublishedArticles(rest, { pageSize = 200, maxRows = 100000, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const all = [];
  let cursor = '';
  for (;;) {
    const params = { select: SELECT, status: 'eq.published', visibility: 'eq.public', order: 'id.asc', limit: String(pageSize) };
    if (cursor) params.id = `gt.${cursor}`;
    let rows;
    for (let attempt = 0; ; attempt++) {
      try { rows = await rest('articles', params); break; }
      catch (error) {
        if (attempt >= 2 || !(error.status === 429 || error.status >= 500)) throw error;
        await pause(500 * (attempt + 1));
      }
    }
    if (!Array.isArray(rows) || rows.length > pageSize) throw new Error('Invalid article page; refusing incomplete sitemap');
    for (const row of rows) {
      if (!row?.id || String(row.id) <= cursor) throw new Error('Article cursor did not advance; refusing incomplete sitemap');
      cursor = String(row.id);
      all.push(row);
    }
    if (all.length > maxRows) throw new Error('Article safety limit exceeded; refusing truncated sitemap');
    if (rows.length < pageSize) break;
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

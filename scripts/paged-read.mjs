// Retry only reads. Never turn a transient database failure into an empty result.
export async function readWithRetry(read, { attempts = 3, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await read(); }
    catch (error) {
      const transient = /\b(?:408|429|500|502|503|504|57014)\b|statement timeout|fetch failed|network|ECONNRESET|AbortError/i.test(`${error?.name || ''}: ${error?.message || error}`);
      if (!transient || attempt >= attempts) throw error;
      await wait(500 * 2 ** (attempt - 1));
    }
  }
}

export async function readAllPages(readPage, { pageSize = 200, maxRows = 100000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const limit = Math.min(pageSize, maxRows - offset);
    const page = await readWithRetry(() => readPage({ limit: String(limit), offset: String(offset) }));
    if (!Array.isArray(page)) throw new Error('Database read did not return an array');
    rows.push(...page);
    if (page.length < limit) return rows;
  }
  return rows;
}

// Bound wide REST reads and preserve the caller's ordering and requested cap.
export async function readDatabaseQuery(query, request) {
  const maxRows = Number(query.limit);
  if (!(maxRows > 200)) return readWithRetry(() => request(query));
  const order = query.order || 'id.desc';
  const stableOrder = order.split(',').some(part => /^id(?:\.|$)/.test(part)) ? order : `${order},id.desc`;
  const start = Number(query.offset || 0);
  return readAllPages(page => request({ ...query, ...page, order: stableOrder, offset: String(start + Number(page.offset)) }), { maxRows });
}

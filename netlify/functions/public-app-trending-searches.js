const { rest } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const rows = await rest('articles', {
      query: {
        select: 'id,category_name,published_at,created_at,status,visibility',
        status: 'eq.published',
        visibility: 'eq.public',
        order: 'published_at.desc.nullslast,created_at.desc',
        limit: '200'
      }
    });

    const counts = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const term = String(row.category_name || '').trim();
      if (!term) continue;
      counts.set(term, (counts.get(term) || 0) + 1);
    }

    const items = [...counts.entries()]
      .map(([term, count]) => ({ term, category: term, score: count }))
      .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term, 'zh-CN'))
      .slice(0, 10);

    return json(200, {
      generated_at: new Date().toISOString(),
      source: 'articles:published-public:last-200:category-frequency',
      auditable: true,
      items
    });
  } catch (error) {
    console.error('Public app trending searches error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

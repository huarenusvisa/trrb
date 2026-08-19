const { rest } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const id = String(event.queryStringParameters?.id || '').trim().slice(0, 120);
    const slug = String(event.queryStringParameters?.slug || '').trim().slice(0, 240);
    if (!id && !slug) return json(400, { error: 'id or slug is required' });

    const query = {
      select: 'id,title,slug,summary,content,category_name,topic_key,cover_image,author,status,visibility,published_at,created_at',
      status: 'eq.published',
      visibility: 'eq.public',
      limit: '1'
    };
    if (id) query.id = `eq.${id}`;
    else query.slug = `eq.${slug}`;

    const rows = await rest('articles', { query });
    const article = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!article) return json(404, { error: 'Article not found' });

    return json(200, { article });
  } catch (error) {
    console.error('Public article detail error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

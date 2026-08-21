const { rest } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });

  try {
    const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 30), 1), 60);
    const rows = await rest('job_listings', {
      query: {
        select: 'id,title,category_slug,employment_type,salary_min,salary_max,salary_period,state_code,city,county,borough,neighborhood,status,published_at,updated_at',
        status: 'eq.open',
        moderation_hold: 'eq.false',
        order: 'published_at.desc.nullslast,updated_at.desc',
        limit: String(limit)
      }
    });

    const items = Array.isArray(rows) ? rows : [];
    return json(200, {
      source: 'job_listings',
      mode: 'homepage-jobs',
      count: items.length,
      generated_at: new Date().toISOString(),
      items
    });
  } catch (error) {
    console.error('Public homepage jobs feed error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error), items: [] });
  }
};

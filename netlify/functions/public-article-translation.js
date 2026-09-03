const { rest } = require('./_shared/supabase-admin');

const SUPPORTED_LOCALES = new Set(['en', 'zh-TW']);

function normalizeLocale(value) {
  const raw = String(value || '').trim();
  if (/^en(?:[-_].*)?$/i.test(raw)) return 'en';
  if (/^zh[-_](?:TW|HK|Hant)$/i.test(raw)) return 'zh-TW';
  return SUPPORTED_LOCALES.has(raw) ? raw : '';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
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
    const locale = normalizeLocale(event.queryStringParameters?.locale);
    if (!id || !locale) return json(400, { error: 'A valid id and locale are required' });

    const articles = await rest('articles', {
      query: {
        select: 'id,updated_at',
        id: `eq.${id}`,
        status: 'eq.published',
        visibility: 'eq.public',
        limit: '1'
      }
    });
    const article = Array.isArray(articles) ? articles[0] : null;
    if (!article) return json(404, { error: 'Article not found' });

    const rows = await rest('article_translations', {
      query: {
        select: 'article_id,locale,title,summary,content,translation_source,reviewed_at,source_article_updated_at',
        article_id: `eq.${article.id}`,
        locale: `eq.${locale}`,
        status: 'eq.published',
        source_article_updated_at: `eq.${article.updated_at}`,
        limit: '1'
      }
    });

    return json(200, { translation: Array.isArray(rows) && rows[0] ? rows[0] : null });
  } catch (error) {
    console.error('Public article translation error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

exports._test = { normalizeLocale };

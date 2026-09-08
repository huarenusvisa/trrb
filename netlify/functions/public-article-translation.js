const { rest } = require('./_shared/supabase-admin');

const SUPPORTED_LOCALES = new Set(['en', 'zh-TW']);
const MAX_BATCH_IDS = 40;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLocale(value) {
  const raw = String(value || '').trim();
  if (/^en(?:[-_].*)?$/i.test(raw)) return 'en';
  if (/^zh[-_](?:TW|HK|Hant)$/i.test(raw)) return 'zh-TW';
  return SUPPORTED_LOCALES.has(raw) ? raw : '';
}

function normalizeIds(value) {
  if (!value) return [];
  const ids = String(value).split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length || ids.length > MAX_BATCH_IDS || ids.some((id) => !UUID_PATTERN.test(id))) return null;
  return [...new Set(ids)];
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
    const ids = normalizeIds(event.queryStringParameters?.ids);
    const locale = normalizeLocale(event.queryStringParameters?.locale);
    if (!locale || ids === null || (!id && !ids.length)) return json(400, { error: 'A valid id or ids list and locale are required' });

    if (ids.length) {
      const articles = await rest('articles', {
        query: {
          select: 'id,updated_at',
          id: `in.(${ids.join(',')})`,
          status: 'eq.published',
          visibility: 'eq.public',
          limit: String(MAX_BATCH_IDS)
        }
      });
      const revisions = new Map((Array.isArray(articles) ? articles : []).map((article) => [String(article.id), String(article.updated_at)]));
      if (!revisions.size) return json(200, { translations: [] });

      const articleIds = [...revisions.keys()];
      const rows = await rest('article_translations', {
        query: {
          select: 'article_id,locale,title,translation_source,reviewed_at,source_article_updated_at',
          article_id: `in.(${articleIds.join(',')})`,
          locale: `eq.${locale}`,
          status: 'eq.published',
          reviewed_by: 'not.is.null',
          reviewed_at: 'not.is.null',
          limit: String(MAX_BATCH_IDS)
        }
      });
      const translations = (Array.isArray(rows) ? rows : []).filter((row) => (
        revisions.get(String(row.article_id)) === String(row.source_article_updated_at)
      ));
      return json(200, { translations });
    }

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

exports._test = { normalizeLocale, normalizeIds, MAX_BATCH_IDS };

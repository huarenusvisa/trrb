const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');
const { translateArticle } = require('./_shared/article-ai');

const LOCALES = new Set(['en', 'zh-TW']);
const ROLES = ['owner', 'editor', 'admin'];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function validLocale(value) {
  const locale = String(value || '').trim();
  return LOCALES.has(locale) ? locale : '';
}

async function sourceArticle(id) {
  const rows = await rest('articles', { query: { select: 'id,title,summary,content,category_name,published_at,updated_at,status,visibility', id: `eq.${id}`, status: 'eq.published', visibility: 'eq.public', limit: '1' } });
  const article = Array.isArray(rows) ? rows[0] : null;
  if (!article) { const error = new Error('找不到已公开发布的原文'); error.statusCode = 404; throw error; }
  return article;
}

async function currentTranslation(articleId, locale) {
  const rows = await rest('article_translations', { query: { select: '*', article_id: `eq.${articleId}`, locale: `eq.${locale}`, limit: '1' } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function reviewedFields(body) {
  const fields = { title: safeText(body.title, 500), summary: safeText(body.summary, 5000) || null, content: safeText(body.content, 200000) };
  if (!fields.title || !fields.content) { const error = new Error('翻译标题和正文不能为空'); error.statusCode = 400; throw error; }
  return fields;
}

async function upsert(row) {
  const rows = await rest('article_translations', { method: 'POST', query: { on_conflict: 'article_id,locale' }, prefer: 'resolution=merge-duplicates,return=representation', body: row });
  return Array.isArray(rows) ? rows[0] : rows;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const actor = await authenticateStaff(event, ROLES);
    const body = JSON.parse(event.body || '{}');
    const action = safeText(body.action, 30);
    if (action === 'list') {
      const articles = await rest('articles', { query: { select: 'id,title,category_name,published_at,updated_at', status: 'eq.published', visibility: 'eq.public', order: 'published_at.desc.nullslast', limit: '50' } });
      const translations = await rest('article_translations', { query: { select: 'article_id,locale,status,reviewed_at,source_article_updated_at,updated_at', order: 'updated_at.desc', limit: '200' } });
      return json(200, { articles, translations });
    }
    const articleId = safeText(body.article_id, 120);
    const locale = validLocale(body.locale);
    if (!articleId || !locale) return json(400, { error: '缺少有效文章或目标语言' });
    const article = await sourceArticle(articleId);
    const existing = await currentTranslation(article.id, locale);
    if (action === 'get') return json(200, { article, translation: existing });
    if (action === 'generate') {
      if (existing?.status === 'published') return json(409, { error: '已发布翻译不能被 AI 草稿覆盖；请人工编辑后直接重新发布' });
      const draft = await translateArticle({ ...article, locale });
      const translation = await upsert({ article_id: article.id, locale, ...draft, source_article_updated_at: article.updated_at, status: 'draft', translation_source: 'openai_review_required', reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() });
      return json(200, { article, translation });
    }
    if (action === 'save') {
      if (existing?.status === 'published') return json(409, { error: '已发布翻译请使用“审核并发布”保存修订，避免意外下线' });
      const translation = await upsert({ article_id: article.id, locale, ...reviewedFields(body), source_article_updated_at: article.updated_at, status: 'draft', translation_source: existing?.translation_source || 'human_editor', model: existing?.model || null, reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() });
      return json(200, { article, translation });
    }
    if (action === 'publish') {
      if (body.review_confirmed !== true) return json(400, { error: '发布前必须确认已逐段完成人工核对' });
      const translation = await upsert({ article_id: article.id, locale, ...reviewedFields(body), source_article_updated_at: article.updated_at, status: 'published', translation_source: existing?.translation_source || 'human_editor', model: existing?.model || null, reviewed_by: actor.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return json(200, { article, translation });
    }
    if (action === 'reject') {
      if (!existing) return json(404, { error: '没有可拒绝的翻译草稿' });
      const translation = await upsert({ ...existing, status: 'rejected', reviewed_by: actor.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return json(200, { article, translation });
    }
    return json(400, { error: '不支持的操作' });
  } catch (error) {
    console.error('Admin article translation error:', error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};

exports._test = { validLocale, reviewedFields, ROLES };

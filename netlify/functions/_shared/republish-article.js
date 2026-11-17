'use strict';
const { createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HTTPS = /^https:\/\/[^\s]+$/;
const RESERVED = /自动加工未完成|未经编辑不得发布|【编辑提示】|此稿未通过自动加工质量检查/;

function problem(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function republishArticle(input, actor, rest, { validateExternalCover, assertNoPublishedDuplicate }) {
  if (!['owner', 'editor'].includes(actor?.admin?.role) || !UUID.test(actor?.user?.id || '')) {
    throw problem('这个账号没有发布权限。', 403);
  }
  const id = String(input.article_id || '');
  const categoryId = String(input.category_id || '');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content.replace(/\r\n?/g, '\n').trim() : '';
  const tags = typeof input.tags === 'string' ? input.tags.trim() : '';
  if (!UUID.test(id) || !UUID.test(categoryId) || !title || title.length > 220 ||
      !content || content.length > 100000 || tags.length > 2000 || /\0/.test(title + content + tags) || RESERVED.test(content)) {
    throw problem('请选择有效栏目，并填写完整标题和正文；请先移除正文中的内部编辑提示。', 400);
  }
  const cover = validateExternalCover(input.cover_image);
  const [articles, categories] = await Promise.all([
    rest('articles', { query: { id: 'eq.' + id, select: 'id,title,category_id,category_name,metadata,automation_source,source_url,status,published_at,updated_at', limit: 1 }, timeoutMs: 5000 }),
    rest('categories', { query: { id: 'eq.' + categoryId, is_active: 'eq.true', select: 'id,name', limit: 1 }, timeoutMs: 5000 })
  ]);
  const article = articles?.[0], category = categories?.[0];
  if (!article) throw problem('找不到待修改的文章。', 404);
  if (!category) throw problem('所选栏目不存在或已停用，请重新选择。', 400);
  if (article.updated_at !== input.expected_updated_at) {
    throw problem('这篇文章已被更新。请保留当前修改，重新打开文章后再提交。', 409);
  }
  if (title !== article.title || article.status !== 'published') await assertNoPublishedDuplicate(title, id);
  const now = new Date().toISOString();
  const metadata = { ...article.metadata };
  if (category.id !== article.category_id || category.name !== article.category_name) {
    metadata.human_category_override = category.name;
  }
  if (article.automation_source === 'china-hot-li-teacher-v2') {
    if (!HTTPS.test(article.source_url || '')) throw problem('这篇采编稿缺少有效来源，请先补齐来源再发布。', 422);
    if ((content.replace(/<[^>]*>/g, '').match(/[㐀-鿿]/g) || []).length < 50) {
      throw problem('采编稿修改后的正文至少需要50个中文字符，请补充正文后再发布。', 422);
    }
    metadata.publisher_authorized_release = {
      version: '1',
      approved: true,
      content_sha256: createHash('sha256').update(title + '\n' + content).digest('hex'),
      source_url: article.source_url,
      approved_by: actor.user.id,
      instruction: 'Authenticated editor explicitly selected publish for this revision.',
      approved_at: now
    };
    if (!HTTPS.test(cover)) metadata.homepage_focus_override = 'exclude';
  }
  const rows = await rest('articles', {
    method: 'PATCH',
    query: { id: 'eq.' + id, updated_at: article.updated_at == null ? 'is.null' : 'eq.' + article.updated_at, select: 'id,status,visibility,category_name,publication_path' },
    body: {
      title, content, cover_image: cover, category_id: category.id, category_name: category.name,
      seo_keywords: tags, seo_title: title, metadata, status: 'published', visibility: 'public',
      published_at: article.status === 'published' && article.published_at ? article.published_at : now,
      updated_at: now
    },
    prefer: 'return=representation',
    timeoutMs: 12000
  });
  if (!rows?.[0]) throw problem('文章在保存前有了新版本，请重新打开后再提交。', 409);
  return rows[0];
}
module.exports = { republishArticle };

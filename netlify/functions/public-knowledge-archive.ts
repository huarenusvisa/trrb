import { rest } from './_shared/supabase-admin.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

export default async (request: Request) => {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  const params = new URL(request.url).searchParams;
  const path = params.get('path') || 'humanitarian';
  const topic = params.get('topic') || '';
  if (!['humanitarian', 'change-status', 'family'].includes(path) || (topic && !/^[a-z0-9-]{1,60}$/.test(topic))) {
    return new Response(JSON.stringify({ articles: [] }), { headers });
  }
  try {
    const articles = await rest('articles', { query: {
      select: 'id,title,summary,canonical_url,published_at',
      status: 'eq.published', visibility: 'eq.public',
      category_name: 'like.移民美国·*',
      'metadata->>knowledge_migration_batch': 'eq.20260923-asylum-knowledge',
      'metadata->>knowledge_path': `eq.${path}`,
      ...(topic ? { 'metadata->>knowledge_topic': `eq.${topic}` } : {}),
      order: 'published_at.desc.nullslast,id.desc', limit: '200'
    } });
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ articles }), { headers });
  } catch (error) {
    console.error('Knowledge archive unavailable', error);
    return new Response(JSON.stringify({ error: '暂时无法读取历史知识文章。' }), { status: 503, headers });
  }
};

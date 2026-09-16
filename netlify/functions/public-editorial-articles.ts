import { rest } from './_shared/supabase-admin.js';
import { POLITICS_FILTER, ENFORCEMENT_FILTER, editorialTopics, isChinaPolitical } from '../shared/editorial-topics.mjs';
import policy from '../../article-editorial-policy.js';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
export default async (request: Request) => {
  if (request.method !== 'GET') return json(405, {error:'Method not allowed'});
  const params = new URL(request.url).searchParams;
  const category = params.get('category') || '';
  const filter = category === '中国政治' ? POLITICS_FILTER : category === '美国执法与警情' ? ENFORCEMENT_FILTER : '';
  if (!filter) return json(400, {error:'Unknown editorial section'});
  const number = (value: string | null, fallback: number) => Number.isFinite(Number(value)) && value !== null ? Math.floor(Number(value)) : fallback;
  const limit = Math.min(60, Math.max(1, number(params.get('limit'),30)));
  const offset = Math.max(0, number(params.get('offset'),0));
  const q = (params.get('q') || '').replace(/[(),*]/g,' ').trim().slice(0,120);
  try {
    const query: Record<string,string> = {
      select:'id,title,slug,summary,content,category_name,topic_key,cover_image,author,published_at,created_at,publication_scope:metadata->>publication_scope',
      status:'eq.published', visibility:'eq.public', published_at:`lte.${new Date().toISOString()}`,
      or:filter, order:'published_at.desc.nullslast,created_at.desc,id.desc', limit:String(limit), offset:String(offset)
    };
    if(q) query.and = `(or(title.ilike.*${q}*,summary.ilike.*${q}*))`;
    const rows = await rest('articles',{query});
    const rawRows = Array.isArray(rows) ? rows : [];
    const articles = rawRows.filter(row => category !== '中国政治' || isChinaPolitical(row)).map(({content,...row}) => ({...row, editorial_topics:editorialTopics(row),body_character_count:policy.bodyCharacterCount(content),editorial_policy_version:policy.VERSION}));
    return json(200,{articles,category,q:q || null,offset,limit,has_more:rawRows.length === limit,next_offset:rawRows.length === limit ? offset+limit : null,generated_at:new Date().toISOString()});
  } catch(error) { console.error('Editorial articles API failed',error); return json(503,{error:'新闻暂时无法加载，请稍后重试'}); }
};

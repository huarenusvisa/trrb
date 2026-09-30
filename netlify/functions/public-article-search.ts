import { rest } from './_shared/supabase-admin.js';
import reader from './_shared/article-list-reader.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export default async (request: Request) => {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  try {
    const input = Object.fromEntries(new URL(request.url).searchParams);
    const result = await reader.readArticleList(input,{publicOnly:true},rest);

    return new Response(request.method === 'HEAD' ? null : JSON.stringify(result), { headers });
  } catch (error) {
    console.error('Public article search failed', error);
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: '搜索暂时无法加载，请稍后重试。' }), { status: 503, headers });
  }
};

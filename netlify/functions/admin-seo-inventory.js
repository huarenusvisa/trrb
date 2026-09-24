const { authenticateAdmin, rest } = require('./_shared/supabase-admin');
exports.handler = async event => {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try {
    if (event.httpMethod !== 'POST') return {statusCode:405,headers,body:'{}'};
    await authenticateAdmin(event);
    const input=JSON.parse(event.body || '{}');
    const rows=await rest('seo_content_inventory_runs',{query:{select:'id,created_at,commit_sha,summary,items',order:'created_at.desc',limit:'1'}});
    if (!rows.length) return {statusCode:200,headers,body:JSON.stringify({summary:null,items:[],message:'全量台账尚未生成'})};
    const run=rows[0], page=Math.max(1,Math.floor(Number(input.page)||1));
    const query=String(input.q||'').trim().slice(0,200).toLowerCase();
    const all=run.items.filter(x=>(!input.pilot || x.pilot) && (!input.issue || x.issues.includes(input.issue)) && (!query || `${x.title} ${x.url} ${x.id}`.toLowerCase().includes(query)));
    return {statusCode:200,headers,body:JSON.stringify({...run,items:all.slice((page-1)*50,page*50),total:all.length,page,has_more:page*50<all.length})};
  } catch(error) {return {statusCode:error.statusCode || 500,headers,body:JSON.stringify({error:error.message})};}
};

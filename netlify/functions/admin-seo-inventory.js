const { authenticateAdmin, rest } = require('./_shared/supabase-admin');
exports.handler = async event => {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  try {
    if (event.httpMethod !== 'POST') return {statusCode:405,headers,body:'{}'};
    await authenticateAdmin(event);
    const input=JSON.parse(event.body || '{}');
    const data=await rest('rpc/seo_inventory_page',{method:'POST',body:{p_page:Math.max(1,Math.floor(Number(input.page)||1)),p_query:String(input.q||'').slice(0,200),p_pilot:input.pilot===true,p_issue:String(input.issue||'').slice(0,100)}});
    return {statusCode:200,headers,body:JSON.stringify(data || {summary:null,items:[],message:'全量台账尚未生成'})};
  } catch(error) {return {statusCode:error.statusCode || 500,headers,body:JSON.stringify({error:error.message})};}
};

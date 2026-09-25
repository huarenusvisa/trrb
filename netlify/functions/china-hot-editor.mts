import admin from './_shared/supabase-admin.js';
import editor from './_shared/china-hot-editor.js';
export default async (request:Request) => {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  if(request.method!=='POST')return new Response(JSON.stringify({error:'仅支持POST'}),{status:405,headers});
  try {
    const {user}=await admin.authenticateAdmin({headers:{authorization:request.headers.get('authorization')||''}});
    const result=await editor.handleChinaEdit(await request.json(),user,{rest:admin.rest});
    return new Response(JSON.stringify(result),{headers});
  }catch(error:any){return new Response(JSON.stringify({error:error.message||'编辑操作失败'}),{status:Number(error.statusCode)||500,headers});}
};

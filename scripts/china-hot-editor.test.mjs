import test from 'node:test';
import assert from 'node:assert/strict';
import editor from '../netlify/functions/_shared/china-hot-editor.js';
import admin from '../netlify/functions/_shared/supabase-admin.js';
import endpoint from '../netlify/functions/china-hot-editor.mts';
const {handleChinaEdit}=editor;

function fixture({race=false,duplicate=false,decision='review_required'}={}){
  const candidate={id:1,decision,pipeline:'china-hot-li-teacher-v2',article_id:'article-1',updated_at:'2026-09-25T16:00:00Z',source_url:'https://example.org/report',raw_text:'原文保留',ai_payload:{context_research:{sources:[]}}};
  const article={id:'article-1',status:'draft',visibility:'private',updated_at:candidate.updated_at,metadata:{editorial_depth:'deep',editorial_review:{grounded:true},publication_blocked_until_edited:true}};
  const calls=[];
  const rest=async(table,options={})=>{
    calls.push({table,...structuredClone(options)});
    if(!options.method){
      if(table==='news_candidates')return [structuredClone(candidate)];
      if(options.query?.status==='eq.published')return duplicate?[{id:'other-article'}]:[];
      return [structuredClone(article)];
    }
    const row=table==='news_candidates'?candidate:article;
    if(options.method==='PATCH'){
      if(race&&table==='articles')return [];
      assert.equal(options.query.updated_at,'eq.'+row.updated_at,'every edit checks the loaded version');
      Object.assign(row,structuredClone(options.body));return [structuredClone(row)];
    }
    throw new Error('unexpected mutation');
  };
  const input={action:'save',id:1,updated_at:candidate.updated_at,title:'法院公开裁定全文',summary:'编辑核对公开记录',content:'法院公开了裁定全文，文件说明本案程序进展和适用范围。相关部门后续回应仍以其正式公布的材料为准。编辑已比对原始文件与报道中的核心事实。'};
  return {candidate,article,calls,input,context:{rest,now:()=> '2026-09-25T17:00:00Z'}};
}
const confirmed={facts_confirmed:true,freshness_confirmed:true,evidence_urls:['https://www.justice.gov/opa/report'],verification_note:'已逐项比对原始文件中的日期、核心事实与新进展。'};

test('saved drafts retain original evidence, remain private and protect human edits',async()=>{
  const f=fixture();await handleChinaEdit(f.input,{id:'editor-1'},f.context);
  assert.equal(f.candidate.raw_text,'原文保留');assert.equal(f.candidate.ai_payload.manual_editor_lock,true);
  assert.equal(f.article.status,'draft');assert.equal(f.article.visibility,'private');
  assert.equal(f.article.metadata.editorial_review,null);assert.equal(f.article.metadata.editorial_depth,'brief');
});
test('publishing requires fresh factual verification and publishes public state with audit metadata',async()=>{
  const f=fixture();
  await assert.rejects(()=>handleChinaEdit({...f.input,action:'publish'},{id:'editor'},f.context),/核对事实/);
  assert.equal(f.calls.some(x=>x.method),false);
  await assert.rejects(()=>handleChinaEdit({...f.input,...confirmed,action:'publish',content:f.input.content+'【编辑提示】此稿未通过自动加工质量检查'},{id:'editor'},f.context),/占位草稿/);
  await handleChinaEdit({...f.input,...confirmed,action:'publish'},{id:'editor'},f.context);
  assert.equal(f.article.status,'published');assert.equal(f.article.visibility,'public');
  assert.equal(f.article.metadata.manual_verified_by,'editor');assert.equal(f.article.metadata.homepage_focus_override,'exclude');
  assert.equal(f.candidate.decision,'published');
});
test('duplicate or concurrently changed drafts cannot be published or overwritten',async()=>{
  const duplicate=fixture({duplicate:true});
  await assert.rejects(()=>handleChinaEdit({...duplicate.input,...confirmed,action:'publish'},{id:'editor'},duplicate.context),/同源或同标题/);
  assert.equal(duplicate.calls.some(x=>x.method),false);
  const race=fixture({race:true});
  await assert.rejects(()=>handleChinaEdit(race.input,{id:'editor'},race.context),/文章已被修改/);
  assert.equal(race.article.status,'draft');assert.equal(race.candidate.decision,'review_required');
  const stale=fixture();
  await assert.rejects(()=>handleChinaEdit({...stale.input,updated_at:'old'},{id:'editor'},stale.context),/其他操作修改/);
  for(const decision of ['duplicate','deleted','published']){
    const f=fixture({decision});await assert.rejects(()=>handleChinaEdit(f.input,{id:'editor'},f.context),/已删除、重复或发布/);
  }
});
test('editor endpoint requires the existing owner/editor authentication',async t=>{
  t.mock.method(admin,'authenticateAdmin',async()=>{throw Object.assign(new Error('需要登录'),{statusCode:401});});
  const response=await endpoint(new Request('https://example.org/editor',{method:'POST',body:'{}'}));
  assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await endpoint(new Request('https://example.org/editor'))).status,405);
});

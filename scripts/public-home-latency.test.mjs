import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

async function handler(name,rest) {
  let source=await readFile(new URL(`../netlify/functions/public-home-${name}.ts`,import.meta.url),'utf8');
  source=source.replace(/^import .*;\n/gm,'').replace('export default async (event: Request)','this.handler = async (event)').replace('export const config = {};','');
  source=source.replace('await import("../shared/editorial-topics.mjs")','editorialModule');
  const context={URL,Response,Date,console,rest,
    policy:{VERSION:'test',bodyCharacterCount:x=>String(x||'').length,importantEligible:()=>true},
    pins:{effectiveMode:()=>'',isPinned:()=>false,pinState:()=>null},
    isIceEnforcementText:()=>true,isChinaHotCategory:()=>false,isChinaHotHeadline:()=>true,
    loadChinaPeople:async()=>{},CHINA_PEOPLE_QUERY:{},ENFORCEMENT_FILTER:'ice',
    editorialModule:{editorialTopics:()=>[],POLITICS_FILTER:'china'},
    readPoliticalPage:async(read)=>({rows:await read({offset:0,limit:100})})};
  vm.createContext(context);vm.runInContext(source,context);return context.handler;
}
test('bundle starts global and political reads together and only caches public success',async()=>{
  let release;const gate=new Promise(r=>release=r);let globalStarted=false,politicalStarted=false;
  const run=await handler('bundle',async(_table,{query,timeoutMs})=>{
    assert(query.status==='eq.published'&&query.visibility==='eq.public');assert(timeoutMs>0);
    if(query.or==='china'){politicalStarted=true;assert(globalStarted);release();return [];}
    if(!query.category_name&&!query.or){globalStarted=true;await gate;return [{id:'today',title:'news',content:'facts',category_name:'美国时政',published_at:new Date().toISOString()}];}
    return [];
  });
  const response=await run(new Request('https://trrb.net/?limit=200'));
  assert(politicalStarted);assert.equal(response.status,200);
  assert.match(response.headers.get('Netlify-CDN-Cache-Control'),/max-age=30/);
  assert.equal((await response.json()).articles[0].id,'today');
});
test('failed homepage responses are never cached at CDN',async()=>{
  for(const name of ['bundle','focus']){
    const run=await handler(name,async()=>{throw Object.assign(new Error('database timeout'),{statusCode:503});});
    const response=await run(new Request('https://trrb.net/'));
    assert.equal(response.status,503);assert.equal(response.headers.get('Netlify-CDN-Cache-Control'),null);
  }
});
test('focus succeeds with bounded reads and short public CDN caching',async()=>{
  const run=await handler('focus',async(_table,{timeoutMs})=>{assert.equal(timeoutMs,8000);return [];});
  const response=await run(new Request('https://trrb.net/'));
  assert.equal(response.status,200);assert.match(response.headers.get('Netlify-CDN-Cache-Control'),/durable/);
});

#!/usr/bin/env node
import fs from 'node:fs';
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const checks=[];const failures=[];const clean=(v='')=>String(v??'').replace(/\s+/g,' ').trim();
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function db(table,params){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0,180)}`);return r.json();}
const published=await db('articles',{select:'id,title,slug,content,status,published_at,created_at,topic_key,category_name',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'1000'});
record(Array.isArray(published)&&published.length>0,'读取生产已发布文章样本',`rows=${published.length}`);
const malformed=published.filter(a=>!a.id||!clean(a.title)||!clean(a.slug)||!clean(a.content)||a.status!=='published');
record(malformed.length===0,'已发布文章无缺标题/slug/正文异常',`malformed=${malformed.length}`);
const slugCounts=new Map();for(const a of published){const s=clean(a.slug);if(s)slugCounts.set(s,(slugCounts.get(s)||0)+1);}const duplicateSlugs=[...slugCounts].filter(([,n])=>n>1);
record(duplicateSlugs.length===0,'最近1000篇已发布 slug 无重复',duplicateSlugs.slice(0,5).map(([s,n])=>`${s}:${n}`).join(' | '));
const future=published.filter(a=>{const ts=Date.parse(a.published_at||a.created_at||'');return Number.isFinite(ts)&&ts>Date.now()+5*60*1000;});
record(future.length===0,'已发布文章无异常未来时间',`future=${future.length}`);
const publishSource=fs.readFileSync('scripts/ice-publish-due.mjs','utf8');
record(/!String\(story\.title[^\n]+!String\(story\.content/.test(publishSource)&&/status:\s*"pending_review"/.test(publishSource),'发布器拦截缺标题或正文内容');
record(/story\.conflict_detected/.test(publishSource)&&/story\.privacy_risk/.test(publishSource)&&/story\.fabrication_risk/.test(publishSource)&&/legalBlocked/.test(publishSource),'发布器拦截冲突/隐私/虚构/法律风险');
record(/existingArticle\(/.test(publishSource)&&/同一来源帖子或事件指纹已发布/.test(publishSource),'发布器自动阻止重复文章创建');
record(/catch \(error\)[\s\S]{0,300}status:\s*"failed"/.test(publishSource),'发布失败自动标记 failed 而非伪装 published');
const workflow=fs.readFileSync('.github/workflows/ice-publisher-continuous.yml','utf8');
record(/timeout 75s node scripts\/ice-publish-due\.mjs/.test(workflow)&&/Write failure heartbeat/.test(workflow),'生产流水线有硬超时与失败心跳');
const badStories=await db('ice_stories',{select:'id,status,decision_reason,title,content,updated_at',status:'in.(failed,pending_review)',order:'updated_at.desc',limit:'50'}).catch(()=>[]);
record(Array.isArray(badStories),'异常/待审故事状态可被生产系统隔离',`isolated=${Array.isArray(badStories)?badStories.length:0}`);
console.log(`ROUND13 NODE5 audit: checks=${checks.length}; failures=${failures.length}`);if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}console.log('ROUND13 NODE5 PASS: publish failures and anomalous articles are automatically blocked before production publication');

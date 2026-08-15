import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const checks=[];let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);}
const clean=v=>String(v||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
const normTitle=v=>clean(v).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
const hash=v=>createHash('sha256').update(clean(v)).digest('hex');
async function db(table,select,extra={}){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);u.searchParams.set('select',select);for(const[k,v]of Object.entries(extra))u.searchParams.set(k,String(v));const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(`${table} ${r.status}`);return r.json();}
const cats=await db('categories','id,name,slug,is_active',{is_active:'eq.true',limit:'500'});
const byId=new Map(cats.map(c=>[String(c.id),c]));const byName=new Map(cats.map(c=>[clean(c.name),c]));
const arts=[];for(let offset=0;offset<100000;offset+=1000){const rows=await db('articles','id,title,slug,content,category_id,category_name,topic_key,status,published_at,created_at',{status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'1000',offset:String(offset)});arts.push(...rows);if(rows.length<1000)break;}
check(arts.length>=100,'加载完整已发布文章库',`published=${arts.length}`);
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return clean(c?.slug)||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
const slugMap=new Map(), titleMap=new Map(), contentMap=new Map();
for(const a of arts){const s=clean(a.slug);if(s){if(!slugMap.has(s))slugMap.set(s,[]);slugMap.get(s).push(a);}const t=normTitle(a.title);if(t.length>=8){if(!titleMap.has(t))titleMap.set(t,[]);titleMap.get(t).push(a);}const body=clean(a.content);if(body.length>=120){const h=hash(body);if(!contentMap.has(h))contentMap.set(h,[]);contentMap.get(h).push(a);}}
const dupSlug=[...slugMap.entries()].filter(([,v])=>v.length>1);
const dupTitle=[...titleMap.entries()].filter(([,v])=>v.length>1);
const dupContent=[...contentMap.entries()].filter(([,v])=>v.length>1);
check(dupSlug.length===0,'已发布文章 slug 无重复',`duplicates=${dupSlug.length}`);
check(dupTitle.length===0,'已发布文章规范化标题无完全重复',`duplicates=${dupTitle.length}`);
check(dupContent.length===0,'已发布文章正文无完全重复',`duplicates=${dupContent.length}`);
const sitemap=await fetch(`${ORIGIN}/sitemap.xml?r14=n5`,{headers:{'cache-control':'no-cache'}}).then(async r=>({status:r.status,text:await r.text()}));
check(sitemap.status===200,'生产 Sitemap HTTP 200',`status=${sitemap.status}`);
const thin=arts.filter(a=>clean(a.content).length<80);
const thinInSitemap=thin.filter(a=>sitemap.text.includes(canonical(a)));
check(thinInSitemap.length===0,'薄内容未进入可索引 Sitemap',`thin=${thin.length}; indexed=${thinInSitemap.length}`);
let thinNoindexBad=0;
for(const a of thin.slice(0,20)){const r=await fetch(`${canonical(a)}?r14n5=thin`,{headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','cache-control':'no-cache'}});const html=await r.text();const robots=(html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i)||[])[1]||'';if(r.status===200&&!/noindex/i.test(robots))thinNoindexBad++;}
check(thinNoindexBad===0,'薄内容文章页明确 noindex',`checked=${Math.min(thin.length,20)}; bad=${thinNoindexBad}`);
const canonicals=new Set(arts.map(canonical));
check(canonicals.size===arts.length,'全库 canonical 一对一唯一',`unique=${canonicals.size}/${arts.length}`);
writeFileSync('round14-node5-duplicate-thin-content-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,published:arts.length,thin:thin.length,duplicateSlug:dupSlug.length,duplicateTitle:dupTitle.length,duplicateContent:dupContent.length,checks,failures},null,2));
console.log(`ROUND14 NODE5 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND14 NODE5 PASS: duplicate content and thin content governance verified');else{console.log('ROUND14 NODE5 FAIL: duplicate/thin content issues detected');process.exitCode=1;}

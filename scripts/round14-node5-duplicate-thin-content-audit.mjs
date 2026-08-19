// Round 14 node5 production audit.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const ALIASES={important:'important-news',hot:'hot-headlines',politics:'us-politics',crime:'us-crime',china:'china-officialdom'};
const FALLBACK={'重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime','中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport','ICE执法动态':'ice','ICE执法':'ice','曝光墙':'expose'};
const checks=[];let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);}
const clean=v=>String(v||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
const canonicalSection=v=>ALIASES[clean(v)]||clean(v);
const normTitle=v=>clean(v).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
const hash=v=>createHash('sha256').update(clean(v)).digest('hex');
const isIce=a=>clean(a?.topic_key).toLowerCase()==='ice'||['ICE执法动态','ICE执法'].includes(clean(a?.category_name));
async function db(table,select,extra={}){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);u.searchParams.set('select',select);for(const[k,v]of Object.entries(extra))u.searchParams.set(k,String(v));const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(`${table} ${r.status}`);return r.json();}
const cats=await db('categories','id,name,slug,is_active',{is_active:'eq.true',limit:'500'});
const byId=new Map(cats.map(c=>[String(c.id),c]));const byName=new Map(cats.map(c=>[clean(c.name),c]));
const arts=[];for(let offset=0;offset<100000;offset+=1000){const rows=await db('articles','id,title,slug,summary,content,category_id,category_name,topic_key,status,published_at,created_at',{status:'eq.published',order:'published_at.asc.nullslast,created_at.asc',limit:'1000',offset:String(offset)});arts.push(...rows);if(rows.length<1000)break;}
check(arts.length>=100,'加载完整已发布文章库',`published=${arts.length}`);
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return canonicalSection(clean(c?.slug)||FALLBACK[clean(a.category_name)]||'news');}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
const slugMap=new Map(), titleMap=new Map(), contentMap=new Map();
for(const a of arts){const s=clean(a.slug);if(s){if(!slugMap.has(s))slugMap.set(s,[]);slugMap.get(s).push(a);}const t=normTitle(a.title);if(t.length>=8){if(!titleMap.has(t))titleMap.set(t,[]);titleMap.get(t).push(a);}const body=clean(a.content);if(body.length>=120){const h=hash(body);if(!contentMap.has(h))contentMap.set(h,[]);contentMap.get(h).push(a);}}
const dupSlug=[...slugMap.entries()].filter(([,v])=>v.length>1);
const dupTitle=[...titleMap.entries()].filter(([,v])=>v.length>1);
const dupContent=[...contentMap.entries()].filter(([,v])=>v.length>1);
check(dupSlug.length===0,'已发布文章 slug 无重复',`duplicates=${dupSlug.length}`);

const sitemap=await fetch(`${ORIGIN}/sitemap.xml?r14=n5-${Date.now()}`,{headers:{'cache-control':'no-cache'}}).then(async r=>({status:r.status,headers:Object.fromEntries(r.headers.entries()),text:await r.text()}));
check(sitemap.status===200,'生产 Sitemap HTTP 200',`status=${sitemap.status}`);

function indexedCount(group){return group.filter(a=>sitemap.text.includes(canonical(a))).length;}
const titleCompeting=dupTitle.filter(([,group])=>indexedCount(group)>1);
const contentCompeting=dupContent.filter(([,group])=>indexedCount(group)>1);
check(titleCompeting.length===0,'重复标题组最多一个URL进入可索引 Sitemap',`duplicateGroups=${dupTitle.length}; competing=${titleCompeting.length}`);
check(contentCompeting.length===0,'重复正文组最多一个URL进入可索引 Sitemap',`duplicateGroups=${dupContent.length}; competing=${contentCompeting.length}`);

const thinNonIce=arts.filter(a=>!isIce(a)&&clean(a.content||a.summary).length<80);
const thinNonIceInSitemap=thinNonIce.filter(a=>sitemap.text.includes(canonical(a)));
check(thinNonIceInSitemap.length===0,'非ICE薄内容未进入可索引 Sitemap',`thinNonIce=${thinNonIce.length}; indexed=${thinNonIceInSitemap.length}`);

const shortIce=arts.filter(a=>isIce(a)&&clean(a.content||a.summary).length>0&&clean(a.content||a.summary).length<80);
const shortIceInSitemap=shortIce.filter(a=>sitemap.text.includes(canonical(a)));
check(shortIce.length===0||shortIceInSitemap.length>0,'短ICE快讯不会仅因篇幅短被整体排除',`shortIce=${shortIce.length}; indexed=${shortIceInSitemap.length}`);
const sitemapMarker=sitemap.headers['x-trrb-sitemap']||'';
const immigrationKnowledgeCount=Number(sitemap.headers['x-trrb-sitemap-immigration-knowledge']||'0');
check(/live-supabase-v5-static-authority-aligned/i.test(sitemapMarker),'Sitemap 已启用静态权威对齐、专题保护、ICE短讯保护与重复治理版本',sitemapMarker||'missing');
check(immigrationKnowledgeCount>=62,'Live Sitemap 已继承完整移民知识分类与专题入口',`count=${immigrationKnowledgeCount}`);
check(sitemap.text.includes(`<loc>${ORIGIN}/legal/</loc>`),'Live Sitemap 保留法律数据库入口');
check(sitemap.text.includes(`<loc>${ORIGIN}/immigrate/center?path=study</loc>`),'Live Sitemap 保留移民知识分类入口');
check(sitemap.text.includes(`<loc>${ORIGIN}/immigrate/center?path=study&amp;topic=f1</loc>`),'Live Sitemap 保留移民知识专题入口');
check(!new RegExp(`<loc>${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/(?:jobs|finance|people)(?:/|\\?|<)`,'i').test(sitemap.text),'预上线或退役产品未进入 Live Sitemap');

let thinNonIceNoindexBad=0;
for(const a of thinNonIce.slice(0,20)){const r=await fetch(`${canonical(a)}?r14n5=thin`,{headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','cache-control':'no-cache'}});const html=await r.text();const robots=(html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)[^>]+name=["']robots["']/i)||[])[1]||'';if(r.status===200&&!/noindex/i.test(robots))thinNonIceNoindexBad++;}
check(thinNonIceNoindexBad===0,'非ICE薄内容文章页明确 noindex',`checked=${Math.min(thinNonIce.length,20)}; bad=${thinNonIceNoindexBad}`);

let shortIceNoindexBad=0;
for(const a of shortIce.slice(0,20)){const r=await fetch(`${canonical(a)}?r14n5=ice-short`,{headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','cache-control':'no-cache'}});const html=await r.text();const robots=(html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)[^>]+name=["']robots["']/i)||[])[1]||'';if(r.status===200&&/noindex/i.test(robots))shortIceNoindexBad++;}
check(shortIceNoindexBad===0,'短ICE快讯不会仅因篇幅短被文章页 noindex',`checked=${Math.min(shortIce.length,20)}; noindex=${shortIceNoindexBad}`);

const canonicals=new Set(arts.map(canonical));
check(canonicals.size===arts.length,'全库 canonical 一对一唯一',`unique=${canonicals.size}/${arts.length}`);
writeFileSync('round14-node5-duplicate-thin-content-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,published:arts.length,thinNonIce:thinNonIce.length,shortIce:shortIce.length,shortIceIndexed:shortIceInSitemap.length,duplicateSlug:dupSlug.length,duplicateTitleGroups:dupTitle.length,duplicateContentGroups:dupContent.length,titleCompeting:titleCompeting.length,contentCompeting:contentCompeting.length,sitemapMarker,immigrationKnowledgeCount,checks,failures},null,2));
console.log(`ROUND14 NODE5 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND14 NODE5 PASS: duplicate/thin governance and v5 static sitemap authority verified without length-only ICE exclusion');else{console.log('ROUND14 NODE5 FAIL: duplicate/thin or static sitemap authority issues detected');process.exitCode=1;}

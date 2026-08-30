import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SITE='https://trrb.net';
const base=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'';
const clean=(v='')=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim();
const escapeXml=(v='')=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const FALLBACK={
  '重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime',
  '中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport',
  'ICE执法动态':'ice','ICE执法':'ice'
};
const ALIASES={important:'important-news',hot:'hot-headlines',politics:'us-politics',crime:'us-crime',china:'china-officialdom'};
const canonicalSection=(v='')=>ALIASES[clean(v)]||clean(v);
const isSpecialTopic=(article)=>{const topic=clean(article?.topic_key).toLowerCase();return topic==='trump'||topic==='ice';};
const mimeFromUrl=(value='')=>{const pathname=String(value).split('?')[0].toLowerCase();if(pathname.endsWith('.png'))return'image/png';if(pathname.endsWith('.webp'))return'image/webp';if(pathname.endsWith('.gif'))return'image/gif';if(pathname.endsWith('.avif'))return'image/avif';return'image/jpeg';};

async function rest(pathname,params){
  if(!base||!key)return[];
  const url=new URL(`${base}/rest/v1/${pathname}`);
  Object.entries(params||{}).forEach(([k,v])=>url.searchParams.set(k,v));
  const response=await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});
  if(!response.ok)throw new Error(`${pathname} ${response.status} ${(await response.text()).slice(0,200)}`);
  const rows=await response.json();
  return Array.isArray(rows)?rows:[];
}

async function loadCategories(){
  try{return await rest('categories',{select:'id,name,slug,is_active,include_in_rss',is_active:'eq.true'});}
  catch(error){console.warn(`[feed] category CMS unavailable: ${error.message}`);return[];}
}
async function loadPublishedArticles(){
  if(!base||!key){console.warn('[feed] Supabase unavailable; empty feed');return[];}
  return rest('articles',{select:'id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,published_at,created_at,status',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'200'});
}

const [categories,rawArticles]=await Promise.all([loadCategories(),loadPublishedArticles()]);
const allowedIds=new Set(categories.filter(x=>x.include_in_rss!==false).map(x=>String(x.id)));
const allowedNames=new Set(categories.filter(x=>x.include_in_rss!==false).map(x=>String(x.name)));
const allowedSlugs=new Set(categories.filter(x=>x.include_in_rss!==false).map(x=>canonicalSection(x.slug)));
const byId=new Map(categories.map(x=>[String(x.id||''),x]));
const byName=new Map(categories.map(x=>[clean(x.name),x]));
const articles=(categories.length?rawArticles.filter(x=>{
  if(isSpecialTopic(x))return true;
  if(x.category_id)return allowedIds.has(String(x.category_id));
  if(!x.category_name)return true;
  const name=clean(x.category_name);const fallbackSlug=canonicalSection(FALLBACK[name]||'');
  return allowedNames.has(name)||Boolean(fallbackSlug&&allowedSlugs.has(fallbackSlug));
}):rawArticles).slice(0,100);

function articleSection(article){
  const topic=clean(article?.topic_key).toLowerCase();
  if(topic==='trump')return'trump';
  if(topic==='ice')return'ice';
  const idSlug=clean(byId.get(String(article?.category_id||''))?.slug);
  if(idSlug)return canonicalSection(idSlug);
  const nameSlug=clean(byName.get(clean(article?.category_name))?.slug);
  if(nameSlug)return canonicalSection(nameSlug);
  return FALLBACK[clean(article?.category_name)]||'news';
}
function articleUrl(article){
  const slug=clean(article?.slug)||clean(article?.id);
  return slug?`${SITE}/${encodeURIComponent(articleSection(article))}/${encodeURIComponent(slug)}`:SITE+'/';
}

const newestFeedDate=new Date(articles[0]?.published_at||articles[0]?.created_at||0);
const buildDate=Number.isNaN(newestFeedDate.getTime())?'Thu, 01 Jan 1970 00:00:00 GMT':newestFeedDate.toUTCString();
const items=articles.map(article=>{
  const link=articleUrl(article);
  const title=clean(article.title||'唐人日报新闻');
  const description=clean(article.summary||article.content||'').slice(0,500);
  const published=new Date(article.published_at||article.created_at||0);
  const pubDate=Number.isNaN(published.getTime())?buildDate:published.toUTCString();
  const category=clean(article.category_name||'新闻');
  const enclosure=clean(article.cover_image||'');
  return `    <item>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink="true">${escapeXml(link)}</guid>\n      <pubDate>${escapeXml(pubDate)}</pubDate>\n      <category>${escapeXml(category)}</category>\n      <description>${escapeXml(description)}</description>${enclosure?`\n      <enclosure url="${escapeXml(enclosure)}" type="${mimeFromUrl(enclosure)}" />`:''}\n    </item>`;
}).join('\n');
const feed=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>唐人日报 Tang Ren Daily</title>\n    <link>${SITE}/</link>\n    <description>立足美国，服务华人，提供美国时政、移民、ICE执法、中国官场及华人社区新闻。</description>\n    <language>zh-cn</language>\n    <lastBuildDate>${buildDate}</lastBuildDate>\n    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;
fs.writeFileSync(path.join(ROOT,'feed.xml'),feed);
console.log(`[feed] generated ${articles.length} canonical items using ${categories.length} category settings; lastBuildDate=${buildDate}`);

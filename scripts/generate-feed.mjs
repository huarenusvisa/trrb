import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const SITE='https://www.trrb.net';
const base=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'';
const clean=(v='')=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').replace(/\s+/g,' ').trim();
const escapeXml=(v='')=>clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const articleUrl=(article)=>`${SITE}/article.html?id=${encodeURIComponent(article.id)}`;
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
  try{return await rest('categories',{select:'id,name,is_active,include_in_rss',is_active:'eq.true'});}
  catch(error){console.warn(`[feed] category CMS unavailable: ${error.message}`);return[];}
}
async function loadPublishedArticles(){
  if(!base||!key){console.warn('[feed] Supabase unavailable; empty feed');return[];}
  return rest('articles',{select:'id,title,summary,content,category_id,category_name,cover_image,published_at,created_at,status',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'200'});
}

const [categories,rawArticles]=await Promise.all([loadCategories(),loadPublishedArticles()]);
const allowedIds=new Set(categories.filter(x=>x.include_in_rss!==false).map(x=>String(x.id)));
const allowedNames=new Set(categories.filter(x=>x.include_in_rss!==false).map(x=>String(x.name)));
const articles=(categories.length?rawArticles.filter(x=>x.category_id?allowedIds.has(String(x.category_id)):(!x.category_name||allowedNames.has(String(x.category_name)))):rawArticles).slice(0,100);
const buildDate=new Date().toUTCString();
const items=articles.map(article=>{
  const link=articleUrl(article);
  const title=clean(article.title||'唐人日报新闻');
  const description=clean(article.summary||article.content||'').slice(0,500);
  const published=new Date(article.published_at||article.created_at||Date.now());
  const pubDate=Number.isNaN(published.getTime())?buildDate:published.toUTCString();
  const category=clean(article.category_name||'新闻');
  const enclosure=clean(article.cover_image||'');
  return `    <item>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(link)}</link>\n      <guid isPermaLink="true">${escapeXml(link)}</guid>\n      <pubDate>${escapeXml(pubDate)}</pubDate>\n      <category>${escapeXml(category)}</category>\n      <description>${escapeXml(description)}</description>${enclosure?`\n      <enclosure url="${escapeXml(enclosure)}" type="${mimeFromUrl(enclosure)}" />`:''}\n    </item>`;
}).join('\n');
const feed=`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>唐人日报 Tang Ren Daily</title>\n    <link>${SITE}/</link>\n    <description>立足美国，服务华人，提供美国时政、移民、ICE执法、中国官场及华人社区新闻。</description>\n    <language>zh-cn</language>\n    <lastBuildDate>${buildDate}</lastBuildDate>\n    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;
fs.writeFileSync(path.join(ROOT,'feed.xml'),feed);
console.log(`[feed] generated ${articles.length} items using ${categories.length} category settings`);

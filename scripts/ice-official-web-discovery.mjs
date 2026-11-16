#!/usr/bin/env node
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import scope from '../netlify/functions/_shared/news-collection-scope.js';

// Official newsroom feed, verified from justice.gov/news. Uses the existing ICE queue.
export const OFFICIAL_FEED = 'https://www.justice.gov/news/rss?m=1';
const DISTRICT_FEEDS = [
  ['usao-cdca','美国联邦检察署（加州中区）',1721,185811],
  ['usao-edca','美国联邦检察署（加州东区）',1726,185816],
  ['usao-ndil','美国联邦检察署（伊利诺伊州北区）',1821,185901],
  ['usao-nj','美国联邦检察署（新泽西州）',1956,186031],
  ['usao-edny','美国联邦检察署（纽约东区）',1971,186041],
  ['usao-sdtx','美国联邦检察署（得州南区）',2091,186171],
].map(([account,name,component,organization])=>{
  const url=new URL('https://www.justice.gov/feeds/justice-news.xml');
  url.search=new URLSearchParams({[`component[${component}]`]:String(component),organization:String(organization),'type[press_release]':'press_release'}).toString();
  return {url:url.href,account,name};
});
export const OFFICIAL_SOURCES = [{url:OFFICIAL_FEED,account:'TheJusticeDept',name:'美国司法部官网'},...DISTRICT_FEEDS];
function decode(value) { return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,x=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[x])).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):'';}); }
function text(value) { return decode(value).replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
export function allowedOfficialUrl(value) { try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && /^(www\.)?justice\.gov$/.test(u.hostname); } catch { return false; } }
export function parseOfficialFeed(xml, now=Date.now()) {
  const tag=(item,name)=>decode(item.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1] || '').trim();
  return [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([,item])=>({title:text(tag(item,'title')),url:tag(item,'link'),date:tag(item,'pubDate'),description:text(tag(item,'description'))}))
    .filter(item=>allowedOfficialUrl(item.url)&&Number.isFinite(Date.parse(item.date))&&now-Date.parse(item.date)>=0&&now-Date.parse(item.date)<=12*3600000).slice(0,20);
}
async function officialText(url) {
  if (!allowedOfficialUrl(url)) throw new Error('非许可官方网址');
  const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'text/html,application/rss+xml'}});
  if(!res.ok) throw new Error(`官方来源HTTP ${res.status}`);
  const value=await res.text();if(value.length>3000000)throw new Error('官方页面超过读取上限');return value;
}
export function officialArticleText(html) {
  const main=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  return main ? text(main).slice(0,24000) : '';
}
async function main() {
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new Error('缺少数据库配置');
  const feeds=await Promise.allSettled(OFFICIAL_SOURCES.map(async source=>({source,items:parseOfficialFeed(await officialText(source.url))})));
  const unique=new Map();let feedFailures=0;
  for(const [i, result] of feeds.entries()) {
    if(result.status==='rejected'){
      feedFailures++;console.warn(JSON.stringify({feed:OFFICIAL_SOURCES[i].url,error:String(result.reason?.message||result.reason)}));continue;
    }
    const {source,items}=result.value;
    for(const item of items){
      if(source.url!==OFFICIAL_FEED && !/immigrat|deport|immigration detainer|removal order|illegal re.?entry|removable alien|homeland security|\bICE\b|\bERO\b/i.test(item.title+' '+item.description)) continue;
      if(!unique.has(item.url)) unique.set(item.url,{...item,source});
    }
  }
  if(feedFailures===feeds.length)throw new Error('本轮官方新闻源全部读取失败');
  const items=[...unique.values()];let inserted=0,failed=0;
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  for(const item of items) {
    try {
      const id='official-web-'+crypto.createHash('sha256').update(item.url).digest('hex').slice(0,40);
      const exists=new URL(base+'/rest/v1/ice_posts');exists.searchParams.set('select','id');exists.searchParams.set('x_post_id','eq.'+id);
      const res=await fetch(exists,{headers,signal:AbortSignal.timeout(25000)});if(!res.ok)throw new Error(`来源去重HTTP ${res.status}`);if((await res.json()).length)continue;
      const body=officialArticleText(await officialText(item.url));if(body.length<120)throw new Error('未取得完整官方正文，保留到下一轮');
      const source_text=`${item.title}\n${item.date}\n${body}`;
      const route=scope.collectionScope(source_text,{source_type:'official',trust_tier:1});
      const iceAction=/\b(?:ICE|ERO)\b|Immigration and Customs Enforcement|immigration detention|immigration detainer|deportation|illegal re.?entry|removal order/i.test(item.title+' '+body)
        && /arrest|detain|custody|deport|remov|charge|sentenc|enforce|re.?entry/i.test(item.title+' '+body);
      if(!route || (item.source.url!==OFFICIAL_FEED && !iceAction))continue;
      const row={x_post_id:id,x_url:item.url,source_type:'official',source_username:item.source.account,source_display_name:item.source.name,trust_tier:1,independence_key:'official:justice.gov',source_created_at:new Date(item.date).toISOString(),source_text,media:[],raw_payload:{source_platform:'official_web',source_links:[item.url],feed:item.source.url,discovery:{collector:'unified-official-web-v1'}},relevant:null,processing_status:'collected',attempts:0};
      const saved=await fetch(base+'/rest/v1/ice_posts?on_conflict=x_post_id',{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(row),signal:AbortSignal.timeout(25000)});
      if(!saved.ok)throw new Error(`官方线索入库HTTP ${saved.status}: ${(await saved.text()).slice(0,300)}`);inserted+=(await saved.json()).length;
    }catch(error){failed++;console.error(JSON.stringify({source:item.url,error:String(error.message||error)}));}
  }
  console.log(JSON.stringify({stage:'unified-official-web-v1',fetched:items.length,inserted,failed,feedFailures}));
  if(failed===items.length&&failed)throw new Error('本轮官方网页全部读取失败');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

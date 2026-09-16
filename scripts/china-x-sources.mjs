// Editorial source registry: publisher accounts, not arbitrary keyword-search authors.
export const CHINA_X_SOURCES = [
  {handle:'bbcchinese',name:'BBC News 中文',reference:'https://x.com/bbcchinese'},
  {handle:'zaobaosg',name:'联合早报',reference:'https://www.zaobao.com.sg/products'},
  {handle:'hkfp',name:'Hong Kong Free Press',reference:'https://x.com/hkfp'},
  {handle:'Focus_Taiwan',name:'中央社 Focus Taiwan',reference:'https://focustaiwan.tw/'},
];
export function chinaMediaSource(handle) { return CHINA_X_SOURCES.find(source=>source.handle.toLowerCase()===String(handle||'').toLowerCase()) || null; }
export function chinaMediaQuery(source) {
 return `from:${source.handle} (China OR Chinese OR Beijing OR "Xi Jinping" OR "Hong Kong" OR 中国 OR 中國 OR 中共 OR 习近平 OR 習近平 OR 官员 OR 官員 OR 香港) -is:retweet -is:reply`;
}
export async function collectChinaMediaPosts({request,readJson,bearer,lookbackHours=24,mediaFor}) {
 const collected=[];
 for(const source of CHINA_X_SOURCES) {
  try {
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',chinaMediaQuery(source));url.searchParams.set('max_results','20');
   url.searchParams.set('start_time',new Date(Date.now()-lookbackHours*3600000).toISOString());
   url.searchParams.set('tweet.fields','id,text,note_tweet,created_at,lang,author_id,entities,public_metrics,attachments,referenced_tweets');
   url.searchParams.set('expansions','author_id,attachments.media_keys');url.searchParams.set('user.fields','username');
   url.searchParams.set('media.fields','media_key,type,url,preview_image_url,width,height');
   const payload=await readJson(await request(url,{headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json'}}));
   const users=new Map((payload?.includes?.users||[]).map(user=>[user.id,user.username]));
   const media=new Map((payload?.includes?.media||[]).map(item=>[String(item.media_key),item]));
   for(const tweet of payload?.data||[]) {
    if(String(users.get(tweet.author_id)||'').toLowerCase()!==source.handle.toLowerCase()) continue;
    collected.push({...tweet,text:tweet.note_tweet?.text||tweet.text,media:[...mediaFor(tweet,media),...(tweet.entities?.urls||[]).flatMap(link=>(link.images||[]).map(image=>({...image,type:'photo'})))],source_username:source.handle,source_name:source.name,source_level:'publisher_account',source_reference:source.reference,source_links:(tweet.entities?.urls||[]).map(item=>item.expanded_url).filter(Boolean)});
   }
   console.log(JSON.stringify({event:'china-media-source',handle:source.handle,fetched:(payload?.data||[]).length}));
  } catch(error) { console.warn(JSON.stringify({event:'china-media-source-unavailable',handle:source.handle,reason:String(error?.message||error).slice(0,200)})); }
 }
 return collected;
}

import {chinaPersonNames,findChinaPeople} from '../netlify/shared/china-person-registry.mjs';
import {hasChinaSeniorSubject} from '../netlify/shared/editorial-topics.mjs';

// Editorial source registry: publisher accounts, not arbitrary keyword-search authors.
export const CHINA_X_SOURCES = [
  {handle:'bbcchinese',name:'BBC News 中文',reference:'https://x.com/bbcchinese'},
  {handle:'zaobaosg',name:'联合早报',reference:'https://www.zaobao.com.sg/products'},
  {handle:'hkfp',name:'Hong Kong Free Press',reference:'https://x.com/hkfp'},
  {handle:'VOAChinese',name:'美国之音中文网',reference:'https://www.voachinese.com/a/7438368.html'},
  {handle:'Focus_Taiwan',name:'中央社 Focus Taiwan',reference:'https://focustaiwan.tw/'},
];
export function chinaMediaSource(handle) { return CHINA_X_SOURCES.find(source=>source.handle.toLowerCase()===String(handle||'').toLowerCase()) || null; }
// These user-specified accounts are leads only; a blue badge does not verify a claim.
export const CHINA_X_MONITORS = [
 {handle:'chinesehotnews',name:'CNC热点（社交线索）',reference:'https://x.com/chinesehotnews',reviewOnly:true},
 {handle:'WanjunXie',name:'谢万军（社交线索）',reference:'https://x.com/WanjunXie',reviewOnly:true},
];
export function chinaMediaQuery(source) {
 const subjects='习近平 OR 習近平 OR 李强 OR 李強 OR 蔡奇 OR 丁薛祥 OR 李希 OR 李干杰 OR 李幹傑 OR 王沪宁 OR 王滬寧 OR 赵乐际 OR 趙樂際 OR 何立峰 OR 张又侠 OR 張又俠 OR 王岐山 OR 薄熙来 OR 薄熙來 OR 省委书记 OR 省委書記 OR 部长 OR 部長 OR 中央军委 OR 中央軍委 OR 中办 OR 中辦';
 const general=source.reviewOnly?'': 'China OR Chinese OR Beijing OR "Xi Jinping" OR 中国 OR 中國 OR 中共 OR 香港 OR ';
 return `from:${source.handle} (${general}${subjects}) -is:retweet -is:reply`;
}
export function chinaMediaQueries(source) {
 const queries=[chinaMediaQuery(source)];
 const prefix=`from:${source.handle} (`; const suffix=') -is:retweet -is:reply';
 let terms=[];
 for(const name of chinaPersonNames()) {
  if(queries[0].includes(name+' OR') || queries[0].includes(name+')')) continue;
  if((prefix+[...terms,name].join(' OR ')+suffix).length>480 && terms.length) {queries.push(prefix+terms.join(' OR ')+suffix);terms=[];}
  terms.push(name);
 }
 if(terms.length)queries.push(prefix+terms.join(' OR ')+suffix);
 return queries;
}
export function politicalReviewReason(tweet) {
 if(tweet.requires_editor_review || CHINA_X_MONITORS.some(s=>s.handle.toLowerCase()===String(tweet.source_username||'').toLowerCase())) return '社交账号政治线索：须核查原始依据；蓝标、转发量和配图不构成事实佐证';
 const text=String(tweet.text||'');
 if ((hasChinaSeniorSubject(text) || /Xi Jinping|Chinese leadership/i.test(text)) && /政变|政變|兵变|兵變|夺权|奪權|软禁|軟禁|送医|送醫|抢救|搶救|病危|住院|晕倒|暈倒|派系.*共识|派系.*共識|元老.*共识|元老.*共識|coup|hospitali[sz]ed/i.test(text)) return '重大政治或健康说法：需核查直接证据和独立来源，不能凭照片、缺席或转述自动发布';
 return '';
}
export async function collectChinaMediaPosts({request,readJson,bearer,lookbackHours=24,mediaFor,includeMonitors=false}) {
 const collected=[];
 for(const source of [...CHINA_X_SOURCES,...(includeMonitors?CHINA_X_MONITORS:[])]) {
  for (const query of chinaMediaQueries(source)) {
  try {
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',query);url.searchParams.set('max_results','20');
   url.searchParams.set('start_time',new Date(Date.now()-lookbackHours*3600000).toISOString());
   url.searchParams.set('tweet.fields','id,text,note_tweet,created_at,lang,author_id,entities,public_metrics,attachments,referenced_tweets');
   url.searchParams.set('expansions','author_id,attachments.media_keys');url.searchParams.set('user.fields','username');
   url.searchParams.set('media.fields','media_key,type,url,preview_image_url,width,height');
   const payload=await readJson(await request(url,{headers:{Authorization:`Bearer ${bearer}`,Accept:'application/json'}}));
   const users=new Map((payload?.includes?.users||[]).map(user=>[user.id,user.username]));
   const media=new Map((payload?.includes?.media||[]).map(item=>[String(item.media_key),item]));
   for(const tweet of payload?.data||[]) {
    if(String(users.get(tweet.author_id)||'').toLowerCase()!==source.handle.toLowerCase()) continue;
    collected.push({...tweet,text:tweet.note_tweet?.text||tweet.text,media:[...mediaFor(tweet,media),...(tweet.entities?.urls||[]).flatMap(link=>(link.images||[]).map(image=>({...image,type:'photo'})))],source_username:source.handle,source_name:source.name,matched_person_ids:findChinaPeople(tweet.note_tweet?.text||tweet.text).map(p=>p.person_key),source_level:source.reviewOnly?'social_monitor':'publisher_account',requires_editor_review:source.reviewOnly===true,source_reference:source.reference,source_links:(tweet.entities?.urls||[]).map(item=>item.expanded_url).filter(Boolean)});
   }
   console.log(JSON.stringify({event:'china-media-source',handle:source.handle,fetched:(payload?.data||[]).length}));
  } catch(error) { console.warn(JSON.stringify({event:'china-media-source-unavailable',handle:source.handle,reason:String(error?.message||error).slice(0,200)})); }
 }
 }
 const seen=new Set();
 return collected.filter(post=>{if(seen.has(post.id))return false;seen.add(post.id);return true;});
}

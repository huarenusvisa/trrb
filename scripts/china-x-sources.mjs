import './news-budget-preload.mjs';
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
export const US_POLITICS_X_SOURCES = [
 {handle:'AP_Politics',name:'Associated Press Politics',reference:'https://apnews.com/politics',usPolitics:true},
 {handle:'NBCPolitics',name:'NBC News Politics',reference:'https://www.nbcnews.com/politics',usPolitics:true},
 {handle:'thehill',name:'The Hill',reference:'https://thehill.com/',usPolitics:true},
];
export function chinaMediaSource(handle) { return [...CHINA_X_SOURCES,...US_POLITICS_X_SOURCES].find(source=>source.handle.toLowerCase()===String(handle||'').toLowerCase()) || null; }
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
export function usChinaCommunityQuery(source) {
 const people='"Chinese American" OR "Chinese Americans" OR "Chinese national" OR "Chinese nationals" OR "Chinese immigrant" OR "Chinese student" OR "Chinese students" OR "Chinese community" OR 华裔 OR 華裔 OR 华人 OR 華人 OR 中国公民 OR 中國公民';
 const location='"United States" OR U.S. OR American OR California OR "New York" OR Texas OR Florida OR Washington OR Massachusetts OR Illinois OR "New Jersey" OR Chinatown OR 美国 OR 美國';
 return `from:${source.handle} (${people}) (${location}) -is:retweet -is:reply`;
}
export function chinaMediaQueries(source) {
 if(source.usPolitics) return [`from:${source.handle} (Congress OR Senate OR "White House" OR Trump OR "Supreme Court" OR "federal judge" OR "executive order" OR "House Republicans" OR "House Democrats" OR "federal budget") -is:retweet -is:reply`];
 const queries=[chinaMediaQuery(source)];
 if (!source.reviewOnly) queries.push(`from:${source.handle} (美国 OR 美國 OR 美方 OR 白宫 OR 白宮 OR 五角大楼 OR 五角大樓 OR 特朗普 OR 川普 OR 台海 OR 军售 OR 軍售 OR 美军 OR ICE OR FBI OR CBP OR Pentagon OR Hegseth OR "United States" OR "White House") -is:retweet -is:reply`);
 if (!source.reviewOnly) queries.push(`from:${source.handle} (法院 OR 判例 OR 裁定 OR 上诉 OR 留学生 OR 华人 OR 签证 OR 关税 OR 制裁 OR 反腐 OR 任免 OR 国务院 OR SupremeCourt OR USCIS OR DHS OR HSI OR DOJ) -is:retweet -is:reply`);
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
export async function collectChinaMediaPosts({request,readJson,bearer,lookbackHours=12,mediaFor,includeMonitors=false}) {
 const collected=[];
 const offset=Math.floor(Date.now()/3600000)%CHINA_X_SOURCES.length;
 const publishers=[...CHINA_X_SOURCES.slice(offset),...CHINA_X_SOURCES.slice(0,offset)];
 const sources=[...US_POLITICS_X_SOURCES,...publishers,...(includeMonitors?CHINA_X_MONITORS:[])];
 // One primary topic query per publisher before spending on extended keyword lists.
 // Prioritize direct political feeds, then one focused community query per run.
 const focusedOffset=Math.floor(Date.now()/3600000)%(US_POLITICS_X_SOURCES.length+publishers.length);
 const communitySources=[...US_POLITICS_X_SOURCES,...publishers];
 const focused=communitySources[focusedOffset];
 const queries=sources.map(source=>({source,queries:chinaMediaQueries(source)}));
 queries.unshift({source:focused,queries:[usChinaCommunityQuery(focused)]});
 for(let round=0;round<Math.max(...queries.map(x=>x.queries.length));round++) {
  for (const item of queries) {
  const source=item.source, query=item.queries[round];
  if (!query) continue;
  try {
   const url=new URL('https://api.x.com/2/tweets/search/recent');
   url.searchParams.set('query',query);url.searchParams.set('max_results','20');
   url.searchParams.set('start_time',new Date(Date.now()-Math.min(12,lookbackHours)*3600000).toISOString());
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

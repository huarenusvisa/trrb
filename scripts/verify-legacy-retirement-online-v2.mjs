#!/usr/bin/env node
const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const UA_GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const legacySamples = [
  '/华裔女子李美荷推动亚太裔传统月走入美国主流/',
  '/央企12局印尼项目被指欠薪：中国农民工海外遭遇/',
  '/纽约36岁女子家中遭窃-价值百万美元/',
  '/特朗普政府今年第五次成功营救！一名在阿富汗被/',
  '/浙科大学生离世家长网上求真相，悼念发声却称遭/'
];

function decodeXml(v=''){return String(v).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");}
function locs(xml){return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);}
function isSuspiciousLegacyPath(url){
  try{
    const x = new URL(url);
    if (x.hostname !== 'trrb.net') return false;
    if (x.pathname === '/' || x.pathname === '/article.html') return false;
    const decoded = decodeURIComponent(x.pathname).replace(/^\/+|\/+$/g,'');
    if (!/[\u3400-\u9fff]/u.test(decoded)) return false;
    const segments = decoded.split('/').filter(Boolean);
    // Round 8 canonical article URLs are /<category-or-topic>/<article-slug>.
    // Legacy title URLs were long, root-level, single-segment Chinese paths.
    if (segments.length >= 2) return false;
    return decoded.length >= 18;
  }catch{return false;}
}

const failures=[];
const details=[];

for (const path of legacySamples) {
  const url = ORIGIN + path;
  let res;
  try {
    res = await fetch(url,{redirect:'manual',headers:{'user-agent':UA_GOOGLE,'accept':'text/html,*/*'}});
  } catch (error) {
    failures.push({url,bad:['network-error'],message:String(error?.message||error)});
    continue;
  }
  const status = res.status;
  const location = res.headers.get('location') || '';
  const xRobots = res.headers.get('x-robots-tag') || '';
  const retired = res.headers.get('x-trrb-retired') || '';
  const redirected = res.headers.get('x-trrb-redirect') || '';
  const ok = status === 410 || (status === 301 && location.startsWith(`${ORIGIN}/article.html?id=`));
  details.push({url,status,location,xRobots,retired,redirected,ok});
  if(!ok) failures.push({url,bad:['legacy-status'],status,location});
  if(status===410 && !/noindex/i.test(xRobots)) failures.push({url,bad:['410-missing-noindex'],status,xRobots});
}

for (const smUrl of [`${ORIGIN}/sitemap.xml`,`${ORIGIN}/news-sitemap.xml`]) {
  let res;
  try { res = await fetch(smUrl,{headers:{'user-agent':UA_GOOGLE,'accept':'application/xml,text/xml,*/*'}}); }
  catch(error){ failures.push({url:smUrl,bad:['sitemap-network'],message:String(error?.message||error)}); continue; }
  if(!res.ok){ failures.push({url:smUrl,bad:['sitemap-http'],status:res.status}); continue; }
  const xml = await res.text();
  const urls = locs(xml);
  const wrongHost = urls.filter(u=>{try{return new URL(u).hostname!=='trrb.net';}catch{return true;}});
  const malformedArticles = urls.filter(u=>{try{const x=new URL(u); return x.pathname==='/article.html' && !x.searchParams.get('id');}catch{return false;}});
  const suspiciousLegacy = urls.filter(isSuspiciousLegacyPath);
  if(wrongHost.length) failures.push({url:smUrl,bad:['wrong-host'],count:wrongHost.length,examples:wrongHost.slice(0,10)});
  if(malformedArticles.length) failures.push({url:smUrl,bad:['article-missing-id'],count:malformedArticles.length,examples:malformedArticles.slice(0,10)});
  if(suspiciousLegacy.length) failures.push({url:smUrl,bad:['suspicious-legacy-title-url'],count:suspiciousLegacy.length,examples:suspiciousLegacy.slice(0,10)});
  details.push({sitemap:smUrl,total:urls.length,wrongHost:wrongHost.length,malformedArticles:malformedArticles.length,suspiciousLegacy:suspiciousLegacy.length});
}

const report={generated_at:new Date().toISOString(),origin:ORIGIN,failures,details};
await import('node:fs').then(fs=>fs.writeFileSync('legacy-retirement-online-report-v2.json',JSON.stringify(report,null,2)));
console.log(`历史旧URL清理验收V2：样本 ${legacySamples.length}；失败 ${failures.length}`);
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(1);}

#!/usr/bin/env node
const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const UA_GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const articleSamples = [
  '/华裔女子李美荷推动亚太裔传统月走入美国主流/',
  '/央企12局印尼项目被指欠薪：中国农民工海外遭遇/',
  '/纽约36岁女子家中遭窃-价值百万美元/',
  '/特朗普政府今年第五次成功营救！一名在阿富汗被/',
  '/浙科大学生离世家长网上求真相，悼念发声却称遭/'
];

const retiredSystemSamples = [
  '/category/https-www-trrb-cc/0/',
  '/category/https-www-trrb-cc-cat8/0/',
  '/article.html?id=wp-117123'
];

const redirectSystemSamples = [
  { path: '/category/hotnews/0/', destination: `${ORIGIN}/hot-headlines` }
];

function decodeXml(v=''){return String(v).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");}
function locs(xml){return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);}

const failures=[];
const details=[];

for (const path of articleSamples) {
  const url = ORIGIN + path;
  const res = await fetch(url,{redirect:'manual',headers:{'user-agent':UA_GOOGLE,'accept':'text/html,*/*'}});
  const status = res.status;
  const location = res.headers.get('location') || '';
  const xRobots = res.headers.get('x-robots-tag') || '';
  const retired = res.headers.get('x-trrb-retired') || '';
  const redirected = res.headers.get('x-trrb-redirect') || '';
  const ok = status === 410 || (status === 301 && location.startsWith(`${ORIGIN}/article.html?id=`));
  details.push({kind:'legacy-article',url,status,location,xRobots,retired,redirected,ok});
  if(!ok) failures.push({url,bad:['legacy-article-status'],status,location});
  if(status===410 && !/noindex/i.test(xRobots)) failures.push({url,bad:['410-missing-noindex'],status,xRobots});
}

for (const path of retiredSystemSamples) {
  const url = ORIGIN + path;
  const res = await fetch(url,{redirect:'manual',headers:{'user-agent':UA_GOOGLE,'accept':'text/html,*/*'}});
  const status = res.status;
  const xRobots = res.headers.get('x-robots-tag') || '';
  const retired = res.headers.get('x-trrb-retired') || '';
  const ok = status === 410 && /noindex/i.test(xRobots);
  details.push({kind:'retired-system',url,status,xRobots,retired,ok});
  if(!ok) failures.push({url,bad:['retired-system-must-410-noindex'],status,xRobots,retired});
}

for (const sample of redirectSystemSamples) {
  const url = ORIGIN + sample.path;
  const res = await fetch(url,{redirect:'manual',headers:{'user-agent':UA_GOOGLE,'accept':'text/html,*/*'}});
  const status = res.status;
  const location = res.headers.get('location') || '';
  const redirected = res.headers.get('x-trrb-redirect') || '';
  const ok = status === 301 && location === sample.destination;
  details.push({kind:'redirect-system',url,status,location,redirected,expected:sample.destination,ok});
  if(!ok) failures.push({url,bad:['legacy-system-redirect'],status,location,expected:sample.destination});
}

for (const smUrl of [`${ORIGIN}/sitemap.xml`,`${ORIGIN}/news-sitemap.xml`]) {
  const res = await fetch(smUrl,{headers:{'user-agent':UA_GOOGLE,'accept':'application/xml,text/xml,*/*'}});
  if(!res.ok){ failures.push({url:smUrl,bad:['sitemap-http'],status:res.status}); continue; }
  const xml = await res.text();
  const urls = locs(xml);
  const legacyInMap = urls.filter(u=>{
    try{
      const x=new URL(u);
      return x.hostname==='trrb.net' && (
        /^\/category\//i.test(x.pathname) ||
        (/\/[\u3400-\u9fff]/u.test(decodeURIComponent(x.pathname)) && x.pathname!=='/article.html') ||
        (x.pathname==='/article.html' && x.searchParams.has('id'))
      );
    }catch{return false;}
  });
  if(legacyInMap.length) failures.push({url:smUrl,bad:['legacy-url-in-sitemap'],examples:legacyInMap.slice(0,10),count:legacyInMap.length});
  details.push({sitemap:smUrl,total:urls.length,legacyInMap:legacyInMap.length});
}

const report={generated_at:new Date().toISOString(),origin:ORIGIN,failures,details};
await import('node:fs').then(fs=>fs.writeFileSync('legacy-retirement-online-report.json',JSON.stringify(report,null,2)));
console.log(`旧URL退休验收：文章样本 ${articleSamples.length}；410系统样本 ${retiredSystemSamples.length}；301系统样本 ${redirectSystemSamples.length}；失败 ${failures.length}`);
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(1);} 

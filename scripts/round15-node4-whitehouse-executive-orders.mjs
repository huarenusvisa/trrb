import { writeFileSync } from 'node:fs';

const SOURCE = 'https://www.whitehouse.gov/presidential-actions/executive-orders/';
const UA = 'TRRB-Legal-Collector/1.0 (+https://trrb.net)';
const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
function clean(s=''){return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function abs(base,href){try{return new URL(href,base).toString()}catch{return''}}
async function get(url){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),20000);try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,*/*;q=0.8'},signal:ac.signal});return{ok:r.ok,status:r.status,url:r.url,text:await r.text()}}catch(e){return{ok:false,status:0,url,text:'',error:String(e?.message||e)}}finally{clearTimeout(t)}}
function anchors(html,base){const out=[];for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){const url=abs(base,m[1]);if(url)out.push({url,text:clean(m[2])})}return out}

const list=await get(SOURCE);
check(list.ok&&list.status===200,'White House Executive Orders page reachable',`status=${list.status}`);
check(/^https:\/\/(www\.)?whitehouse\.gov\//i.test(list.url),'source remains on official whitehouse.gov',list.url);

const candidates=[]; const seen=new Set();
for(const a of anchors(list.text,list.url)){
  if(!/^https:\/\/(www\.)?whitehouse\.gov\/presidential-actions\/\d{4}\//i.test(a.url))continue;
  if(!a.text||a.text.length<8)continue;
  const key=a.url.replace(/\/$/,''); if(seen.has(key))continue; seen.add(key); candidates.push(a);
}
check(candidates.length>=8,'recent executive-order detail pages discovered',`count=${candidates.length}`);

const orders=[];
for(const a of candidates.slice(0,20)){
  const p=await get(a.url); if(!p.ok)continue;
  const txt=clean(p.text);
  const h1=clean((p.text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||a.text);
  const numHit=txt.match(/Executive Order\s+(\d{4,6})/i)||txt.match(/\b(14\d{3})\b/);
  const dateHit=txt.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/i);
  if(!numHit)continue;
  orders.push({authorityType:'Executive Order',issuer:'President of the United States',executiveOrderNumber:numHit[1],title:h1,date:dateHit?dateHit[0]:null,officialUrl:p.url,source:'The White House'});
}
const dedup=[...new Map(orders.map(o=>[o.executiveOrderNumber,o])).values()].sort((a,b)=>Number(b.executiveOrderNumber)-Number(a.executiveOrderNumber));
check(dedup.length>=8,'executive orders parsed from official detail pages',`count=${dedup.length}`);
check(new Set(dedup.map(o=>o.executiveOrderNumber)).size===dedup.length,'executive order numbers unique');
check(dedup.every(o=>/^https:\/\/(www\.)?whitehouse\.gov\//i.test(o.officialUrl)),'all records point to first-party White House pages');
check(dedup.every(o=>o.title&&o.executiveOrderNumber),'core executive-order fields complete');

const output={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'Official White House Executive Orders; source text retained as authoritative reference.',source:SOURCE,count:dedup.length,orders:dedup};
writeFileSync('data/legal/whitehouse-executive-orders-latest.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('round15-node4-whitehouse-executive-orders-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),source:SOURCE,checks,failures,count:dedup.length},null,2)+'\n');
console.log(`ROUND15 NODE4 audit: orders=${dedup.length}; checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND15 NODE4 PASS: White House executive order collection verified');else{console.log('ROUND15 NODE4 FAIL: executive order collection gaps remain');process.exitCode=1}

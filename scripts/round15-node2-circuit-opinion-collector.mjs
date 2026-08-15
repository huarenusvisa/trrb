import { readFileSync, writeFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('data/legal/circuit-source-registry.json','utf8'));
const UA = 'TRRB-Legal-Collector/1.0 (+https://trrb.net)';
const timeoutMs = 20000;
const results = [];
let failures = 0;

function abs(base, href) { try { return new URL(href, base).toString(); } catch { return ''; } }
function clean(s='') { return s.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function links(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(base, m[1]); if (url) out.push({url,text:clean(m[2])});
  }
  return out;
}
function feedLinks(xml, base) {
  const out=[];
  for (const m of xml.matchAll(/<link\b[^>]*>([\s\S]*?)<\/link>/gi)) { const url=abs(base,clean(m[1])); if(url) out.push({url,text:''}); }
  for (const m of xml.matchAll(/<(?:guid|enclosure)\b[^>]*(?:url=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/(?:guid|enclosure)>/gi)) { const url=abs(base,m[1]||clean(m[2])); if(url) out.push({url,text:''}); }
  return out;
}
function embeddedUrls(text,base){
  const out=[];
  for(const m of text.matchAll(/["']((?:https?:\/\/|\/)[^"'<>\s]+(?:rss|xml|feed|opinion|decision)[^"'<>\s]*)["']/gi)){
    const url=abs(base,m[1].replace(/&amp;/g,'&')); if(url) out.push({url,text:''});
  }
  return out;
}
function ca5WindowsOpinionUrls(text){
  const out=[];
  const re=/\\opinions\\(pub|unpub)\\(\d{2})[\s\S]{0,240}?((?:\d{2}-\d+)\.\d+\.pdf)/gi;
  for(const m of text.matchAll(re)) out.push({url:`https://www.ca5.uscourts.gov/opinions/${m[1].toLowerCase()}/${m[2]}/${m[3]}`,text:m[3]});
  return out;
}
async function get(url){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),timeoutMs);
  try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/rss+xml,application/xml,text/xml,application/pdf;q=0.9,*/*;q=0.8'},signal:ac.signal});return{ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||'',text:await r.text()};}
  catch(e){return{ok:false,status:0,url,type:'',text:'',error:String(e?.message||e)}}finally{clearTimeout(t)}
}
function isOfficial(url,court){
  try{const h=new URL(url).hostname.toLowerCase(),d=court.officialDomain.toLowerCase();return h===d||h.endsWith('.'+d)||(d.startsWith('ca')&&h.endsWith('.uscourts.gov'));}catch{return false}
}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{const k=(x.url||'').replace(/&amp;/g,'&').split('#')[0];if(!k||seen.has(k))return false;seen.add(k);x.url=k;return true})}
function isOpinionDoc(court,x){
  const u=(x.url||'').replace(/&amp;/g,'&'); const t=(x.text||'');
  const bad=/rulebook|rules[_ .-]|manual|handbook|guide|form|calendar|admission|access coordinator|fee schedule|procedure|policy|instructions|CJA|mediation/i.test(u+' '+t);
  if(bad) return false;
  switch(court.id){
    case 'ca1': return /\/opnfiles\//i.test(u);
    case 'ca2': return !/\/nav\/rss\.html$/i.test(u) && (/\/decisions?\//i.test(u)||/\/opinions?\//i.test(u)||(/\.pdf(?:$|[?#])/i.test(u)&&/\b\d{2}-\d+\b/.test(t+' '+u)));
    case 'ca3': return /(?:recentop|opinarch|opinions?)/i.test(u) && (/\.pdf(?:$|[?#])/i.test(u)||/\b\d{2}-\d{3,4}\b/.test(t));
    case 'ca4': return /\/opinions\//i.test(u)&&/\.pdf(?:$|[?#])/i.test(u);
    case 'ca5': return /\/opinions\/(?:pub|unpub)\/\d{2}\/.+\.pdf(?:$|[?#])/i.test(u);
    case 'ca6': return /opn\.ca6\.uscourts\.gov/i.test(u)&&/opinion/i.test(u)&&(/\.pdf(?:$|[?#])/i.test(u)||/\b\d{2}-\d{3,4}\b/.test(t));
    case 'ca7': return /OpinionsWeb\/processWebInputExternal\.pl/i.test(u);
    case 'ca8': return /media\.ca8\.uscourts\.gov/i.test(u)&&/\d{6,7}[PUN]?\.pdf(?:$|[?#])/i.test(u);
    case 'ca9': return /\/datastore\/opinions\//i.test(u)&&/\.pdf(?:$|[?#])/i.test(u);
    case 'ca10': return !/daily_decisions\.rss/i.test(u)&&/\/opinions\//i.test(u)&&(/\.pdf(?:$|[?#])/i.test(u)||/\b\d{2}-\d{3,4}\b/.test(t));
    case 'ca11': return /media\.ca11\.uscourts\.gov/i.test(u)&&!/logname\.php(?:$|\?)/i.test(u)&&(/\.pdf(?:$|[?#])/i.test(u)||/\/opinions\/(?:pub|pubnew)\//i.test(u));
    case 'cadc': return /\/opinions\/docs\//i.test(u)&&/\.pdf(?:$|[?#])/i.test(u);
    case 'cafc': return /\/opinions-orders\//i.test(u)&&(/\.OPINION\./i.test(u)||/\[OPINION\]/i.test(t));
    default:return false;
  }
}
function followable(court,x){
  const s=(x.url+' '+x.text).toLowerCase();
  return /rss|feed|opinion|decision|case|logname|recentop/.test(s)&&!(/login|privacy|contact|rules|guide|manual/.test(s));
}

for(const court of registry.courts){
  console.log(`\n=== ${court.id} ${court.name} ===`);
  const source=await get(court.sourceUrl);
  const row={courtId:court.id,courtName:court.name,sourceUrl:court.sourceUrl,sourceStatus:source.status,sourceFinalUrl:source.url,documents:[],notes:[]};
  if(!source.ok){failures++;row.notes.push(`official source unavailable status=${source.status}${source.error?` error=${source.error}`:''}`);results.push(row);console.log('FAIL official source unavailable',source.status);continue;}

  let candidates=dedupe([...links(source.text,source.url),...feedLinks(source.text,source.url),...embeddedUrls(source.text,source.url)]).filter(x=>isOfficial(x.url,court));
  if(court.id==='ca5') candidates.push(...ca5WindowsOpinionUrls(source.text));
  let docs=dedupe(candidates.filter(x=>isOpinionDoc(court,x)));

  const follow=dedupe(candidates.filter(x=>followable(court,x)&&!isOpinionDoc(court,x))).slice(0,35);
  for(const x of follow){
    if(docs.length>=50) break;
    const r=await get(x.url); if(!r.ok) continue;
    if(/application\/pdf/i.test(r.type)){const candidate={url:r.url,text:x.text};if(isOpinionDoc(court,candidate))docs.push(candidate);continue;}
    let nested=dedupe([...links(r.text,r.url),...feedLinks(r.text,r.url),...embeddedUrls(r.text,r.url)]).filter(y=>isOfficial(y.url,court));
    if(court.id==='ca5') nested.push(...ca5WindowsOpinionUrls(r.text));
    docs.push(...nested.filter(y=>isOpinionDoc(court,y)));
    docs=dedupe(docs);
  }

  row.documents=dedupe(docs).slice(0,50).map(x=>({url:x.url,title:x.text||null}));
  const suspicious=row.documents.filter(d=>/rulebook|rules|manual|handbook|guide|form|calendar|admission|fee schedule|procedure|policy|instructions|mediation/i.test((d.url||'')+' '+(d.title||'')));
  if(row.documents.length===0||suspicious.length>0){failures++;row.notes.push(row.documents.length===0?'no opinion document discovered from official source':`non-opinion documents leaked=${suspicious.length}`);console.log(`FAIL opinion-only validation documents=${row.documents.length} suspicious=${suspicious.length}`);if(court.id==='ca2')console.log('CA2 candidate hints:',candidates.filter(x=>/rss|feed|opinion|decision/i.test(x.url+' '+x.text)).slice(0,20));}
  else console.log(`PASS official opinion documents=${row.documents.length}`);
  results.push(row);
}

const summary={generatedAt:new Date().toISOString(),scope:registry.scope,courts:results.length,covered:results.filter(r=>r.documents.length>0).length,failures,results};
writeFileSync('data/legal/circuit-opinions-latest.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync('round15-node2-circuit-opinion-audit.json',JSON.stringify(summary,null,2)+'\n');
console.log(`\nROUND15 NODE2 audit: courts=${summary.courts}; covered=${summary.covered}; failures=${failures}`);
if(failures===0&&summary.courts===13&&summary.covered===13)console.log('ROUND15 NODE2 PASS: 13 federal appellate courts official opinion-only collection verified');
else{console.log('ROUND15 NODE2 FAIL: court-specific official opinion collection gaps remain');process.exitCode=1;}

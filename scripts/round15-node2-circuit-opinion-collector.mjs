import { readFileSync, writeFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('data/legal/circuit-source-registry.json','utf8'));
const UA = 'TRRB-Legal-Collector/1.0 (+https://trrb.net)';
const timeoutMs = 20000;
const results = [];
let failures = 0;

function abs(base, href) {
  try { return new URL(href, base).toString(); } catch { return ''; }
}
function clean(s='') { return s.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function links(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = abs(base, m[1]);
    if (!url) continue;
    out.push({url, text: clean(m[2])});
  }
  return out;
}
async function get(url) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), timeoutMs);
  try {
    const r = await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8'},signal:ac.signal});
    return {ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||'',text: await r.text()};
  } catch (e) {
    return {ok:false,status:0,url,type:'',text:'',error:String(e?.message||e)};
  } finally { clearTimeout(t); }
}
function isOfficial(url, court) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const d = court.officialDomain.toLowerCase();
    return h === d || h.endsWith('.'+d) || (d.startsWith('ca') && h.endsWith('.uscourts.gov'));
  } catch { return false; }
}
function likelyOpinionLink(x) {
  return /\.pdf(?:$|[?#])/i.test(x.url) || /opinion|decision|case|document|download|media/i.test(x.url+' '+x.text);
}
function pdfOnly(xs) { return xs.filter(x=>/\.pdf(?:$|[?#])/i.test(x.url)); }

for (const court of registry.courts) {
  console.log(`\n=== ${court.id} ${court.name} ===`);
  const source = await get(court.sourceUrl);
  const row = {courtId:court.id,courtName:court.name,sourceUrl:court.sourceUrl,sourceStatus:source.status,sourceFinalUrl:source.url,documents:[],notes:[]};
  if (!source.ok) {
    failures++;
    row.notes.push(`official source unavailable status=${source.status}${source.error?` error=${source.error}`:''}`);
    results.push(row);
    console.log('FAIL official source unavailable', source.status);
    continue;
  }
  const first = links(source.text, source.url).filter(x=>isOfficial(x.url,court));
  let docs = pdfOnly(first);

  // Some courts expose an RSS/HTML landing page rather than direct PDFs. Follow a small
  // number of first-party opinion/feed links and collect PDFs from those pages.
  if (docs.length === 0) {
    const follow = first.filter(likelyOpinionLink).filter(x=>!/logout|login|privacy|contact/i.test(x.url)).slice(0,12);
    for (const x of follow) {
      const r = await get(x.url);
      if (!r.ok || /application\/pdf/i.test(r.type)) {
        if (r.ok && /application\/pdf/i.test(r.type)) docs.push({url:r.url,text:x.text});
        continue;
      }
      docs.push(...pdfOnly(links(r.text,r.url)).filter(y=>isOfficial(y.url,court)));
      if (docs.length >= 20) break;
    }
  }

  const seen = new Set();
  row.documents = docs.filter(x=>{ const k=x.url.split('#')[0]; if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,50).map(x=>({url:x.url,title:x.text||null}));
  if (row.documents.length === 0) {
    failures++;
    row.notes.push('no opinion PDF discovered from official source; court-specific parser/feed still required');
    console.log('FAIL no official opinion PDF discovered');
  } else {
    console.log(`PASS official documents discovered=${row.documents.length}`);
  }
  results.push(row);
}

const summary = {generatedAt:new Date().toISOString(),scope:registry.scope,courts:results.length,covered:results.filter(r=>r.documents.length>0).length,failures,results};
writeFileSync('data/legal/circuit-opinions-latest.json', JSON.stringify(summary,null,2)+'\n');
writeFileSync('round15-node2-circuit-opinion-audit.json', JSON.stringify(summary,null,2)+'\n');
console.log(`\nROUND15 NODE2 audit: courts=${summary.courts}; covered=${summary.covered}; failures=${failures}`);
if (failures === 0 && summary.courts === 13 && summary.covered === 13) {
  console.log('ROUND15 NODE2 PASS: 13 federal appellate courts official opinion collection verified');
} else {
  console.log('ROUND15 NODE2 FAIL: court-specific official collection gaps remain');
  process.exitCode = 1;
}

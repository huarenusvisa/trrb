import { writeFileSync } from 'node:fs';

const SOURCE = 'https://www.justice.gov/eoir/volume-29';
const UA = 'TRRB-Legal-Collector/1.0 (+https://trrb.net)';
const checks = [];
let failures = 0;

function check(ok,label,detail='') {
  checks.push({ok:Boolean(ok),label,detail});
  if (!ok) failures += 1;
  console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);
}
function clean(s='') {
  return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
}
function abs(base,href) { try { return new URL(href,base).toString(); } catch { return ''; } }
async function get(url) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(),20000);
  try {
    const r = await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,*/*;q=0.8'},signal:ac.signal});
    return {ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||'',text:await r.text()};
  } catch(e) {
    return {ok:false,status:0,url,text:'',type:'',error:String(e?.message||e)};
  } finally { clearTimeout(t); }
}
async function probe(url) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(),15000);
  try {
    const r = await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'application/pdf,*/*;q=0.8'},signal:ac.signal});
    return {ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||''};
  } catch(e) {
    return {ok:false,status:0,url,type:'',error:String(e?.message||e)};
  } finally { clearTimeout(t); }
}

const page = await get(SOURCE);
check(page.ok && page.status === 200,'EOIR Volume 29 official page reachable',`status=${page.status}`);
check(/^https:\/\/(www\.)?justice\.gov\//i.test(page.url),'source remains on official justice.gov',page.url);

const entries = [];
const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
for (const m of page.text.matchAll(anchorRe)) {
  const href = abs(page.url,m[1]);
  if (!href || !/^https:\/\/(www\.)?justice\.gov\//i.test(href)) continue;
  if (!/pdf|media|file|download/i.test(href+' '+clean(m[2]))) continue;
  const before = page.text.slice(Math.max(0,m.index-1600),m.index);
  const text = clean(before);
  const matches = [...text.matchAll(/([A-Z][A-Z0-9'’.,&()\-\s]{1,180}?),?\s*29\s+I&N\s+Dec\.?\s*(\d+)\s*\(BIA\s+(\d{4})\)/gi)];
  const hit = matches.at(-1);
  if (!hit) continue;
  let caseName = hit[1].trim().replace(/^.*?(Matter of\s+)/i,'Matter of ').replace(/\s+/g,' ');
  if (!/^Matter of\b/i.test(caseName) && !/^[A-Z0-9][A-Z0-9\- &'’.]+$/i.test(caseName)) continue;
  entries.push({
    court:'Board of Immigration Appeals',
    authorityType:'BIA precedent decision',
    precedential:true,
    volume:29,
    reporterPage:Number(hit[2]),
    year:Number(hit[3]),
    caseName,
    citation:`${caseName}, 29 I&N Dec. ${hit[2]} (BIA ${hit[3]})`,
    officialPdfUrl:href,
    officialSourceUrl:SOURCE
  });
}

const byKey = new Map();
for (const e of entries) byKey.set(`${e.reporterPage}|${e.officialPdfUrl}`,e);
const decisions = [...byKey.values()].sort((a,b)=>b.reporterPage-a.reporterPage);
check(decisions.length >= 10,'BIA precedent decisions parsed from current official volume',`count=${decisions.length}`);
check(decisions.every(d=>d.precedential && d.authorityType==='BIA precedent decision'),'dataset contains BIA precedent decisions only');
check(new Set(decisions.map(d=>d.reporterPage)).size === decisions.length,'reporter pages are unique',`unique=${new Set(decisions.map(d=>d.reporterPage)).size}/${decisions.length}`);
check(decisions.every(d=>/^https:\/\/(www\.)?justice\.gov\//i.test(d.officialPdfUrl)),'all decision documents are first-party DOJ/EOIR links');

let badPdf = 0;
for (const d of decisions.slice(0,5)) {
  const p = await probe(d.officialPdfUrl);
  if (!p.ok || p.status !== 200) badPdf += 1;
}
check(badPdf===0,'latest official BIA decision documents reachable',`checked=${Math.min(5,decisions.length)}; bad=${badPdf}`);

const output = {
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  scope:'Published/precedential BIA decisions only; unpublished BIA decisions are intentionally excluded.',
  source:SOURCE,
  count:decisions.length,
  decisions
};
writeFileSync('data/legal/bia-precedent-latest.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('round15-node3-bia-precedent-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),source:SOURCE,checks,failures,count:decisions.length},null,2)+'\n');
console.log(`ROUND15 NODE3 audit: decisions=${decisions.length}; checks=${checks.length}; failures=${failures}`);
if (failures===0) console.log('ROUND15 NODE3 PASS: BIA precedent decision collection verified');
else { console.log('ROUND15 NODE3 FAIL: BIA precedent collection gaps remain'); process.exitCode=1; }

import { readFileSync } from 'node:fs';
const db=JSON.parse(readFileSync(process.argv[2]||'data/legal/unified-legal-authorities-latest.json','utf8'));
const sitemap=readFileSync(process.argv[3]||'sitemap-legal.xml','utf8');
const index=readFileSync(process.argv[4]||'legal/index.html','utf8');
const app=readFileSync(process.argv[5]||'legal/legal-app.js','utf8');
const detail=readFileSync(process.argv[6]||'legal/detail.js','utf8');
const robots=readFileSync(process.argv[7]||'robots.txt','utf8');
const spec=readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');
const origin='https://trrb.net';
const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
const expected=[`${origin}/legal/`,...(db.records||[]).filter(r=>r?.id).map(r=>`${origin}/legal/detail.html?id=${encodeURIComponent(r.id)}`)];
const locSet=new Set(locs), expectedSet=new Set(expected);
const missing=expected.filter(u=>!locSet.has(u));
const extra=locs.filter(u=>!expectedSet.has(u));
const duplicateLocs=locs.length-locSet.size;
const checks=[
  ['node9 name fixed',spec.includes('9. 法律SEO索引质量、Sitemap更新时效与内部链接完整性')],
  ['hub canonical is stable',index.includes('<link rel="canonical" href="https://trrb.net/legal/"')],
  ['hub remains indexable',index.includes('<meta name="robots" content="index,follow"')],
  ['hub has descriptive metadata',/<meta name="description" content="[^"]{40,}"/.test(index)],
  ['legal sitemap has no duplicate URLs',duplicateLocs===0],
  ['legal sitemap count exactly follows current database',locs.length===expected.length],
  ['every current legal record is in sitemap',missing.length===0],
  ['sitemap has no stale legal record URLs',extra.length===0],
  ['robots explicitly advertises legal sitemap',robots.includes('Sitemap: https://trrb.net/sitemap-legal.xml')],
  ['hub cards internally link to real record IDs',app.includes('/legal/detail.html?id=${encodeURIComponent(r.id)}')],
  ['detail related cards internally link to real record IDs',detail.includes('/legal/detail.html?id=${encodeURIComponent(r.id)}')&&detail.includes('relatedRecords(base,records)')],
  ['detail dynamic canonical derives from real record ID',detail.includes('https://trrb.net/legal/detail.html?id=${encodeURIComponent(recordId)}')],
  ['detail structured data remains WebPage + Legislation',detail.includes("'@type':'WebPage'")&&detail.includes("'@type':'Legislation'" )],
  ['legal detail does not use NewsArticle schema',!detail.includes("'@type':'NewsArticle'")&&!detail.includes('"@type":"NewsArticle"')]
];
let failures=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
console.log(`ROUND 17 NODE 9 SITEMAP: locs=${locs.length} expected=${expected.length} missing=${missing.length} extra=${extra.length} duplicate=${duplicateLocs}`);
if(failures){console.error(`ROUND 17 NODE 9: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 9: PASS (${checks.length}/${checks.length})`);

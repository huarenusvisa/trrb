import fs from 'node:fs';

const html=fs.readFileSync('legal/index.html','utf8');
const app=fs.readFileSync('legal/legal-app.js','utf8');
const spec=fs.readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');

const checks=[
  ['node2 name fixed in spec', spec.includes('2. 判例/新规多维筛选组合与可分享检索URL')],
  ['keyword filter exists', html.includes('id="legal-q"')],
  ['source filter exists', html.includes('id="legal-source"')],
  ['body filter exists', html.includes('id="legal-body"')],
  ['type filter exists', html.includes('id="legal-type"')],
  ['from date filter exists', html.includes('id="legal-from"')],
  ['to date filter exists', html.includes('id="legal-to"')],
  ['sort filter exists', html.includes('id="legal-sort"')],
  ['from restored from URL', app.includes("from:(params.get('from')||'').trim()")],
  ['to restored from URL', app.includes("to:(params.get('to')||'').trim()")],
  ['sort restored from URL', app.includes("sort:(params.get('sort')||'relevance').trim()")],
  ['from persisted to URL', app.includes("if(state.from)p.set('from',state.from)")],
  ['to persisted to URL', app.includes("if(state.to)p.set('to',state.to)")],
  ['sort persisted to URL', app.includes("p.set('sort',state.sort)")],
  ['date range applied with source/body/type', app.includes('inDateRange(r)&&matches(r,state.q)')],
  ['page reset on changed filters', app.includes('function resetPageRender(){state.page=1;render()}')],
  ['reset clears date filters', app.includes("state.q=state.source=state.body=state.type=state.from=state.to=''")],
  ['13-circuit navigation preserved', app.includes("state.source='US_CIRCUIT'" ) && app.includes('[data-circuit-body]')),
  ['node1 Chinese search preserved', app.includes('analysisSearchFields(r)') && app.includes('relevanceScore(r,q)'))
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed){console.error(`ROUND 17 NODE 2: FAIL (${failed}/${checks.length} failed)`);process.exit(1);}
console.log(`ROUND 17 NODE 2: PASS (${checks.length}/${checks.length})`);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { aggregateAnnualProfiles, eligibleJudges, approvalRate, stateSlug, sample } from './asylumjudge-categories.mjs';

const judge = { id:'alpha', judge_name:'Smith, Jane', court_name:'Example' };
const outcome = (year,country,grants,denials) => ({ fiscal_year:year,nationality:country,nationality_code:country,grants,denials,other_decisions:0,total_asylum_decisions:grants+denials });
const profiles = [{name_key:'smith|jane',rows:[outcome(2025,'A',10,10),outcome(2025,'B',10,70),outcome(2026,'A',90,10)]}];
const annual = aggregateAnnualProfiles(profiles,[judge]);
assert.equal(approvalRate(annual.find(row=>row.fiscal_year===2025)),20,'Sum decisions, never average nationality rates');
assert.equal(eligibleJudges(annual,2025).length,1,'100 decisions qualifies');
assert.equal(eligibleJudges(annual,2025,101).length,0,'Sample filter uses grants plus denials');
assert.equal(eligibleJudges(annual,2026)[0].grants,90,'Fiscal years must remain separate');
assert.equal(aggregateAnnualProfiles(profiles,[judge,{...judge,id:'ambiguous'}]).length,0,'Ambiguous name matches must be excluded');
assert.equal(aggregateAnnualProfiles([...profiles,...profiles],[judge]).length,0,'Duplicate source profiles must be excluded');
assert.equal(aggregateAnnualProfiles([{...profiles[0],rows:[...profiles[0].rows,profiles[0].rows[0]]}],[judge]).length,0,'Duplicate nationality-year groups must be excluded');
assert.throws(()=>aggregateAnnualProfiles([{name_key:'smith|jane',rows:[{...outcome(2025,'A',2,3),total_asylum_decisions:8}]}],[judge]),/reconcile/);
assert.equal(stateSlug('NY'),'new-york');
assert.equal(stateSlug('CA'),'california');

const OUT=join(process.cwd(),'.netlify/asylumjudge-bundle/public');
const read=route=>readFile(join(OUT,route),'utf8');
const source=JSON.parse(await readFile('data/immigration-judge-state-periods.json','utf8'));
const manifest=JSON.parse(await read('asylumjudge/category-urls.json'));
assert.equal(manifest.added.length,source.states.length*2+2,'Every source state gets Chinese and English pages plus two comparison pages');
assert.equal(new Set(manifest.added).size,manifest.added.length);
const sitemap=await read('sitemap-static.xml');
for (const url of manifest.added) {
  assert.ok(sitemap.includes('<loc>'+url+'</loc>'),url+' must be discoverable');
  const html=await read(new URL(url).pathname.slice(1)+'index.html');
  assert.ok(html.includes('rel="canonical" href="'+url+'"'),'Self canonical '+url);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.ok(html.includes('data-category-page'));
  assert.ok(html.includes(source.source_snapshot_date));
  assert.ok(!/name="robots" content="noindex/.test(html));
  assert.ok(!/Loading|正在读取/.test(html),'Category content must not depend on API loading');
  for(const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(()=>JSON.parse(match[1]));
  for(const match of html.matchAll(/href="((?:\/en)?\/(?:judges|courts|states|judge-approval-rates)\/[^"]*)"/g)){
    const pathname=new URL(match[1].replace(/&amp;/g,'&'),'https://asylumjudge.com').pathname;
    await read(pathname.slice(1)+'index.html');
  }
}
for(const prefix of ['', 'en/']){
  const home=await read(prefix+'index.html');
  assert.match(home,/data-category-home/);
  assert.ok(home.includes('href="/'+prefix+'states/california/"'));
  assert.ok(home.includes('href="/'+prefix+'judge-approval-rates/"'));
  const states=await read(prefix+'states/index.html');
  assert.match(states,/data-year-panel="2025"/);
  assert.doesNotMatch(states,/Loading|正在读取/);
  const comparison=await read(prefix+'judge-approval-rates/index.html');
  assert.match(comparison,/data-default-year="2025"/);
  const rows=[...comparison.matchAll(/<tr data-category-filter-row data-sample="(\d+)" data-rate="([\d.]+)"/g)];
  assert.ok(rows.length>100,'Annual comparison must contain real eligible profiles');
  assert.ok(rows.every(row=>Number(row[1])>=100 && Number(row[2])>=0 && Number(row[2])<=100));
}
const en=await read('en/states/california/index.html');
assert.match(en,/<h1>California Immigration Judge Approval Rates<\/h1>/);
assert.match(en,/2025-10-01 – 2026-07-01/);
assert.match(en,/2024-10-01 – 2025-09-30/);

// Exercise progressive controls with a small DOM fixture: filtering, sample limits,
// fiscal-year navigation and back/forward must all preserve rendered data.
const listeners={};
const node=(data={})=>({dataset:data,hidden:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];}});
const panels=[node({yearPanel:'2026'}),node({yearPanel:'2025'})];
const links=panels.map(p=>node({categoryYear:p.dataset.yearPanel}));
const search=node();search.value='';
const minimum=node();minimum.value='100';
const sort=node();sort.value='rate';
const status=node();
function row(name,year,count,rate){const r=node({sample:String(count),rate:String(rate)});r.textContent=name;r.hasAttribute=()=>true;r.closest=()=>panels.find(p=>p.dataset.yearPanel===year);return r;}
const rows=[row('Jane Smith','2025',100,20),row('Other Judge','2025',500,10),row('Jane Smith','2026',300,90)];
const body={rows:rows.slice(),append(r){this.rows=this.rows.filter(x=>x!==r);this.rows.push(r);}};
const location={pathname:'/en/judge-approval-rates/',search:'?fy=2025',hash:'',href:'https://asylumjudge.com/en/judge-approval-rates/?fy=2025'};
const history={replaceState(a,b,url){const u=new URL(url,location.href);Object.assign(location,{pathname:u.pathname,search:u.search,hash:u.hash,href:u.href});},pushState(a,b,url){this.replaceState(a,b,url);}};
const document={
  body:{hasAttribute:()=>true,dataset:{defaultYear:'2025'}},documentElement:{lang:'en'},
  querySelector:s=>({'[data-category-search]':search,'[data-category-minimum]':minimum,'[data-category-sort]':sort,'[data-category-status]':status}[s]),
  querySelectorAll:s=>({'[data-year-panel]':panels,'[data-category-year]':links,'[data-category-filter-row]':rows,'[data-category-ranking] tbody':[body]}[s]||[])
};
const window={addEventListener(type,fn){listeners[type]=fn;}};
vm.runInNewContext(await read('asylumjudge/categories.js'),{window,document,location,history,URL,URLSearchParams});
assert.equal(panels[0].hidden,true);
assert.equal(status.textContent,'2 results');
search.value='Jane';search.listeners.input();assert.equal(status.textContent,'1 results');
minimum.value='200';minimum.listeners.change();assert.equal(rows[0].hidden,true);
assert.match(status.textContent,/No results/);
links[0].listeners.click({preventDefault(){}});assert.equal(status.textContent,'1 results');
assert.equal(new URL(location.href).searchParams.get('fy'),'2026');
location.search='?fy=2025&sort=sample';location.href='https://asylumjudge.com/en/judge-approval-rates/'+location.search;
listeners.popstate();assert.equal(search.value,'');assert.equal(minimum.value,'100');assert.equal(panels[1].hidden,false);
assert.equal(body.rows[0].dataset.sample,'500');
assert.equal(window.asylumJudgeStateUrl('NY',2025),'/en/states/new-york/?fy=2025');
console.log('AsylumJudge category checks passed: annual math, ambiguous identities, state pages, canonical links, sitemaps and interactive controls.');

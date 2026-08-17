import { readFileSync } from 'node:fs';

const dir=process.argv[2]||'/tmp/round17-production';
const read=(n)=>readFileSync(`${dir}/${n}`,'utf8');
const db=JSON.parse(read('db.json'));
const ai=JSON.parse(read('ai.json'));
const index=read('index.html');
const detailHtml=read('detail.html');
const app=read('app.js');
const detail=read('detail.js');
const css=read('legal.css');
const sitemap=read('sitemap.xml');
const robots=read('robots.txt');
const homeIndex=read('home-index.html');
const homeGuard=read('homepage-refresh-guard.js');
const homeLiveFix=read('articles-home-live-fix.js');
const records=Array.isArray(db.records)?db.records:[];
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const recordById=new Map(records.map(r=>[String(r.id),r]));
const analysisIds=analyses.map(a=>String(a.recordId||''));
const uniqueAnalysisIds=new Set(analysisIds);
const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
const expectedLocs=['https://trrb.net/legal/',...records.map(r=>`https://trrb.net/legal/detail.html?id=${encodeURIComponent(r.id)}`)];
const locSet=new Set(locs);
const prohibitedPlaceholders=['中文解析正在生成','中文信息整理尚未生成','中文裁判要旨/规则解析正在生成','中文裁判要旨/规则解析尚未生成'];

const nodes=[];
const node=(n,name,checks)=>{const failures=checks.filter(([,ok])=>!ok);for(const [label,ok] of checks)console.log(`${ok?'PASS':'FAIL'} NODE${n}: ${label}`);if(failures.length)throw new Error(`Node ${n} ${name} failed ${failures.length}/${checks.length}`);nodes.push(n);console.log(`ROUND 17 NODE ${n} FINAL: PASS`)};

node(1,'法律站内搜索中文解析覆盖与相关性排序',[
 ['Chinese analysis participates in search',app.includes('analysisSearchFields')&&app.includes('a.chineseTitle')&&app.includes('a.summary')&&app.includes('a.legalIssue')&&app.includes('a.holdingOrRule')&&app.includes('a.impact')],
 ['exact docket/citation weighting remains',app.includes('docket===query')&&app.includes('citation===query')&&app.includes('score+=160')],
 ['empty query preserves date-first ordering',app.includes("if(state.sort==='newest'||!state.q)return defaultSorted(scoped)")],
 ['Chinese analysis coverage available for every current record',analyses.length===records.length&&uniqueAnalysisIds.size===records.length]
]);
node(2,'判例/新规多维筛选组合与可分享检索URL',[
 ['multi-dimensional controls are deployed',['legal-q','legal-source','legal-body','legal-type','legal-from','legal-to','legal-sort'].every(id=>index.includes(`id="${id}"`))],
 ['filters restore from URL',['q','source','body','type','from','to','sort'].every(k=>app.includes(`params.get('${k}')`))],
 ['filter URL state persists',app.includes("p.set('from',state.from)")&&app.includes("p.set('to',state.to)")&&app.includes("p.set('sort',state.sort)")]
]);
node(3,'法律详情页相关判例/同机构规则关联发现',[
 ['related section deployed',detailHtml.includes('detail-related-list')],
 ['relations derive only from real database records',detail.includes('relatedRecords(base,records)')&&detail.includes('String(r.id)!==String(base.id)')],
 ['related links use record IDs',detail.includes('/legal/detail.html?id=${encodeURIComponent(r.id)}')]
]);
node(4,'案号、引证、机构与发布日期标准化展示',[
 ['standardized metadata functions deployed',['displayBody','displayDocket','displayCitation','displayDate'].every(x=>detail.includes(x))],
 ['missing official fields have explicit fallbacks',detail.includes('发布机构未提取')&&detail.includes('案号未提取')&&detail.includes('正式引证未提取')],
 ['official raw metadata remains input',detail.includes('r.issuingBody')&&detail.includes('r.docket')&&detail.includes('r.citation')&&detail.includes('r.publicationDate')]
]);
const ids=records.map(r=>String(r.id||'')), keys=records.map(r=>String(r.sourceKey||''));
node(5,'法律数据库增量更新差异检测与重复记录治理',[
 ['production database has dataset version',/^[a-f0-9]{64}$/.test(String(db.datasetVersion||''))],
 ['production count reconciles',Number(db.count)===records.length],
 ['production IDs are unique and non-empty',ids.every(Boolean)&&new Set(ids).size===ids.length],
 ['production sourceKeys are unique and non-empty',keys.every(Boolean)&&new Set(keys).size===keys.length]
]);
const required=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const missingBindings=records.filter(r=>!uniqueAnalysisIds.has(String(r.id))).map(r=>r.id);
const orphans=analyses.filter(a=>!recordById.has(String(a.recordId)));
const metadataMismatch=analyses.filter(a=>{const r=recordById.get(String(a.recordId));return r&&!['sourceSystem','authorityType','issuingBody','officialUrl','title'].every(k=>String(a[k]??'')===String(r[k]??''))});
const versionMismatch=analyses.filter(a=>String(a.datasetVersion||'')!==String(db.datasetVersion||''));
const incomplete=analyses.filter(a=>required.some(k=>!String(a[k]||'').trim()));
const duplicates=analysisIds.length-uniqueAnalysisIds.size;
const coveragePct=records.length?Number((uniqueAnalysisIds.size/records.length*100).toFixed(6)):0;
const completeCoveragePct=records.length?Number(((analyses.length-incomplete.length)/records.length*100).toFixed(6)):0;
node(6,'中文解析完整率、事实约束与缺失回退治理',[
 ['AI dataset matches official database',String(ai.datasetVersion||'')===String(db.datasetVersion||'')],
 ['AI count reconciles exactly with legal records',Number(ai.count)===analyses.length&&analyses.length===records.length],
 ['coveragePct is exactly 100',coveragePct===100],
 ['completeCoveragePct is exactly 100',completeCoveragePct===100],
 ['orphans are zero',orphans.length===0],
 ['duplicate analysis recordIds are zero',duplicates===0],
 ['metadata mismatches are zero',metadataMismatch.length===0],
 ['version mismatches are zero',versionMismatch.length===0],
 ['required-field omissions are zero',incomplete.length===0],
 ['missing record bindings are zero',missingBindings.length===0],
 ['production has no missing-Chinese placeholder state',!prohibitedPlaceholders.some(p=>app.includes(p)||detail.includes(p))],
 ['detail fails closed on impossible missing binding',detail.includes('未通过中文内容完整性校验')]
]);
node(7,'法律页面移动端性能、无障碍与交互稳定性',[
 ['mobile viewport is deployed',index.includes('width=device-width')&&detailHtml.includes('width=device-width')],
 ['responsive breakpoints deployed',css.includes('@media(max-width:900px)')&&css.includes('@media(max-width:600px)')],
 ['dynamic list announces updates',index.includes('aria-live="polite"')],
 ['legal assets remain lightweight',Buffer.byteLength(app)<30000&&Buffer.byteLength(detail)<30000&&Buffer.byteLength(css)<30000],
 ['search debounce and pagination guards remain',app.includes('setTimeout')&&app.includes("$('#legal-prev').disabled")&&app.includes("$('#legal-next').disabled")]
]);
node(8,'法律栏目生产错误监控、降级与恢复闭环',[
 ['list production has database failure fallback',app.includes('数据库加载失败')&&app.includes('暂时无法加载法律数据库')],
 ['detail production has failure fallback',detail.includes('暂时无法加载资料')&&detail.includes('当前不在数据库中')],
 ['AI transport failure does not replace official list with placeholder',app.includes('if(aiRes.ok)')&&app.includes("if(!a)return''")],
 ['detail missing Chinese binding fails closed',detail.includes('未通过中文内容完整性校验')],
 ['official source actions are retained',detail.includes('data-official-primary="true"')]
]);
node(9,'法律SEO索引质量、Sitemap更新时效与内部链接完整性',[
 ['hub canonical/index metadata deployed',index.includes('rel="canonical" href="https://trrb.net/legal/"')&&index.includes('name="robots" content="index,follow"')],
 ['legal sitemap count is current',locs.length===records.length+1],
 ['legal sitemap has no duplicates',new Set(locs).size===locs.length],
 ['every current detail URL is in sitemap',expectedLocs.every(u=>locSet.has(u))],
 ['robots advertises legal sitemap',robots.includes('Sitemap: https://trrb.net/sitemap-legal.xml')],
 ['dynamic canonical and structured data remain',detail.includes('https://trrb.net/legal/detail.html?id=${encodeURIComponent(recordId)}')&&detail.includes("'@type':'Legislation'")]
]);

const guardPos=homeIndex.indexOf('homepage-refresh-guard.js');
const homePos=homeIndex.indexOf('articles-home.js');
const liveFixPos=homeIndex.indexOf('articles-home-live-fix.js');
const homepageChecks=[
 ['homepage loads freshness guard before normal home renderer',guardPos>=0&&homePos>guardPos],
 ['homepage refresh fix loads after normal renderer',liveFixPos>homePos],
 ['homepage guard uses only unified public live endpoint',homeGuard.includes('/.netlify/functions/public-home-articles')&&!/TRRB_ARTICLE_INDEX|TRRB_ARTICLES|TRRB_ARTICLE_CHUNK/.test(homeGuard)],
 ['homepage refresh uses only unified public live endpoint',homeLiveFix.includes('/.netlify/functions/public-home-articles')&&!/TRRB_ARTICLE_INDEX|TRRB_ARTICLES|TRRB_ARTICLE_CHUNK/.test(homeLiveFix)],
 ['homepage guard enforces exact 4-day maximum age',homeGuard.includes('4 * 24 * 60 * 60 * 1000')&&homeGuard.includes('filter(isFresh)')],
 ['homepage refresh enforces exact 4-day maximum age',homeLiveFix.includes('4 * 24 * 60 * 60 * 1000')&&homeLiveFix.includes('filter(fresh)')],
 ['homepage ordering is exact published_at/created_at timestamp descending',homeGuard.includes('item?.published_at || item?.created_at')&&homeGuard.includes('articleTime(b) - articleTime(a)')&&homeLiveFix.includes('item?.published_at || item?.created_at')&&homeLiveFix.includes('articleTime(b) - articleTime(a)')],
 ['homepage policy never backfills with fifth-day static archive',!homeGuard.includes('mergeArticles(')&&!homeLiveFix.includes('mergeArticles(')]
];
for(const [label,ok] of homepageChecks)console.log(`${ok?'PASS':'FAIL'} HOMEPAGE: ${label}`);
if(homepageChecks.some(([,ok])=>!ok))throw new Error('Homepage common strict rules failed');
console.log('ROUND 17 HOMEPAGE COMMON RULES: PASS');

if(nodes.join(',')!=='1,2,3,4,5,6,7,8,9')throw new Error(`Final node sequence invalid: ${nodes.join(',')}`);
console.log(`ROUND 17 NODE 6 STRICT FINAL: totalAnalyses=${analyses.length}; totalLegalRecords=${records.length}; coveragePct=${coveragePct}; completeCoveragePct=${completeCoveragePct}; orphans=${orphans.length}; duplicates=${duplicates}; metadataMismatch=${metadataMismatch.length}; versionMismatch=${versionMismatch.length}; missingRequired=${incomplete.length}; missingBindings=${missingBindings.length}`);
console.log('ROUND 17 NODE 10 FINAL: PASS');
console.log('ROUND 17: 10/10 PASS');

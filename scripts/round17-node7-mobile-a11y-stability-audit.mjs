import { readFileSync, statSync } from 'node:fs';
const index=readFileSync(process.argv[2]||'legal/index.html','utf8');
const detail=readFileSync(process.argv[3]||'legal/detail.html','utf8');
const css=readFileSync(process.argv[4]||'legal/legal.css','utf8');
const app=readFileSync(process.argv[5]||'legal/legal-app.js','utf8');
const detailJs=readFileSync(process.argv[6]||'legal/detail.js','utf8');
const spec=readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');
const sizes={index:Buffer.byteLength(index),detail:Buffer.byteLength(detail),css:Buffer.byteLength(css),app:Buffer.byteLength(app),detailJs:Buffer.byteLength(detailJs)};
const checks=[
  ['node7 name fixed',spec.includes('7. 法律页面移动端性能、无障碍与交互稳定性')],
  ['list viewport supports mobile',index.includes('name="viewport"')&&index.includes('width=device-width')],
  ['detail viewport supports mobile',detail.includes('name="viewport"')&&detail.includes('width=device-width')],
  ['filter controls have programmatic labels',/\<label\>关键词\<input id="legal-q"/.test(index)&&/\<label\>来源\<select id="legal-source"/.test(index)&&/\<label\>起始日期\<input id="legal-from"/.test(index)],
  ['navigation regions are labelled',index.includes('nav aria-label="法律资料导航"')&&index.includes('nav class="pagination" aria-label="分页"')],
  ['dynamic results announce changes',index.includes('id="legal-list"')&&index.includes('aria-live="polite"')],
  ['mobile breakpoints exist',css.includes('@media(max-width:900px)')&&css.includes('@media(max-width:600px)')],
  ['mobile filter layout collapses to one column',css.includes('.filters{grid-template-columns:1fr}')],
  ['interactive controls preserve pointer/disabled states',css.includes('cursor:pointer')&&css.includes('.pagination button:disabled')],
  ['search input is debounced',app.includes('setTimeout')&&app.includes('180')],
  ['pagination prevents invalid navigation',app.includes("$('#legal-prev').disabled=state.page<=1")&&app.includes("$('#legal-next').disabled=state.page>=pages")],
  ['load failures have visible fallback',app.includes('数据库加载失败')&&detailJs.includes('暂时无法加载资料')],
  ['list JS stays lightweight',sizes.app<30000],
  ['detail JS stays lightweight',sizes.detailJs<30000],
  ['legal CSS stays lightweight',sizes.css<30000]
];
let failures=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
console.log(`ROUND 17 NODE 7 ASSET BYTES: index=${sizes.index} detail=${sizes.detail} css=${sizes.css} app=${sizes.app} detailJs=${sizes.detailJs}`);
if(failures){console.error(`ROUND 17 NODE 7: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 7: PASS (${checks.length}/${checks.length})`);

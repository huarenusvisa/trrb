import fs from 'node:fs';
const html=fs.readFileSync('jobs/publish.html','utf8');
const js=fs.readFileSync('jobs/publish.js','utf8');
const checks=[
  ['exactly four visible publish steps',(html.match(/data-step="[1-4]"/g)||[]).length===4],
  ['step 1 is title and category',/data-step="1"[\s\S]*id="title"[\s\S]*id="category"/.test(html)],
  ['step 2 uses one natural-language location input',/data-step="2"[\s\S]*id="location-text"/.test(html)&&!/id="state|id="county|id="borough|id="neighborhood/.test(html)],
  ['step 3 keeps salary and contact together',/data-step="3"[\s\S]*id="salary-min"[\s\S]*id="contact-method"/.test(html)],
  ['step 4 contains description and publish completion',/data-step="4"[\s\S]*id="description"/.test(html)&&/id="publish-btn"/.test(html)],
  ['advanced options are collapsed and optional',/<details class="advanced">[\s\S]*工作类型[\s\S]*工作环境图片/.test(html)],
  ['employment defaults to unspecified',/<option value="unspecified">系统默认<\/option>/.test(html)],
  ['photo privacy re-encoding remains enabled',/reencodeImage/.test(js)&&/image\/jpeg/.test(js)&&/EXIF/.test(html)],
  ['draft and publish still use unified job_listings table',/job_listings/.test(js)&&/save\('open'\)/.test(js)&&/save\('draft'\)/.test(js)],
  ['natural location normalization remains required',/JobsR3Location/.test(js)&&/resolvedLocation\?\.state_code/.test(js)&&/resolvedLocation\?\.city/.test(js)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`JOBS-R3-N4 PUBLISH FLOW FAIL (${failed})`);process.exit(1);}
console.log('JOBS-R3-N4 four-step publish flow: PASS');

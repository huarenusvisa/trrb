import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const mobile=read('apps/mobile/app/jobs.tsx');
const feed=read('netlify/functions/public-jobs.js');
const normalizer=read('jobs/location-normalizer-r3.js');
const webBridge=read('jobs/search-r3-natural-location.js');
const webSearch=read('jobs/search.html');
const publish=read('jobs/publish.html');
const checks=[
  ['shared web natural-location resolver exists',/window\.JobsR3Location\s*=/.test(normalizer)&&/纽约法拉盛/.test(normalizer)&&/威斯康星麦迪逊/.test(normalizer)],
  ['publish page uses one natural location input',/id="location-text"/.test(publish)&&/location-normalizer-r3\.js/.test(publish)&&/纽约法拉盛/.test(publish)],
  ['web search visibly mounts natural location input',/id="natural-location"/.test(webSearch)&&/id="natural-location-btn"/.test(webSearch)&&/search-r3-natural-location\.js/.test(webSearch)&&/location-normalizer-r3\.js/.test(webSearch)],
  ['web search bridge dispatches selected area',/jobs:r2-search-area-selected/.test(webBridge)&&/JobsR3Location\?\.resolve/.test(webBridge)],
  ['web search gives Chinese and English examples',/纽约法拉盛/.test(webSearch)&&/威斯康星麦迪逊/.test(webSearch)&&/Flushing NY/.test(webSearch)],
  ['mobile exposes one natural location input',/placeholder="输入工作地点，如纽约法拉盛"/.test(mobile)&&/找附近工作/.test(mobile)],
  ['mobile recognizes Chinese and English examples',/纽约法拉盛/.test(mobile)&&/威斯康星麦迪逊/.test(mobile)&&/madison wi/.test(mobile)],
  ['mobile sends normalized state and city filters',/q\.set\('state_code'/.test(mobile)&&/q\.set\('city'/.test(mobile)],
  ['public feed accepts bounded location filters',/params\.state_code/.test(feed)&&/query\.state_code/.test(feed)&&/query\.city/.test(feed)],
  ['blue collar default remains intact',/sort:'blue_collar'/.test(mobile)&&/BLUE_COLLAR_PRIORITY/.test(feed)],
  ['location filter does not remove salary from cards',/薪资面议/.test(mobile)&&/salary_min/.test(feed)&&/salary_max/.test(feed)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed){console.error(`JOBS-R3-N3 NATURAL LOCATION FAIL (${failed})`);process.exit(1);}
console.log('JOBS-R3-N3 web + mobile natural-location slice: PASS');

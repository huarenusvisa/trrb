import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const html=read('jobs/publish.html');
const publish=read('jobs/publish.js');
const normalizer=read('jobs/location-normalizer-r3.js');
const spec=read('docs/JOBS-R3-BLUE-COLLAR-MARKETPLACE.md');
const must=(ok,msg)=>{if(!ok)throw new Error(`FAIL: ${msg}`);console.log(`PASS: ${msg}`)};

must(html.includes('id="location-text"'),'publisher has one natural-language location input');
for(const forbidden of ['id="state"','id="city"','id="county"','id="borough"','id="neighborhood"']) must(!html.includes(forbidden),`publisher does not require ${forbidden}`);
must(publish.includes('JobsR3Location') && publish.includes('resolvedLocation.state_code') && publish.includes('resolvedLocation.city'),'publisher stores canonical resolved location fields');
must(publish.includes('latitude: Number.isFinite(resolvedLocation.latitude)') && publish.includes('longitude: Number.isFinite(resolvedLocation.longitude)'),'publisher stores resolved map center when available');
for(const phrase of ['纽约法拉盛','威斯康星麦迪逊','madison wi','flushing ny']) must(normalizer.toLowerCase().includes(phrase.toLowerCase()),`normalizer covers ${phrase}`);
must(normalizer.includes('job_discovery_areas'),'normalizer reuses R2 human-area catalog instead of a second jobs source');
must(spec.includes('JOBS-R3-N2：PASS'),'N2 is closed before N3');
console.log('JOBS-R3-N3 STATIC: PASS');

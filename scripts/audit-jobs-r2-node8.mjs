import fs from 'node:fs';
const spec=fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const search=fs.readFileSync('jobs/search.js','utf8');
const html=fs.readFileSync('jobs/search.html','utf8');
const loc=fs.readFileSync('supabase/migrations/20260817011000_jobs_r2_node1_search_location.sql','utf8');
const checks=[
 ['spec N8 exists',/8\. 列表\/地图双模式与跨地区找工/.test(spec)],
 ['list and map switches remain available',/id="list-view"/.test(html)&&/id="map-view"/.test(html)&&/showList/.test(search)&&/showMap/.test(search)],
 ['map centers on current job-search center',/当前找工中心/.test(search)&&/coords\.latitude/.test(search)],
 ['nearby jobs are visibly aggregated on map',/const groups = new Map\(\)/.test(search)&&/个附近岗位/.test(search)&&/job-count-label/.test(search)],
 ['dragged map exposes explicit search-here action',/在这个区域找工作/.test(search)&&/map\.on\('moveend'/.test(search)&&/mapSearchButton\.hidden = false/.test(search)],
 ['search-here uses map center rather than GPS',/const center = map\.getCenter\(\)/.test(search)&&/source:'manual_map'/.test(search)&&/location_consent_at:null/.test(search)],
 ['manual map source is allowed by account location schema',/manual_map/.test(loc)&&/fixed_location/.test(loc)],
 ['cross-region map search clears old geography filters',/searchThisMapArea[\s\S]*?\['state','city','county','borough','neighborhood'\][\s\S]*?= ''/.test(search)],
 ['map viewport resolves to supported 5-10-25-50 radius',/radiusForMapViewport/.test(search)&&/return 5/.test(search)&&/return 10/.test(search)&&/return 25/.test(search)&&/return 50/.test(search)],
 ['map choice persists to unified account preference',/searchThisMapArea[\s\S]*?await persistLocation/.test(search)&&/mode:'fixed_location'/.test(search)],
 ['manual map can replace prior current GPS center',/locationMode = 'fixed_location'/.test(search)&&/source:'device_geolocation'/.test(search)],
 ['programmatic fit does not masquerade as user drag',/suppressMapMove/.test(search)&&/setTimeout\(\(\) => \{ suppressMapMove = false/.test(search)],
 ['no shadow listings or map dataset',!/job_listings_r2|jobs_r2_listings|map_job_listings/i.test(search)]
];
const failed=checks.filter(([,ok])=>!ok); for(const [n,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(failed.length){console.error(`JOBS-R2-N8 FAIL: ${failed.length}/${checks.length}`);process.exit(1)} console.log(`JOBS-R2-N8 PASS: ${checks.length}/${checks.length} checks passed`);
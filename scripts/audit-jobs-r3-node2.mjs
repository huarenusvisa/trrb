import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const api=read('netlify/functions/public-jobs.js');
const home=read('jobs-home.js');
const app=read('apps/mobile/app/jobs.tsx');
const migration=read('supabase/migrations/20260820172000_jobs_r3_node2_blue_collar_sort.sql');
const spec=read('docs/JOBS-R3-BLUE-COLLAR-MARKETPLACE.md');
const must=(ok,msg)=>{if(!ok)throw new Error(`FAIL: ${msg}`); console.log(`PASS: ${msg}`)};

const priority=['restaurant','construction','logistics-warehouse','truck-driver','retail-grocery','beauty-nail','massage','home-care'];
for(const slug of priority){
  must(api.includes(`['${slug}'`) && migration.includes(`when '${slug}'`),`blue-collar priority includes ${slug}`);
}
must(api.includes("sort||'blue_collar'") && home.includes('sort=blue_collar'),'homepage feed defaults to blue-collar ordering');
must(app.includes('sort=blue_collar'),'APP feed explicitly uses blue-collar ordering');
must(migration.includes("p_sort='relevance' and nullif") && migration.includes("p_sort='blue_collar' or"),'empty default marketplace search is blue-collar first without breaking keyword relevance');
must(migration.includes("p_sort='distance'") && migration.includes("p_sort='latest'") && migration.includes("p_sort='salary'"),'R2 explicit distance/latest/salary sorts remain available');
must(spec.includes('JOBS-R3-N2：IN_PROGRESS'),'R3 spec tracks N2 before production verification');
console.log('JOBS-R3-N2 STATIC: PASS');

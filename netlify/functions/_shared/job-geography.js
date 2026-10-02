const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const {rest} = require('./supabase-admin');
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const spelling = value=>normalize(value).replace(/\bsaint\b/g,'st').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
const catalogPath=[path.join(__dirname,'geography/catalog.json.gz'),path.join(process.cwd(),'netlify/functions/_shared/geography/catalog.json.gz')].find(file=>fs.existsSync(file));
if(!catalogPath)throw new Error('Job geography catalog is missing from the function bundle');
const catalog = JSON.parse(zlib.gunzipSync(fs.readFileSync(catalogPath)));
const index = new Map();
for (const city of catalog.cities) for (const alias of [city.en,city.en.replace(/ Town$/,'').replace(/ urban county$/,''),city.zh,city.id,...city.aliases].filter(Boolean)) {
 const key=spelling(alias); const found=index.get(key)||[]; if(!found.includes(city)) found.push(city); index.set(key,found);
}
let cached, expires=0;
function resolve(value,stateHint='') {
 const pieces=String(value).split(',').map(s=>s.trim());
 const state=catalog.states.find(s=>[s.code,s.en,s.zh].some(a=>normalize(a)===normalize(pieces.length>1?pieces.at(-1):stateHint)));
 const key=spelling(pieces.length>1?pieces.slice(0,-1).join(','):value);
 const candidates=(index.get(key)||[]).filter(c=>!state || c.state===state.code);
 const merged=[...new Map(candidates.map(c=>[c.state+':'+spelling(c.en),c])).values()];
 if(merged.length===1)return merged[0];
 const exact=candidates.filter(c=>spelling(c.en)===key);if(exact.length===1)return exact[0];
 // Chinese / neighborhood aliases remain compatible; plain duplicate US city names require a state.
 const preferred=candidates.filter(c=>c.id);
 return preferred.length===1?preferred[0]:null;
}
function stateFor(value) {return catalog.states.find(s=>[s.code,s.en,s.zh].some(a=>normalize(a)===normalize(value)));}
async function locations() {
 if(cached && Date.now()<expires)return cached;
 const rows=await rest('rpc/public_job_location_facets',{method:'POST',body:{}});
 const centers=[]; const cities=[]; const seen=new Set(); const unresolved=[];
 for(const row of rows||[]) {
  const state=stateFor(row.state); if(!state)continue; if(state && [state.en,state.zh,state.code,'United States','USA','US','Remote'].some(s=>normalize(s)===normalize(row.name)))continue;
  const city=resolve(row.name,row.state); const key=row.state+':'+normalize(row.name);
  if(city)centers.push({state:row.state,name:normalize(row.name),lat:city.lat,lng:city.lng});else unresolved.push(row);
  if(seen.has(key))continue;seen.add(key);
  cities.push({...city,en:row.name,zh:city?.zh||row.name,state:row.state,aliases:city?.aliases||[],count:Number(row.count),value:`${row.name}, ${row.state}`,located:!!city});
 }
 cached={centers,cities,unresolved};expires=Date.now()+60000;return cached;
}
module.exports={catalog,normalize,resolve,stateFor,locations};

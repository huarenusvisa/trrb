#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const input=process.argv[2],output=process.argv[3]||'immigration-judge-normalized.json';
if(!input){console.error('Usage: node scripts/immigration-judge-normalize.mjs <input.json> [output.json]');process.exit(2)}
const raw=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));const rows=Array.isArray(raw)?raw:(raw.rows||raw.results||[]);
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const title=s=>clean(s).toLowerCase().replace(/(^|[\s,.'-])([a-z])/g,(_,a,b)=>a+b.toUpperCase());
const judge=s=>title(clean(s).replace(/\b(judge|hon\.?|honorable|immigration judge)\b/ig,'').replace(/\s*,\s*/g,', '));
const court=s=>clean(s).replace(/\bImmigration Court\b/ig,'Immigration Court').replace(/\s+/g,' ');
const state=s=>clean(s).toUpperCase();
const nat=s=>{const x=clean(s);if(/^(china|people'?s republic of china|prc|中国|中华人民共和国)$/i.test(x))return 'China';return title(x)};
const out=rows.map(r=>({...r,judge_name:judge(r.judge_name),judge_name_normalized:judge(r.judge_name).toLowerCase(),court_name:court(r.court_name),court_city:title(r.court_city),court_state:state(r.court_state),nationality:r.nationality==null?r.nationality:nat(r.nationality),nationality_code:/^(china|中国)$/i.test(nat(r.nationality))?'CHN':r.nationality_code,source:clean(r.source),source_updated_at:r.source_updated_at||null}));
fs.writeFileSync(output,JSON.stringify({generated_at:new Date().toISOString(),rows:out},null,2));console.log(JSON.stringify({input_rows:rows.length,output_rows:out.length,output},null,2));

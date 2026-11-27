import fs from 'node:fs';

const DB='data/legal/unified-legal-authorities-latest.json';
const AI='data/legal/legal-ai-analysis-latest.json';
const OUT='sitemap-legal.xml';
const ORIGIN='https://trrb.net';
const REQUIRED=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const NETLIFY_CONTEXT=String(process.env.CONTEXT||'').trim();
const IS_NON_PRODUCTION_PREVIEW=['deploy-preview','branch-deploy'].includes(NETLIFY_CONTEXT);

const db=JSON.parse(fs.readFileSync(DB,'utf8'));
const ai=JSON.parse(fs.readFileSync(AI,'utf8'));
const records=(Array.isArray(db.records)?db.records:[]).filter(r=>r&&String(r.id||'').trim());
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const analysisById=new Map();
for(const analysis of analyses){
  const id=String(analysis?.recordId||'').trim();
  if(id&&!analysisById.has(id)) analysisById.set(id,analysis);
}

const complete=(analysis)=>Boolean(analysis)&&
  REQUIRED.every(field=>String(analysis?.[field]||'').trim())&&
  String(analysis?.datasetVersion||'')===String(db.datasetVersion||'')&&
  String(analysis?.disclaimer||'').includes('不构成法律意见');

const eligible=[];
const missing=[];
const incomplete=[];
for(const record of records){
  const id=String(record.id);
  const analysis=analysisById.get(id);
  if(!analysis){missing.push(id);continue;}
  if(!complete(analysis)){incomplete.push(id);continue;}
  eligible.push(record);
}

const failures=[];
if(String(ai.datasetVersion||'')!==String(db.datasetVersion||'')){
  failures.push(`AI datasetVersion ${ai.datasetVersion||'missing'} != legal database ${db.datasetVersion||'missing'}`);
}
if(missing.length||incomplete.length||eligible.length!==records.length){
  failures.push(`eligible=${eligible.length}/${records.length}; missing=${missing.length}; incomplete=${incomplete.length}`);
}

if(failures.length){
  const detail=failures.join('; ');
  if(IS_NON_PRODUCTION_PREVIEW&&fs.existsSync(OUT)){
    console.warn(`LEGAL SITEMAP PREVIEW DEFERRED: ${detail}; preserved committed ${OUT}. Production remains blocked until AI and legal database versions match.`);
  }else{
    throw new Error(`Legal sitemap blocked: ${detail}`);
  }
}else{
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const urls=[`${ORIGIN}/legal/`,...eligible.map(r=>`${ORIGIN}/legal/detail.html?id=${encodeURIComponent(r.id)}`)];
  const xml=['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',...urls.map(u=>`  <url><loc>${esc(u)}</loc></url>`),'</urlset>',''].join('\n');
  fs.writeFileSync(OUT,xml);
  console.log(`LEGAL SITEMAP GENERATED: urls=${urls.length}; records=${records.length}; analyses=${analyses.length}; datasetVersion=${db.datasetVersion||''}`);
}

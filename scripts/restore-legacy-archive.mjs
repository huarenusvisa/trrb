#!/usr/bin/env node
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://trrb.net';
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://fwiznbpsqkfgkvyznebz.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((v) => v.startsWith('--limit='));
const LIMIT = Math.max(1, Math.min(500, Number(limitArg?.split('=')[1] || 200)));

function clean(v='') { return String(v || '').replace(/\s+/g, ' ').trim(); }
function normalizeTitle(v='') { return clean(v).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\s\-—_·•:：,，。.!！?？“”‘’'"()（）【】\[\]《》<>\/\\|]+/g,'').toLowerCase(); }
function parseChunk(source, file) {
  const marker = 'window.TRRB_ARTICLE_CHUNK=';
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${file}: missing TRRB_ARTICLE_CHUNK marker`);
  let json = source.slice(at + marker.length).trim();
  if (json.endsWith(';')) json = json.slice(0,-1);
  const rows = JSON.parse(json);
  if (!Array.isArray(rows)) throw new Error(`${file}: archive payload is not an array`);
  return rows;
}
function slugify(title, legacyId) {
  const base = clean(title).normalize('NFKC').toLowerCase()
    .replace(/[\s\/\\|]+/g,'-')
    .replace(/[^\p{L}\p{N}-]+/gu,'-')
    .replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,96);
  const suffix = clean(legacyId).replace(/^wp-/i,'wp');
  return `${base || 'legacy-article'}-${suffix}`;
}
function nyOffset(date) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(new Date(`${date}T12:00:00Z`));
  const raw = parts.find((p)=>p.type==='timeZoneName')?.value || 'GMT-04:00';
  return raw.replace('GMT','') || '-04:00';
}
function publishedAt(row) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(row.date)) ? clean(row.date) : '';
  if (!date) return null;
  const time = clean(row.time).match(/(\d{2}):(\d{2})$/);
  const hhmm = time ? `${time[1]}:${time[2]}` : '12:00';
  return `${date}T${hhmm}:00${nyOffset(date)}`;
}
async function rest(table, params={}, options={}) {
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,String(v)));
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { apikey: SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, Accept:'application/json', 'Content-Type':'application/json', ...(options.headers||{}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${response.status}: ${text.slice(0,500)}`);
  return text ? JSON.parse(text) : [];
}
async function allExisting() {
  const out=[];
  for (let offset=0;;offset+=1000) {
    const rows = await rest('articles',{select:'id,legacy_id,title,slug,published_at,status,visibility',order:'created_at.asc',limit:'1000',offset:String(offset)});
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
async function loadArchive() {
  const files=(await readdir(ROOT)).filter((n)=>/^articles-chunk-\d+\.js$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  const seen=new Set(); const rows=[];
  for (const file of files) {
    for (const row of parseChunk(await readFile(path.join(ROOT,file),'utf8'),file)) {
      const id=clean(row.id); if (!id || seen.has(id)) continue;
      seen.add(id); rows.push({...row,__file:file});
    }
  }
  return {files,rows};
}
function batch(items,size=25){ const out=[]; for(let i=0;i<items.length;i+=size) out.push(items.slice(i,i+size)); return out; }

const {files,rows:archiveRows}=await loadArchive();
const [existing,categories]=await Promise.all([
  allExisting(),
  rest('categories',{select:'id,name,slug',is_active:'eq.true',limit:'500'})
]);
const cats=new Map(categories.map((c)=>[clean(c.name),c]));
const legacy=new Set();
const titleKeys=new Set();
for (const row of existing) {
  const l=clean(row.legacy_id);
  if(l){ legacy.add(l); legacy.add(l.replace(/^wp-/i,'')); if(/^\d+$/.test(l)) legacy.add(`wp-${l}`); }
  const t=normalizeTitle(row.title); if(t) titleKeys.add(t);
}
const plannedLegacy=new Set(legacy);
const plannedTitles=new Set(titleKeys);
const skipped={existing_legacy:0,existing_title:0,no_body:0,bad_id:0,bad_date:0,unknown_category:0};
const candidates=[];
for (const row of archiveRows) {
  const id=clean(row.id);
  if(!/^wp-\d+$/i.test(id)){ skipped.bad_id++; continue; }
  const numeric=id.replace(/^wp-/i,'');
  if(plannedLegacy.has(id)||plannedLegacy.has(numeric)){ skipped.existing_legacy++; continue; }
  const title=clean(row.title); const titleKey=normalizeTitle(title);
  if(!titleKey || plannedTitles.has(titleKey)){ skipped.existing_title++; continue; }
  const body=Array.isArray(row.body)?row.body.map(clean).filter(Boolean):[];
  const content=body.join('\n\n');
  if(content.length<180){ skipped.no_body++; continue; }
  const published=publishedAt(row); if(!published){ skipped.bad_date++; continue; }
  const cat=cats.get(clean(row.category)); if(!cat){ skipped.unknown_category++; continue; }
  const slug=slugify(title,id);
  candidates.push({
    legacy_id:id,title,slug,summary:clean(row.excerpt)||content.slice(0,180),content,
    category_id:cat.id,category_name:cat.name,
    cover_image: clean(row.image) && !String(row.image).includes('image-placeholder.svg') ? clean(row.image) : '',
    author:clean(row.author)||'Tang Ren Daily',status:'published',visibility:'public',published_at:published,
    source_url:clean(row.sourceUrl),source_name:'唐人日报历史归档',primary_section:cat.slug,
    canonical_url:`${SITE}/${encodeURIComponent(cat.slug)}/${encodeURIComponent(slug)}`,
    metadata:{migration_source:'github-static-archive',archive_file:row.__file,archive_id:id,archive_date:clean(row.date),archive_time:clean(row.time),restored_at:new Date().toISOString()}
  });
  plannedLegacy.add(id); plannedLegacy.add(numeric); plannedTitles.add(titleKey);
}
const selected=candidates.slice(0,LIMIT);
let inserted=[];
if(APPLY && selected.length){
  for(const part of batch(selected,25)) {
    const rows=await rest('articles',{}, {method:'POST',headers:{Prefer:'return=representation'},body:part});
    inserted.push(...rows.map((r)=>({id:r.id,legacy_id:r.legacy_id,title:r.title,slug:r.slug,canonical_url:r.canonical_url})));
  }
}
const report={
  generated_at:new Date().toISOString(),mode:APPLY?'apply':'report',archive_files:files.length,archive_records:archiveRows.length,
  current_articles:existing.length,recoverable_missing:candidates.length,selected:selected.length,inserted:inserted.length,skipped,
  sample_missing:selected.slice(0,20).map((r)=>({legacy_id:r.legacy_id,title:r.title,category_name:r.category_name,canonical_url:r.canonical_url})),
  inserted_rows:inserted
};
await mkdir(path.join(ROOT,'reports'),{recursive:true});
await writeFile(path.join(ROOT,'reports','legacy-migration-latest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

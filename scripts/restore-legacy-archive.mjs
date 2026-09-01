#!/usr/bin/env node
import { resolveLegacyDisposition } from './legacy-category-policy.mjs';
import { sanitizeLegacyText } from './legacy-text-sanitize.mjs';
import { appendFile, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://trrb.net';
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://fwiznbpsqkfgkvyznebz.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((v) => v.startsWith('--limit='));
const concurrencyArg = process.argv.find((v) => v.startsWith('--concurrency='));
const LIMIT = Math.max(1, Math.min(2000, Number(limitArg?.split('=')[1] || 1000)));
const CONCURRENCY = Math.max(1, Math.min(8, Number(
  concurrencyArg?.split('=')[1] || process.env.LEGACY_RESTORE_CONCURRENCY || 4
)));
const PRIORITY_IDS = new Set(String(process.env.LEGACY_PRIORITY_IDS || 'wp-117123').split(',').map((v)=>v.trim()).filter(Boolean));
const PRIORITY_ONLY = String(process.env.LEGACY_PRIORITY_ONLY || '').toLowerCase() === 'true';
const CATEGORY_OVERRIDES = new Map(
  String(process.env.LEGACY_CATEGORY_OVERRIDES || '')
    .split(',')
    .map((entry) => entry.split('=').map((value) => value.trim()))
    .filter(([from, to]) => from && to)
);

async function loadFinalClosureConfig() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, 'config', 'legacy-archive-final-closure-20260829.json'), 'utf8'));
  } catch (error) {
    throw new Error(`unable to read final closure config: ${error?.message || error}`);
  }
}
const FINAL_CLOSURE_CONFIG = await loadFinalClosureConfig();
const APPROVED_MANUAL_REVIEW_CATEGORIES = new Map(
  Object.entries(FINAL_CLOSURE_CONFIG.approved_manual_review_categories || {})
    .map(([legacyId, category]) => [clean(legacyId), clean(category)])
    .filter(([legacyId, category]) => legacyId && category)
);
const APPROVED_DUPLICATE_ALIAS_TARGETS = new Map(
  Object.entries(FINAL_CLOSURE_CONFIG.approved_duplicate_alias_targets || {})
    .map(([legacyId, targetLegacyId]) => [clean(legacyId).toLowerCase(), clean(targetLegacyId).toLowerCase()])
    .filter(([legacyId, targetLegacyId]) => legacyId && targetLegacyId)
);
const FORCED_MANUAL_REVIEW_IDS = new Set(
  Array.isArray(FINAL_CLOSURE_CONFIG.manual_review_legacy_ids)
    ? FINAL_CLOSURE_CONFIG.manual_review_legacy_ids.map((value) => String(value || '').trim()).filter(Boolean)
    : []
);

function clean(v='') { return sanitizeLegacyText(v); }
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
    // A unique order is required for offset pagination; created_at ties can otherwise skip rows between pages.
    const rows = await rest('articles',{select:'id,legacy_id,title,slug,canonical_url,published_at,status,visibility,category_id,category_name,primary_section,topic_key,metadata',order:'id.asc',limit:'1000',offset:String(offset)});
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
function skippableInsertConflict(error) {
  const message=String(error?.message || error);
  if (/articles 409:.*duplicate published article title/i.test(message)) return 'duplicate_title';
  if (/articles 400:.*"code":"23514"/i.test(message)) return 'content_constraint';
  if (/articles 400:.*"code":"22P05"/i.test(message)) return 'invalid_text';
  return '';
}
async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}
function legacyChangedUrls(row) {
  const legacyId = clean(row.legacy_id);
  const numericId = legacyId.replace(/^wp-/i, '');
  const urls = [row.canonical_url];
  if (/^\d+$/.test(numericId)) {
    urls.push(
      `${SITE}/article.html?id=${encodeURIComponent(legacyId)}`,
      `${SITE}/article.html?id=${encodeURIComponent(numericId)}`,
      `${SITE}/?p=${encodeURIComponent(numericId)}`
    );
  }
  if (clean(row.title)) urls.push(`${SITE}/${encodeURIComponent(clean(row.title))}/`);
  return urls.filter(Boolean);
}

const {files,rows:archiveRows}=await loadArchive();
const [existing,categories]=await Promise.all([
  allExisting(),
  rest('categories',{select:'id,name,slug',is_active:'eq.true',limit:'500'})
]);
const cats=new Map(categories.map((c)=>[clean(c.name),c]));
function categoryRecord(name='') {
  const normalized=clean(name);
  return cats.get(normalized) || (normalized==='中国热门头条' ? cats.get('热门头条') : null);
}
function approvedCategoryName(name='') {
  const normalized=clean(name);
  return normalized==='热门头条' ? '中国热门头条' : normalized;
}
const legacy=new Set();
const titleKeys=new Set();
for (const row of existing) {
  const l=clean(row.legacy_id);
  if(l){ legacy.add(l); legacy.add(l.replace(/^wp-/i,'')); if(/^\d+$/.test(l)) legacy.add(`wp-${l}`); }
  const aliases=Array.isArray(row.metadata?.legacy_alias_ids)?row.metadata.legacy_alias_ids:[];
  for(const value of aliases){
    const alias=clean(value);
    if(!alias) continue;
    legacy.add(alias); legacy.add(alias.replace(/^wp-/i,''));
    if(/^\d+$/.test(alias)) legacy.add(`wp-${alias}`);
  }
  const t=normalizeTitle(row.title); if(t) titleKeys.add(t);
}
const plannedLegacy=new Set(legacy);
const plannedTitles=new Set(titleKeys);
const existingByTitle=new Map();
for (const row of existing) {
  const titleKey=normalizeTitle(row.title);
  if(!titleKey) continue;
  const current=existingByTitle.get(titleKey);
  const rank=(item)=>Number(item?.status==='published')*4+Number(item?.visibility==='public')*2+Number(Boolean(clean(item?.canonical_url)));
  if(!current || rank(row)>rank(current)) existingByTitle.set(titleKey,row);
}
const skipped={
  existing_legacy:0,existing_title:0,no_body:0,bad_id:0,bad_date:0,
  unknown_category:0,manual_review_category:0,retired_non_article:0
};
const skippedByCategory={unknown:{},manual_review:{},retired:{}};
const manualReviewRows=[];
const retiredRows=[];
const approvedAliasPlans=[];
const plannedCandidateByTitle=new Map();
function bumpCategory(bucket, category) {
  const key=clean(category)||"(empty)";
  bucket[key]=(bucket[key]||0)+1;
}
const candidates=[];
for (const row of archiveRows) {
  const id=clean(row.id);
  if(!/^wp-\d+$/i.test(id)){ skipped.bad_id++; continue; }
  if(PRIORITY_ONLY && !PRIORITY_IDS.has(id)) continue;
  const numeric=id.replace(/^wp-/i,'');
  if(plannedLegacy.has(id)||plannedLegacy.has(numeric)){ skipped.existing_legacy++; continue; }
  const title=clean(row.title); const titleKey=normalizeTitle(title);
  const approvedCategory=APPROVED_MANUAL_REVIEW_CATEGORIES.get(id);
  if(!titleKey){ skipped.existing_title++; continue; }
  const explicitAliasTarget=APPROVED_DUPLICATE_ALIAS_TARGETS.get(id.toLowerCase());
  if(explicitAliasTarget){
    const cat=approvedCategory?categoryRecord(approvedCategory):null;
    if(!cat) throw new Error(`approved duplicate alias ${id} has no active target category`);
    const slug=slugify(title,explicitAliasTarget);
    approvedAliasPlans.push({
      legacy_id:id,article_id:'',target_legacy_id:explicitAliasTarget,title,target_category:approvedCategory,
      category_id:cat.id,slug,canonical_url:`${SITE}/${encodeURIComponent(cat.slug)}/${encodeURIComponent(slug)}`
    });
    plannedLegacy.add(id); plannedLegacy.add(numeric);
    continue;
  }
  if(plannedTitles.has(titleKey)){
    const existingTitleRow=existingByTitle.get(titleKey);
    const plannedTitleRow=plannedCandidateByTitle.get(titleKey);
    const cat=approvedCategory?categoryRecord(approvedCategory):null;
    if(approvedCategory && (existingTitleRow?.id||plannedTitleRow?.legacy_id) && cat){
      const targetRow=existingTitleRow||plannedTitleRow;
      const slug=clean(targetRow.slug)||slugify(title,id);
      approvedAliasPlans.push({
        legacy_id:id,article_id:clean(existingTitleRow?.id),target_legacy_id:clean(plannedTitleRow?.legacy_id),title,target_category:approvedCategory,
        category_id:cat.id,slug,canonical_url:`${SITE}/${encodeURIComponent(cat.slug)}/${encodeURIComponent(slug)}`,
      });
      plannedLegacy.add(id); plannedLegacy.add(numeric);
      continue;
    }
    skipped.existing_title++; continue;
  }
  const body=Array.isArray(row.body)
    ? row.body.map(clean).filter(Boolean)
    : (clean(row.body) ? [clean(row.body)] : []);
  const content=body.join('\n\n');
  if(content.length<180){ skipped.no_body++; continue; }
  const published=publishedAt(row); if(!published){ skipped.bad_date++; continue; }
  const archiveCategory=clean(row.category);
  const disposition=approvedCategory
    ? { action:"publish", targetCategory:approvedCategory, reason:"human-reviewed-and-approved-20260901" }
    : FORCED_MANUAL_REVIEW_IDS.has(id)
      ? { action:"manual_review", targetCategory:"", reason:"current-immigration-publication-boundary" }
      : resolveLegacyDisposition({
        category:archiveCategory,title,content,overrides:CATEGORY_OVERRIDES
      });
  if(disposition.action==="manual_review"){
    skipped.manual_review_category++;
    bumpCategory(skippedByCategory.manual_review,archiveCategory);
    manualReviewRows.push({
      legacy_id:id,title,archive_category:archiveCategory,
      recommended_category:disposition.targetCategory,reason:disposition.reason,
      summary:clean(row.excerpt)||content.slice(0,180),content,published_at:published,
      source_url:clean(row.sourceUrl),cover_image:clean(row.image)
    });
    continue;
  }
  if(disposition.action==="retire"){
    skipped.retired_non_article++;
    bumpCategory(skippedByCategory.retired,archiveCategory);
    retiredRows.push({
      legacy_id:id,title,archive_category:archiveCategory,reason:disposition.reason,
      source_url:clean(row.sourceUrl)
    });
    continue;
  }
  if(disposition.action!=="publish"){
    skipped.unknown_category++;
    bumpCategory(skippedByCategory.unknown,archiveCategory);
    continue;
  }
  const categoryName=disposition.targetCategory;
  const cat=categoryRecord(categoryName);
  if(!cat){
    skipped.unknown_category++;
    bumpCategory(skippedByCategory.unknown,`${archiveCategory} -> ${categoryName}`);
    continue;
  }
  const slug=slugify(title,id);
  const candidate={
    legacy_id:id,title,slug,summary:clean(row.excerpt)||content.slice(0,180),content,
    category_id:cat.id,category_name:cat.name,
    cover_image: clean(row.image) && !String(row.image).includes('image-placeholder.svg') ? clean(row.image) : '',
    author:clean(row.author)||'Tang Ren Daily',status:'published',visibility:'public',published_at:published,
    source_url:clean(row.sourceUrl),source_name:'唐人日报历史归档',primary_section:cat.slug,
    canonical_url:`${SITE}/${encodeURIComponent(cat.slug)}/${encodeURIComponent(slug)}`,
    metadata:{
      migration_source:'github-static-archive',archive_file:row.__file,archive_id:id,
      archive_date:clean(row.date),archive_time:clean(row.time),restored_at:new Date().toISOString(),
      ...(approvedCategory?{human_category_override:approvedCategory}:{})
    }
  };
  candidates.push(candidate);
  plannedCandidateByTitle.set(titleKey,candidate);
  plannedLegacy.add(id); plannedLegacy.add(numeric); plannedTitles.add(titleKey);
}
candidates.sort((a,b)=>{
  const priority = Number(PRIORITY_IDS.has(b.legacy_id))-Number(PRIORITY_IDS.has(a.legacy_id));
  if (priority) return priority;
  const date = String(b.published_at || '').localeCompare(String(a.published_at || ''));
  if (date) return date;
  return Number(String(b.legacy_id).replace(/\D/g,'')) - Number(String(a.legacy_id).replace(/\D/g,''));
});
const selected=candidates.slice(0,LIMIT);
const candidateIds=new Set(candidates.map((row)=>clean(row.legacy_id)));
const plannedAliasIds=new Set(approvedAliasPlans.map((row)=>clean(row.legacy_id)));
const existingByApprovedId=new Map();
for (const row of existing) {
  const raw=clean(row.legacy_id);
  if(raw){
    const normalized=/^\d+$/.test(raw)?`wp-${raw}`:raw.toLowerCase();
    if(APPROVED_MANUAL_REVIEW_CATEGORIES.has(normalized)) existingByApprovedId.set(normalized,row);
  }
  const aliases=Array.isArray(row.metadata?.legacy_alias_ids)?row.metadata.legacy_alias_ids:[];
  for(const alias of aliases){
    const normalizedAlias=clean(alias).toLowerCase();
    if(APPROVED_MANUAL_REVIEW_CATEGORIES.has(normalizedAlias)) existingByApprovedId.set(normalizedAlias,row);
  }
}
const approvedManualReviewUnresolved=[];
const approvedExistingWrongCategory=[];
const approvedExistingRepairPlans=new Map();
for (const [legacyId,expectedCategory] of APPROVED_MANUAL_REVIEW_CATEGORIES) {
  const current=existingByApprovedId.get(legacyId);
  if(current && approvedCategoryName(current.category_name)!==expectedCategory) {
    approvedExistingWrongCategory.push({legacy_id:legacyId,expected_category:expectedCategory,current_category:clean(current.category_name)});
  }
  if(current){
    const prior=approvedExistingRepairPlans.get(current.id);
    if(prior && prior.expected_category!==expectedCategory) {
      throw new Error(`approved aliases disagree on category for article ${current.id}`);
    }
    approvedExistingRepairPlans.set(current.id,{article:current,expected_category:expectedCategory});
  }
  if(!current && !candidateIds.has(legacyId) && !plannedAliasIds.has(legacyId)) approvedManualReviewUnresolved.push(legacyId);
}
let inserted=[];
let aliasUpdated=[];
let approvedExistingRepaired=[];
const insertTitleConflicts=[];
const insertContentConflicts=[];
if(APPLY && selected.length){
  const insertedBatches = await mapLimit(batch(selected,25), CONCURRENCY, async (part) => {
    try {
      const rows=await rest('articles',{}, {method:'POST',headers:{Prefer:'return=representation'},body:part});
      return rows.map((r)=>({id:r.id,legacy_id:r.legacy_id,title:r.title,slug:r.slug,canonical_url:r.canonical_url}));
    } catch (error) {
      if (!skippableInsertConflict(error)) throw error;
      const recovered=[];
      for (const item of part) {
        try {
          const rows=await rest('articles',{}, {method:'POST',headers:{Prefer:'return=representation'},body:[item]});
          recovered.push(...rows.map((r)=>({id:r.id,legacy_id:r.legacy_id,title:r.title,slug:r.slug,canonical_url:r.canonical_url})));
        } catch (itemError) {
          const kind=skippableInsertConflict(itemError);
          if (!kind) throw itemError;
          const conflict={legacy_id:item.legacy_id,title:item.title,category_name:item.category_name};
          if (kind === 'duplicate_title') insertTitleConflicts.push(conflict);
          else insertContentConflicts.push(conflict);
        }
      }
      return recovered;
    }
  });
  inserted = insertedBatches.flat();
}
if(APPLY && approvedExistingRepairPlans.size){
  approvedExistingRepaired=await mapLimit([...approvedExistingRepairPlans.values()],CONCURRENCY,async(plan)=>{
    const current=plan.article;
    const cat=categoryRecord(plan.expected_category);
    if(!cat) throw new Error(`active category not found for approved repair ${plan.expected_category}`);
    const slug=clean(current.slug)||slugify(current.title,current.legacy_id);
    const currentMetadata=current.metadata&&typeof current.metadata==='object'&&!Array.isArray(current.metadata)
      ? current.metadata:{};
    const canonicalUrl=`${SITE}/${encodeURIComponent(cat.slug)}/${encodeURIComponent(slug)}`;
    const rows=await rest('articles',{id:`eq.${current.id}`},{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{
        category_id:cat.id,category_name:cat.name,primary_section:cat.slug,
        topic_key:plan.expected_category==='ICE执法动态'?'ice':null,
        slug,canonical_url:canonicalUrl,status:'published',visibility:'public',
        metadata:{...currentMetadata,human_category_override:plan.expected_category,human_category_override_updated_at:new Date().toISOString()}
      }
    });
    if(!Array.isArray(rows)||rows.length!==1) throw new Error(`unable to repair approved article ${current.legacy_id}`);
    return {legacy_id:clean(current.legacy_id),article_id:current.id,category_name:rows[0].category_name,canonical_url:rows[0].canonical_url};
  });
}
if(APPLY && approvedAliasPlans.length){
  aliasUpdated=await mapLimit(approvedAliasPlans,CONCURRENCY,async(item)=>{
    let articleId=clean(item.article_id);
    if(!articleId && item.target_legacy_id){
      const insertedTarget=inserted.find((row)=>clean(row.legacy_id)===item.target_legacy_id);
      articleId=clean(insertedTarget?.id);
      if(!articleId){
        const targetRows=await rest('articles',{select:'id',legacy_id:`eq.${item.target_legacy_id}`,limit:'1'});
        articleId=clean(targetRows?.[0]?.id);
      }
    }
    if(!articleId) throw new Error(`unable to resolve alias target for ${item.legacy_id}`);
    const currentRows=await rest('articles',{select:'metadata',id:`eq.${articleId}`,limit:'1'});
    const currentMetadata=currentRows?.[0]?.metadata&&typeof currentRows[0].metadata==='object'&&!Array.isArray(currentRows[0].metadata)
      ? currentRows[0].metadata:{};
    const aliases=[...new Set([...(Array.isArray(currentMetadata.legacy_alias_ids)?currentMetadata.legacy_alias_ids:[]),item.legacy_id])];
    const rows=await rest('articles',{id:`eq.${articleId}`},{
      method:'PATCH',headers:{Prefer:'return=representation'},body:{
        category_id:item.category_id,category_name:item.target_category,
        primary_section:categoryRecord(item.target_category)?.slug||'',
        topic_key:item.target_category==='ICE执法动态'?'ice':null,slug:item.slug,
        canonical_url:item.canonical_url,status:'published',visibility:'public',
        metadata:{...currentMetadata,legacy_alias_ids:aliases,legacy_alias_updated_at:new Date().toISOString(),human_category_override:item.target_category,human_category_override_updated_at:new Date().toISOString()}
      }
    });
    if(!Array.isArray(rows)||rows.length!==1) throw new Error(`unable to update approved alias ${item.legacy_id}`);
    return {legacy_id:item.legacy_id,article_id:articleId,canonical_url:item.canonical_url};
  });
}
skipped.insert_conflict_title=insertTitleConflicts.length;
skipped.insert_conflict_content=insertContentConflicts.length;
const report={
  generated_at:new Date().toISOString(),mode:APPLY?'apply':'report',archive_files:files.length,archive_records:archiveRows.length,
  current_articles:existing.length,recoverable_missing:candidates.length,selected:selected.length,inserted:inserted.length,
  limit:LIMIT,concurrency:CONCURRENCY,batches:Math.ceil(selected.length/25),skipped,skipped_by_category:skippedByCategory,
  manual_review_count:manualReviewRows.length,retired_non_article_count:retiredRows.length,
  priority_ids:[...PRIORITY_IDS],priority_only:PRIORITY_ONLY,category_overrides:Object.fromEntries(CATEGORY_OVERRIDES),
  approved_manual_review_count:APPROVED_MANUAL_REVIEW_CATEGORIES.size,
  approved_manual_review_existing:existingByApprovedId.size,
  approved_manual_review_candidates:candidates.filter((row)=>APPROVED_MANUAL_REVIEW_CATEGORIES.has(clean(row.legacy_id))).length,
  approved_manual_review_alias_plans:approvedAliasPlans.length,
  approved_manual_review_alias_updated:aliasUpdated.length,
  approved_existing_category_repair_plans:approvedExistingRepairPlans.size,
  approved_existing_category_repaired:approvedExistingRepaired.length,
  approved_duplicate_alias_targets:Object.fromEntries(APPROVED_DUPLICATE_ALIAS_TARGETS),
  approved_manual_review_unresolved:approvedManualReviewUnresolved,
  approved_existing_wrong_category:approvedExistingWrongCategory,
  forced_manual_review_ids:[...FORCED_MANUAL_REVIEW_IDS],
  priority_selected:selected.filter((r)=>PRIORITY_IDS.has(r.legacy_id)).map((r)=>r.legacy_id),
  insert_title_conflicts:insertTitleConflicts.slice(0,50),
  insert_content_conflicts:insertContentConflicts.slice(0,50),
  sample_missing:selected.slice(0,20).map((r)=>({legacy_id:r.legacy_id,title:r.title,category_name:r.category_name,canonical_url:r.canonical_url})),
  inserted_rows:inserted
};
function tsv(value='') {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}
function oldUrlsForLegacyId(value='') {
  const legacyId=clean(value);
  const numeric=legacyId.replace(/^wp-/i,'');
  if(!/^\d+$/.test(numeric)) return [];
  return [
    `${SITE}/article.html?id=${encodeURIComponent(legacyId)}`,
    `${SITE}/article.html?id=${encodeURIComponent(numeric)}`,
    `${SITE}/?p=${encodeURIComponent(numeric)}`
  ];
}
const reportLines=[
  '旧站链接盘点与301处理建议',
  `生成时间\t${report.generated_at}`,
  '说明\t本报告用于人工核对。只有“建议301”且目标地址正确的记录才应建立跳转；不要把所有404跳转到首页。',
  '',
  '处理建议\t旧网址\t建议目标网址\t文章标题\t备注'
];
const seenReportRows=new Set();
function addReportRow(action, oldUrl, targetUrl, title, note) {
  const key=`${oldUrl}\t${targetUrl}`;
  if(!oldUrl || seenReportRows.has(key)) return;
  seenReportRows.add(key);
  reportLines.push([action,oldUrl,targetUrl,title,note].map(tsv).join('\t'));
}
for (const row of existing) {
  const target=clean(row.canonical_url);
  if(!target) continue;
  for (const oldUrl of oldUrlsForLegacyId(row.legacy_id)) {
    addReportRow('建议301',oldUrl,target,row.title,'正式库已有对应文章，请核对标题和目标地址后执行');
  }
}
for (const row of candidates) {
  for (const oldUrl of oldUrlsForLegacyId(row.legacy_id)) {
    addReportRow('待人工处理',oldUrl,'',row.title,'正式库尚无对应文章，不能直接301；请决定恢复、匹配其他文章或保留404/410');
  }
}
for (const row of manualReviewRows) {
  for (const oldUrl of oldUrlsForLegacyId(row.legacy_id)) {
    addReportRow('待人工审核',oldUrl,'',row.title,`分类需人工判断：${row.reason || '未说明'}`);
  }
}
for (const row of retiredRows) {
  for (const oldUrl of oldUrlsForLegacyId(row.legacy_id)) {
    addReportRow('建议保留404/410',oldUrl,'',row.title,`非文章或已退役内容：${row.reason || '未说明'}`);
  }
}
await mkdir(path.join(ROOT,'reports'),{recursive:true});
await writeFile(path.join(ROOT,'reports','legacy-404-latest.txt'),'\uFEFF'+reportLines.join('\n')+'\n');
await writeFile(path.join(ROOT,'reports','legacy-migration-latest.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(path.join(ROOT,'reports','legacy-manual-review-latest.json'),JSON.stringify({
  generated_at:report.generated_at,count:manualReviewRows.length,rows:manualReviewRows
},null,2)+'\n');
await writeFile(path.join(ROOT,'reports','legacy-retired-non-article-latest.json'),JSON.stringify({
  generated_at:report.generated_at,count:retiredRows.length,rows:retiredRows
},null,2)+'\n');
const aliasChangedUrls=aliasUpdated.flatMap((row)=>[
  row.canonical_url,
  ...oldUrlsForLegacyId(row.legacy_id)
]);
const repairedChangedUrls=approvedExistingRepaired.flatMap(legacyChangedUrls);
const indexNowUrls=[...new Set([...inserted.flatMap(legacyChangedUrls),...aliasChangedUrls,...repairedChangedUrls].filter(Boolean))];
await writeFile(path.join(ROOT,'reports','legacy-indexnow-urls.txt'),indexNowUrls.join('\n')+(indexNowUrls.length?'\n':''));
if (process.env.GITHUB_OUTPUT) await appendFile(
  process.env.GITHUB_OUTPUT,
  `restored_count=${inserted.length+aliasUpdated.length+approvedExistingRepaired.length}\n`
);
console.log(JSON.stringify(report,null,2));

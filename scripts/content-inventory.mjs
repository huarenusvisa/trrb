import { createHash } from 'node:crypto';
import { articleIndexability } from '../netlify/shared/article-indexability.mjs';
import { publicationUrl, publicEvidence } from '../netlify/shared/publication.mjs';
import { readWithRetry } from './paged-read.mjs';

export async function readInventory(rest, pageSize = 200) {
  const rows = []; let cursor = '';
  for (;;) {
    const page = await readWithRetry(() => rest('articles', {select:'id,title,slug,summary,content,category_id,category_name,topic_key,status,visibility,hidden_at,archived_at,published_at,created_at,source_url,canonical_url,metadata,publication_path,publication_revision,publication_updated_at',order:'id.asc',limit:String(pageSize),...(cursor ? {id:`gt.${cursor}`} : {})}));
    if (!Array.isArray(page) || page.length > pageSize) throw new Error('Invalid inventory page');
    for (const row of page) { if (!row.id || row.id <= cursor) throw new Error('Non-advancing inventory cursor'); cursor = row.id; rows.push(row); }
    if (rows.length > 200000) throw new Error('Inventory safety limit reached; refusing partial report');
    if (page.length < pageSize) return rows;
  }
}
const digest = value => createHash('sha256').update(value).digest('hex');
export function buildInventory(articles, {now = new Date(), search = {}, retired = []} = {}) {
  const inspections = new Map((search.google?.urlInspection || []).map(x => [x.url, x]));
  const pages = new Map((search.google?.performance28d?.breakdowns?.page?.current?.rows || []).map(x => [x.page, x]));
  const groups = new Map();
  const items = articles.map(a => {
    const policy = articleIndexability(a);
    let url = publicationUrl(a);
    if (a.metadata?.knowledge_migration_batch && /^https:\/\/trrb\.net\/immigrate\//.test(a.canonical_url || '')) url = a.canonical_url;
    const publicNow = a.status === 'published' && a.visibility === 'public' && !a.hidden_at && !a.archived_at && Date.parse(a.published_at || a.created_at) <= now.getTime();
    const fingerprint = policy.body ? digest(policy.body.normalize('NFKC').replace(/\s+/g,' ').trim()) : null;
    const ice = a.topic_key === 'ice' || ['ICE执法动态','ICE执法'].includes(a.category_name);
    const issues = [];
    if (publicNow && !url) issues.push('missing-publication-path');
    if (publicNow && !a.publication_revision) issues.push('missing-publication-snapshot');
    if (publicNow) issues.push(...policy.reasons);
    const sources = publicEvidence(a);
    if (publicNow && !sources.length) issues.push('missing-external-source');
    const inspection = inspections.get(url), performance = pages.get(url);
    const row = {id:a.id,title:a.title,url,category:a.category_name,topic:a.topic_key,publishedAt:a.published_at,
      cohort:`${ice ? 'ice' : 'other'}:${String(a.published_at || a.created_at).slice(0,7)}`,pilot:ice,
      state:!publicNow ? 'not-public' : policy.indexable ? 'eligible-for-indexing' : 'needs-content',
      revision:a.publication_revision,sourceCount:sources.length,issues,
      google:{inspection:inspection || null,status:inspection && !inspection.error ? 'inspection-returned' : 'unknown',performance:performance || null},
      bing:{status:'unknown',reason:'site-level report does not establish per-URL indexing'},
      duplicateCandidateOf:null};
    if (publicNow && fingerprint) {const g=groups.get(fingerprint)||[];g.push(row);groups.set(fingerprint,g);}
    return row;
  });
  // A candidate is a review task, never an automatic redirect or deletion.
  for (const group of groups.values()) if (group.length > 1) {
    group.sort((a,b)=>String(a.publishedAt).localeCompare(String(b.publishedAt)) || a.id.localeCompare(b.id));
    for (const row of group.slice(1)) {row.duplicateCandidateOf=group[0].id;row.issues.push('exact-body-duplicate-review');}
  }
  const cohorts = {};
  for (const row of items) {const c=cohorts[row.cohort] ||= {total:0,public:0,sourceGaps:0,duplicateCandidates:0,googleObservedPages:0,observedClicks:0,observedImpressions:0};c.total++;c.public+=row.state!=='not-public';c.sourceGaps+=row.issues.includes('missing-external-source');c.duplicateCandidates+=!!row.duplicateCandidateOf;if(row.google.performance){c.googleObservedPages++;c.observedClicks+=row.google.performance.clicks;c.observedImpressions+=row.google.performance.impressions;}}
  return {summary:{generatedAt:now.toISOString(),total:items.length,public:items.filter(x=>x.state!=='not-public').length,
    missingSnapshots:items.filter(x=>x.issues.includes('missing-publication-snapshot')).length,
    duplicateCandidates:items.filter(x=>x.duplicateCandidateOf).length,sourceGaps:items.filter(x=>x.issues.includes('missing-external-source')).length,
    pilot:'ICE',cohorts,retiredUrls:retired.length,retiredPolicy:'keep existing 404/410; no WordPress recovery',
    googleWindows:search.google?.performance28d?.windows || null,googleAvailability:search.google?.performance28d?.status || 'unavailable',
    bingAvailability:search.bing?.configured ? 'site-level-only' : 'unavailable',
    notes:['Full database inventory via cursor; concurrent publishing can change totals between runs.','Search Analytics returns observed top rows; absence means unknown, not zero or unindexed.','Identical body is a review candidate; related events and matching titles alone are not merged.','Source gaps need editorial evidence; no invented sources or automatic mass noindex.']},items};
}
export async function saveInventory(search, {rest, persist, retired=[]}) {
  const result = buildInventory(await readInventory(rest),{search,retired});
  await persist({commit_sha:process.env.GITHUB_SHA || null,...result});
  if (result.summary.missingSnapshots) throw new Error(`Published snapshot gaps: ${result.summary.missingSnapshots}`);
  return result.summary;
}

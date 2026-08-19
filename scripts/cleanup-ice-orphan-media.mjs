import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_DELETE = Number(process.env.MAX_DELETE || '100');
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || 'ice-report-private';
const PUBLIC_BUCKET = process.env.ICE_REPORT_PUBLIC_BUCKET || 'ice-report-public';

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
if (!Number.isFinite(MAX_DELETE) || MAX_DELETE < 1) throw new Error('MAX_DELETE must be a positive number');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

function text(value) { return String(value ?? '').trim(); }
function publicPathFromUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const marker = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;
    const at = url.pathname.indexOf(marker);
    return at < 0 ? '' : decodeURIComponent(url.pathname.slice(at + marker.length));
  } catch { return ''; }
}

async function allRows(table, select, filters = (query) => query) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = filters(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function listFiles(bucket, prefix = '') {
  const files = [];
  const folders = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error) throw error;
    const entries = data || [];
    for (const entry of entries) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id || entry.metadata) files.push(full);
      else folders.push(full);
    }
    if (entries.length < 1000) break;
  }
  for (const folder of folders) files.push(...await listFiles(bucket, folder));
  return files;
}

async function removeFiles(bucket, paths) {
  if (!paths.length || DRY_RUN) return 0;
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(bucket).remove(batch);
    if (error) throw error;
    removed += Array.isArray(data) ? data.length : batch.length;
  }
  return removed;
}

const [reports, articles] = await Promise.all([
  allRows('ice_user_reports', 'id,media,cover_image,article_id,status'),
  allRows('articles', 'id,metadata,cover_image,source_platform,source_post_id,status', (q) => q.eq('source_platform', 'user_report'))
]);

const privateRefs = new Set();
const publicRefs = new Set();
for (const report of reports) {
  for (const item of Array.isArray(report?.media) ? report.media : []) {
    const path = text(item?.path);
    if (path) privateRefs.add(path);
  }
  const cover = publicPathFromUrl(report?.cover_image);
  if (cover) publicRefs.add(cover);
}
for (const article of articles) {
  const published = Array.isArray(article?.metadata?.published_media) ? article.metadata.published_media : [];
  for (const item of published) {
    const sourcePath = text(item?.source_path);
    const publishedPath = text(item?.path);
    if (sourcePath) privateRefs.add(sourcePath);
    if (publishedPath) publicRefs.add(publishedPath);
    const fromUrl = publicPathFromUrl(item?.url);
    if (fromUrl) publicRefs.add(fromUrl);
  }
  const cover = publicPathFromUrl(article?.cover_image);
  if (cover) publicRefs.add(cover);
}

const [privateFiles, publicFiles] = await Promise.all([
  listFiles(PRIVATE_BUCKET),
  listFiles(PUBLIC_BUCKET)
]);
const privateOrphans = privateFiles.filter((path) => !privateRefs.has(path));
const publicOrphans = publicFiles.filter((path) => !publicRefs.has(path));
const totalOrphans = privateOrphans.length + publicOrphans.length;

console.log(JSON.stringify({
  reports: reports.length,
  userReportArticles: articles.length,
  privateFiles: privateFiles.length,
  privateRefs: privateRefs.size,
  privateOrphans: privateOrphans.length,
  publicFiles: publicFiles.length,
  publicRefs: publicRefs.size,
  publicOrphans: publicOrphans.length,
  dryRun: DRY_RUN
}));

if (totalOrphans > MAX_DELETE) {
  throw new Error(`Refusing to delete ${totalOrphans} orphan files; safety limit is ${MAX_DELETE}`);
}

const publicRemoved = await removeFiles(PUBLIC_BUCKET, publicOrphans);
const privateRemoved = await removeFiles(PRIVATE_BUCKET, privateOrphans);
console.log(`ICE ORPHAN CLEANUP: public=${publicRemoved}/${publicOrphans.length}; private=${privateRemoved}/${privateOrphans.length}; dryRun=${DRY_RUN}`);

if (!DRY_RUN) {
  const [remainingPrivate, remainingPublic] = await Promise.all([
    listFiles(PRIVATE_BUCKET),
    listFiles(PUBLIC_BUCKET)
  ]);
  const remainingPrivateOrphans = remainingPrivate.filter((path) => !privateRefs.has(path));
  const remainingPublicOrphans = remainingPublic.filter((path) => !publicRefs.has(path));
  if (remainingPrivateOrphans.length || remainingPublicOrphans.length) {
    throw new Error(`Orphan cleanup incomplete: private=${remainingPrivateOrphans.length}, public=${remainingPublicOrphans.length}`);
  }
}

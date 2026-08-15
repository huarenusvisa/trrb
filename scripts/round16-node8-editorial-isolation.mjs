import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://trrb.net';
const queuePath = 'data/news-pipeline/legal-high-impact-queue.json';
const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
const checks = [];
let failures = 0;
function check(ok, label, detail = '') {
  checks.push({ ok: Boolean(ok), label, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}
function canonicalOfficialUrl(value) {
  try {
    const u = new URL(value);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch { return String(value || '').trim(); }
}
function routeKey(candidate) {
  return `legal:${candidate.sourceSystem}:${candidate.sourceRecordId}`;
}

const candidates = Array.isArray(queue.candidates) ? queue.candidates : [];
const ids = candidates.map(x => String(x.sourceRecordId || ''));
const routeKeys = candidates.map(routeKey);
const officialUrls = candidates.map(x => canonicalOfficialUrl(x.officialUrl));

check(candidates.length > 0, 'high-impact legal editorial queue is non-empty', `candidates=${candidates.length}`);
check(ids.every(Boolean) && new Set(ids).size === ids.length, 'candidate source record IDs are unique');
check(new Set(routeKeys).size === routeKeys.length, 'editorial route keys are deterministic and duplicate-free');
check(officialUrls.every(Boolean), 'every candidate retains an official source URL');
check(new Set(officialUrls).size === officialUrls.length, 'candidate official-source routes are deduplicated');
check(candidates.every(x => x.pipelineStage === 'editorial_candidate'), 'all routed legal items remain editorial candidates');
check(candidates.every(x => x.publicationPolicy === 'candidate_only_not_auto_published'), 'candidate queue cannot auto-publish as Tang Ren Daily news');
check(candidates.every(x => !('publishedPath' in x) && !('articleId' in x) && !('slug' in x) && !('publishedAt' in x)), 'editorial candidates contain no published-news routing fields');

const ignoredDirs = new Set(['.git', 'node_modules']);
const textExt = /\.(?:mjs|js|cjs|yml|yaml|json|md|html|ts)$/i;
const references = [];
function walk(dir = '.') {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = join(dir, name);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    if (!textExt.test(name)) continue;
    const rel = relative('.', full).replaceAll('\\', '/');
    if (rel === queuePath) continue;
    let text = ''; try { text = readFileSync(full, 'utf8'); } catch { continue; }
    if (text.includes(queuePath)) references.push(rel);
  }
}
walk('.');
const allowedReference = p => [
  'scripts/round15-node9-major-legal-news-pipeline.mjs',
  '.github/workflows/round15-node9-major-legal-news-pipeline.yml',
  'scripts/round16-node8-editorial-isolation.mjs',
  '.github/workflows/round16-node8-editorial-isolation.yml'
].includes(p);
const unexpectedRefs = references.filter(p => !allowedReference(p));
check(unexpectedRefs.length === 0, 'candidate queue has no automatic publisher/news-renderer consumers', unexpectedRefs.join(', '));

let productionQueue = null;
try {
  const res = await fetch(`${SITE_ORIGIN}/${queuePath}?round16node8=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
  check(res.ok, 'production editorial queue is reachable', `HTTP ${res.status}`);
  if (res.ok) productionQueue = await res.json();
} catch (error) {
  check(false, 'production editorial queue is reachable', error.message);
}
if (productionQueue) {
  const localHash = createHash('sha256').update(JSON.stringify(queue)).digest('hex');
  const prodHash = createHash('sha256').update(JSON.stringify(productionQueue)).digest('hex');
  check(localHash === prodHash, 'production queue matches repository queue', `local=${localHash.slice(0,12)} prod=${prodHash.slice(0,12)}`);
  const pc = Array.isArray(productionQueue.candidates) ? productionQueue.candidates : [];
  check(pc.every(x => x.pipelineStage === 'editorial_candidate' && x.publicationPolicy === 'candidate_only_not_auto_published'), 'production keeps editorial isolation policy');
  check(new Set(pc.map(routeKey)).size === pc.length, 'production candidate routing remains duplicate-free');
}

const registry = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceDatasetVersion: queue.sourceDatasetVersion || null,
  policy: 'Legal authorities remain in the legal database. High-impact matches enter an editorial candidate queue only; a separate editorial act is required before any ordinary news route can exist.',
  routes: candidates.map(x => ({
    editorialKey: routeKey(x),
    sourceRecordId: x.sourceRecordId,
    sourceSystem: x.sourceSystem,
    officialUrl: canonicalOfficialUrl(x.officialUrl),
    state: 'editorial_candidate',
    autoPublishAllowed: false
  }))
};
writeFileSync('round16-node8-editorial-isolation.json', JSON.stringify({ generatedAt: new Date().toISOString(), checks, failures, references, registry }, null, 2) + '\n');
console.log(`ROUND16 NODE8 audit: checks=${checks.length}; failures=${failures}; candidates=${candidates.length}`);
if (failures === 0) console.log('ROUND16 NODE8 PASS: major legal decision/rule news routing is deduplicated and editorially isolated');
else { console.log('ROUND16 NODE8 FAIL: routing/editorial isolation gaps remain'); process.exitCode = 1; }

import iceClassifier from '../netlify/functions/_shared/ice-enforcement.js';

const { isIceEnforcementText } = iceClassifier;
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const APPLY = String(process.env.APPLY_CHANGES || 'false').toLowerCase() === 'true'
  && String(process.env.APPLY_CONFIRMATION || '') === 'CLEAR_STALE_ICE_TOPIC';

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase credentials');

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: options.method === 'PATCH' ? 'return=minimal' : 'count=exact',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  return response;
}

async function fetchIceTopics() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const response = await request(
      'articles?select=id,title,summary,category_name,topic_key&status=eq.published&topic_key=eq.ice&order=published_at.desc.nullslast',
      { headers: { Range: `${from}-${from + pageSize - 1}` } }
    );
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function clearChunk(ids) {
  const cleanIds = ids.map((id) => String(id).trim());
  if (cleanIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))) {
    throw new Error('Refusing to patch an invalid article UUID');
  }
  await request(`articles?id=in.(${cleanIds.join(',')})`, {
    method: 'PATCH',
    body: JSON.stringify({ topic_key: null })
  });
}

const rows = await fetchIceTopics();
const stale = rows.filter((row) => !isIceEnforcementText(row.title, row.summary));
console.log(JSON.stringify({ scanned: rows.length, stale: stale.length, apply: APPLY }));
for (const row of stale) {
  console.log(JSON.stringify({ id: row.id, title: row.title, category: row.category_name, action: APPLY ? 'clear' : 'audit' }));
}
if (APPLY) {
  for (let index = 0; index < stale.length; index += 75) {
    await clearChunk(stale.slice(index, index + 75).map((row) => row.id));
  }
}
let verifiedCleared = 0;
if (APPLY) {
  const remaining = await fetchIceTopics();
  const remainingIds = new Set(remaining.map((row) => String(row.id)));
  const failed = stale.filter((row) => remainingIds.has(String(row.id)));
  if (failed.length) {
    throw new Error(`ICE topic cleanup verification failed: ${failed.length}/${stale.length} rows still carry topic_key=ice`);
  }
  verifiedCleared = stale.length;
}
console.log(JSON.stringify({ cleared: verifiedCleared, verified: APPLY }));

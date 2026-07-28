import { spawn } from 'node:child_process';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const WINDOW_HOURS = Math.max(24, Number(process.env.KNOWLEDGE_HEALTH_WINDOW_HOURS || 30));
const EXPECTED = Math.max(1, Number(process.env.KNOWLEDGE_ARTICLES_PER_CATEGORY || 10));
const categories = {
  study: '移民美国·赴美留学·',
  work: '移民美国·赴美工作·',
  employment: '移民美国·职业移民·',
  family: '移民美国·家庭移民·',
  humanitarian: '移民美国·人道主义庇护·',
  'change-status': '移民美国·境内身份转换·',
  citizenship: '移民美国·入籍美国公民·'
};

if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase environment');

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json'
};

async function countRecent(prefix) {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600000).toISOString();
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('published_at', `gte.${cutoff}`);
  url.searchParams.set('category_name', `like.${prefix}*`);
  url.searchParams.set('limit', '1000');
  const response = await fetch(url, { headers: { ...headers, Prefer: 'count=exact' } });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (Number.isFinite(total)) return total;
  const rows = await response.json();
  return Array.isArray(rows) ? rows.length : 0;
}

function runGenerator(category, count) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/immigration-knowledge-daily.mjs', category], {
      stdio: 'inherit',
      env: { ...process.env, KNOWLEDGE_ARTICLES_PER_CATEGORY: String(count) }
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${category} generator exited ${code}`)));
  });
}

const before = {};
const repaired = {};
for (const [category, prefix] of Object.entries(categories)) {
  const count = await countRecent(prefix);
  before[category] = count;
  const missing = Math.max(0, EXPECTED - count);
  if (!missing) continue;
  console.warn(`[knowledge-health] ${category} only ${count}/${EXPECTED}; backfilling ${missing}`);
  await runGenerator(category, missing);
  repaired[category] = missing;
}

const after = {};
for (const [category, prefix] of Object.entries(categories)) after[category] = await countRecent(prefix);
const stillMissing = Object.entries(after).filter(([, count]) => count < EXPECTED);
console.log(JSON.stringify({ window_hours: WINDOW_HOURS, expected_per_category: EXPECTED, before, repaired, after }, null, 2));
if (stillMissing.length) throw new Error(`Knowledge categories still below target: ${stillMissing.map(([k,v]) => `${k}=${v}/${EXPECTED}`).join(', ')}`);

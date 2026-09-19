import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CATALOG = 'https://www.uscis.gov/tools/reports-and-studies/immigration-and-citizenship-data?query=asylum&items_per_page=100';
const SNAPSHOT = path.resolve('data/uscis-asylum-snapshot.json');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UA = 'AsylumJudge-USCIS-Data/1.0 (+https://asylumjudge.com/uscis-asylum-data/)';

function decodeHtml(value) {
  return String(value || '').replaceAll('&amp;', '&').replaceAll('&#x2F;', '/').replaceAll('&#47;', '/');
}

async function fetchOk(url, accept = '*/*') {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

function discoverLatestWorkbook(html) {
  const candidates = [...html.matchAll(/href=["']([^"']*asylumfiscalyear(\d{4})todatestats_([^"']+)\.xlsx)["']/gi)]
    .map((match) => {
      const url = new URL(decodeHtml(match[1]), 'https://www.uscis.gov').toString();
      const fiscalYear = Number(match[2]);
      const stamp = (match[3].match(/\d{6,8}/) || ['0'])[0];
      return { url, fiscalYear, stamp };
    })
    .filter((item) => item.url.startsWith('https://www.uscis.gov/sites/default/files/document/'))
    .sort((a, b) => b.fiscalYear - a.fiscalYear || b.stamp.localeCompare(a.stamp));
  if (!candidates.length) throw new Error('No official USCIS asylum fiscal-year workbook found');
  return candidates[0];
}

async function parseWorkbook(workbook, release) {
  const output = path.join(path.dirname(workbook), 'snapshot.json');
  const title = `USCIS Asylum Division Quarterly Statistics, FY ${release.fiscalYear}`;
  await execFileAsync('python3', [
    'scripts/uscis-asylum-xlsx.py', workbook,
    '--fiscal-year', String(release.fiscalYear),
    '--source-url', release.url,
    '--source-title', title,
    '--output', output
  ], { timeout: 120000 });
  return JSON.parse(await fs.readFile(output, 'utf8'));
}

async function sb(endpoint, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function upsertChunks(table, rows, conflict) {
  for (let index = 0; index < rows.length; index += 200) {
    await sb(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: 'POST',
      body: JSON.stringify(rows.slice(index, index + 200)),
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }
    });
  }
}

async function publish(snapshot, fingerprint) {
  const source = snapshot.source;
  const releaseRows = await sb('uscis_asylum_data_releases?on_conflict=source_url', {
    method: 'POST',
    body: JSON.stringify({
      source_url: source.url,
      source_title: source.title,
      fiscal_year: source.fiscal_year,
      period_end: source.period_end,
      source_fingerprint: fingerprint,
      official: true,
      status: 'published',
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { agency: source.agency, methodology: snapshot.methodology }
    })
  });
  const releaseId = releaseRows?.[0]?.id;
  if (!releaseId) throw new Error('USCIS release upsert did not return an id');
  const common = { release_id: releaseId, source_url: source.url, updated_at: new Date().toISOString() };
  await upsertChunks('uscis_asylum_office_monthly', snapshot.offices.map((row) => ({ ...common, ...row, grant_rate: undefined })), 'source_url,office,period');
  await upsertChunks('uscis_asylum_nationality_monthly', snapshot.nationalities.map((row) => ({ ...common, ...row })), 'source_url,nationality,period');
}

if (process.argv.includes('--self-test')) {
  const sample = '<a href="/sites/default/files/document/data/asylumfiscalyear2025todatestats_241231.xlsx">FY25</a><a href="/sites/default/files/document/data/asylumfiscalyear2023todatestats_230930.xlsx">FY23</a>';
  const selected = discoverLatestWorkbook(sample);
  if (selected.fiscalYear !== 2025 || !selected.url.endsWith('asylumfiscalyear2025todatestats_241231.xlsx')) throw new Error('catalog discovery self-test failed');
  console.log('PASS USCIS asylum data catalog discovery');
  process.exit(0);
}

const catalogResponse = await fetchOk(CATALOG, 'text/html');
const release = discoverLatestWorkbook(await catalogResponse.text());
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'uscis-asylum-'));
try {
  const workbook = path.join(tmp, 'asylum.xlsx');
  const bytes = Buffer.from(await (await fetchOk(release.url, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).arrayBuffer());
  await fs.writeFile(workbook, bytes);
  const snapshot = await parseWorkbook(workbook, release);
  const fingerprint = crypto.createHash('sha256').update(bytes).digest('hex');
  snapshot.source.fingerprint = fingerprint;
  await fs.writeFile(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  if (SUPABASE_URL && SUPABASE_KEY && !process.argv.includes('--snapshot-only')) await publish(snapshot, fingerprint);
  console.log(JSON.stringify({ source: release.url, fiscal_year: release.fiscalYear, offices: snapshot.offices.length, nationalities: snapshot.nationalities.length, database_written: Boolean(SUPABASE_URL && SUPABASE_KEY && !process.argv.includes('--snapshot-only')) }, null, 2));
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

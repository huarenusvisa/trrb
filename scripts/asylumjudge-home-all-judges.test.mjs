import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharedPath = require.resolve('../netlify/functions/_shared/supabase-admin.js');
const apiPath = require.resolve('../netlify/functions/immigration-judges.js');

const rows = Array.from({ length: 1150 }, (_, index) => ({
  id: `judge-${String(index).padStart(4, '0')}`,
  judge_name: `Judge ${String(index).padStart(4, '0')}`,
  court_name: `Court ${index % 74}`,
  court_city: `City ${index % 74}`,
  court_state: index % 2 ? 'CA' : 'NY',
  total_asylum_decisions: 100,
  grants: 40,
  denials: 50,
  other_decisions: 10,
  data_start_date: '2019-01-01',
  data_end_date: '2024-12-31'
}));

const offsets = [];
async function fakeRest(table, { query = {} } = {}) {
  if (table === 'immigration_judge_source_releases' || table === 'immigration_judge_import_batches') return [];
  assert.equal(table, 'immigration_judges');
  const offset = Number(query.offset || 0);
  const limit = Number(query.limit || 1000);
  offsets.push(offset);
  return rows.slice(offset, offset + limit);
}

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { rest: fakeRest }
};
delete require.cache[apiPath];

const { handler } = require(apiPath);
const response = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'all' } });
const body = JSON.parse(response.body);

assert.equal(response.statusCode, 200);
assert.equal(body.count, 1150, 'homepage API must return every judge in the current database batch');
assert.equal(body.results.length, 1150);
assert.deepEqual(offsets, [0, 1000], 'all-judge endpoint must cross the Supabase 1,000-row response cap');
assert.equal(body.results[0].adjudicated_approval_rate, 40 / 90 * 100);

const standalone = readFileSync('asylumjudge/index.html', 'utf8');
const trrb = readFileSync('asylumjudge/trrb.html', 'utf8');
const client = readFileSync('asylumjudge/site.js', 'utf8');
const styles = readFileSync('asylumjudge/site.css', 'utf8');

for (const html of [standalone, trrb]) {
  assert.match(html, /id="all-judges"/, 'both homepage variants must expose the full judge directory');
  assert.match(html, /id="judge-directory-list"/);
  assert.doesNotMatch(html, /id="featured-judges"/, 'the old top-12-only section must be removed');
}
assert.match(client, /mode=all/, 'homepage must request the complete judge dataset');
assert.match(client, /filterJudges\(query\)/, 'homepage search must filter the complete in-memory directory');
assert.match(client, /addEventListener\('input'/, 'judge search must update directly while typing');
assert.match(client, /verdict-pass/);
assert.match(client, /verdict-deny/);
assert.match(client, /verdict-other/);
assert.match(styles, /\.directory-metric\.verdict-pass b[^}]*var\(--pass\)/);
assert.match(styles, /\.directory-metric\.verdict-deny b[^}]*var\(--deny\)/);
assert.match(styles, /\.directory-metric\.verdict-other b[^}]*var\(--other\)/);

console.log('AsylumJudge all-judge homepage contract: PASS');

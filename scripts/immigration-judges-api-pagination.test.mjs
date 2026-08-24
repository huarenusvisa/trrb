import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharedPath = require.resolve('../netlify/functions/_shared/supabase-admin.js');
const apiPath = require.resolve('../netlify/functions/immigration-judges.js');

const rows = Array.from({ length: 1150 }, (_, index) => ({
  id: `judge-${String(index).padStart(4, '0')}`,
  court_name: `Court ${index % 77}`,
  court_city: `City ${index % 77}`,
  court_state: index % 2 ? 'CA' : 'TX',
  total_asylum_decisions: 1,
  grants: index % 2,
  denials: index % 2 ? 0 : 1,
  other_decisions: 0
}));

const offsets = [];
async function fakeRest(table, { query = {} } = {}) {
  if (table === 'immigration_judge_source_releases') return [];
  if (table === 'immigration_judge_import_batches') return [];
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
const response = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'stats' } });
const body = JSON.parse(response.body);

assert.equal(response.statusCode, 200);
assert.equal(body.judges, 1150, 'stats must include rows beyond Supabase\'s 1,000-row response cap');
assert.equal(body.courts, 77);
assert.equal(body.decisions, 1150);
assert.deepEqual(offsets, [0, 1000], 'the API must request each stable page exactly once');

const workflow = require('node:fs').readFileSync('.github/workflows/immigration-judge-data-sync.yml', 'utf8');
const operations = require('node:fs').readFileSync('.github/workflows/operations-control-plane.yml', 'utf8');
assert.doesNotMatch(workflow, /^  push:/m, 'changing pipeline code must not immediately publish a new batch');
assert.doesNotMatch(workflow, /^  workflow_call:/m, 'EOIR sync must not be callable by automatic workflows');
assert.doesNotMatch(operations, /cron:\s*["']25 10 \* \* \*["']/, 'the EOIR cadence schedule must remain disabled');
assert.doesNotMatch(operations, /immigration-judge-every-72-hours:/, 'the 72-hour EOIR job must remain disabled');
assert.match(workflow, /actual != expected/, 'public verification must exactly match the batch preflight');
assert.match(workflow, /preflight\.get\('current_courts'\)/, 'court verification must use the imported current-court projection');

console.log('Immigration judge API pagination contract: PASS');

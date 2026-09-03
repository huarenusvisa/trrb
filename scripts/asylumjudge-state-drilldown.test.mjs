import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharedPath = require.resolve('../netlify/functions/_shared/supabase-admin.js');
const apiPath = require.resolve('../netlify/functions/immigration-judges.js');

const judgeRows = [
  { id: 'ca-1', judge_name: 'CA Judge 1', court_name: 'San Francisco', court_city: 'San Francisco', court_state: 'CA', total_asylum_decisions: 100, grants: 60, denials: 35, other_decisions: 5 },
  { id: 'ca-2', judge_name: 'CA Judge 2', court_name: 'Los Angeles', court_city: 'Los Angeles', court_state: 'CA', total_asylum_decisions: 80, grants: 30, denials: 45, other_decisions: 5 },
  { id: 'ca-shared', judge_name: 'CA Shared', court_name: 'Shared Court', court_city: 'Oakland', court_state: 'CA', total_asylum_decisions: 20, grants: 10, denials: 8, other_decisions: 2 },
  { id: 'ny-1', judge_name: 'NY Judge', court_name: 'New York (NYC)', court_city: 'New York', court_state: 'NY', total_asylum_decisions: 120, grants: 55, denials: 60, other_decisions: 5 },
  { id: 'ny-shared', judge_name: 'NY Shared', court_name: 'Shared Court', court_city: 'New York', court_state: 'NY', total_asylum_decisions: 40, grants: 15, denials: 20, other_decisions: 5 },
  { id: 'unknown-1', judge_name: 'Unknown Judge', court_name: 'Unknown Court', court_city: '', court_state: '', total_asylum_decisions: 10, grants: 5, denials: 5, other_decisions: 0 }
];

async function fakeRest(table, { query = {} } = {}) {
  if (table === 'immigration_judge_source_releases' || table === 'immigration_judge_import_batches') return [];
  assert.equal(table, 'immigration_judges');
  let result = judgeRows;
  if (String(query.court_name || '').startsWith('eq.')) result = result.filter((row) => row.court_name === String(query.court_name).slice(3));
  if (String(query.court_state || '').startsWith('eq.')) result = result.filter((row) => row.court_state === String(query.court_state).slice(3));
  const offset = Number(query.offset || 0);
  const limit = Number(query.limit || result.length);
  return result.slice(offset, offset + limit);
}

require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: { rest: fakeRest }
};
delete require.cache[apiPath];

const { handler } = require(apiPath);

const statesResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'states' } });
const statesBody = JSON.parse(statesResponse.body);
assert.equal(statesResponse.statusCode, 200);
assert.equal(statesBody.fiscal_year, 2026);
assert.equal(statesBody.states.length, 32, 'published FY data must expose every mapped state and territory');
assert.ok(statesBody.states.some((row) => row.state === 'CA'));
assert.ok(statesBody.states.some((row) => row.state === 'NY'));
assert.equal(statesBody.states.some((row) => row.state === 'Unknown'), false, 'missing court_state must not become a clickable state');

const courtsResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'courts', state: 'CA' } });
const courtsBody = JSON.parse(courtsResponse.body);
assert.equal(courtsResponse.statusCode, 200);
assert.ok(courtsBody.count > 3);
assert.equal(courtsBody.courts.every((row) => row.court_state === 'CA'), true, 'CA drill-down must contain only CA courts');
assert.equal(courtsBody.courts.some((row) => /New York/i.test(row.court_name)), false);

const detailResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'court-detail', court: 'Shared Court', state: 'CA' } });
const detailBody = JSON.parse(detailResponse.body);
assert.equal(detailResponse.statusCode, 200);
assert.equal(detailBody.court.court_state, 'CA');
assert.deepEqual(detailBody.judges.map((row) => row.id), ['ca-shared'], 'same-name court detail must stay inside the selected state');

const historicalDetailResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'court-detail', court: 'Shared Court', state: 'CA', fy: '2025' } });
const historicalDetailBody = JSON.parse(historicalDetailResponse.body);
assert.equal(historicalDetailResponse.statusCode, 200);
assert.equal(historicalDetailBody.fiscal_year, 2025, 'court detail must honor the requested fiscal year');

const statesClient = readFileSync('immigration-judge-approval-rate/states.js', 'utf8');
const courtsClient = readFileSync('immigration-judge-approval-rate/courts.js', 'utf8');
const statesHtml = readFileSync('immigration-judge-approval-rate/states.html', 'utf8');
const courtsHtml = readFileSync('immigration-judge-approval-rate/courts.html', 'utf8');
const courtsCss = readFileSync('immigration-judge-approval-rate/courts.css', 'utf8');
const appI18n = readFileSync('asylumjudge/app-i18n.js', 'utf8');
const detailClient = readFileSync('immigration-judge-approval-rate/court-detail.js', 'utf8');
const overviewClient = readFileSync('asylumjudge/site.js', 'utf8');
assert.match(statesClient, /courts\.html\?state=/, 'state rows must navigate with a dedicated state parameter');
assert.doesNotMatch(statesClient, /courts\.html\?q=/, 'state rows must not use fuzzy text search');
assert.match(courtsClient, /get\('state'\)/, 'court listing must read the selected state from the URL');
assert.match(courtsClient, /params\.set\('state', state\)/, 'court listing must pass the exact state to the API');
assert.match(courtsClient, /document\.querySelectorAll\('\[data-fy\]'\).*addEventListener\('click'/, 'court fiscal-year controls must load the selected year');
assert.match(courtsClient, /load\(\$\('#court-q'\)\.value\.trim\(\), selectedState, Number\(button\.dataset\.fy\)\)/, 'year switching must preserve the current court search and state');
assert.match(courtsClient, /params\.set\('fy', fiscalYear\)/, 'court listing must send the selected fiscal year to the API');
assert.match(courtsClient, /url\.searchParams\.set\('fy', fiscalYear\)/, 'court listing must keep the selected fiscal year in the URL');
assert.match(courtsClient, /url\.searchParams\.set\('fy', fiscalYear\)[\s\S]*return `\$\{url\.pathname\}\$\{url\.search\}/, 'court profile links must preserve the selected fiscal year');
assert.match(courtsClient, /url\.searchParams\.set\('q', query\)/, 'court listing must preserve a search query in the URL');
assert.match(courtsClient, /button\.setAttribute\('aria-pressed', String\(active\)\)/, 'court year controls must expose their selected state');
assert.match(statesClient, /if \(!response\.ok\) throw/, 'state listing must treat non-2xx responses as failures');
assert.match(courtsClient, /if \(!response\.ok\) throw/, 'court listing must treat non-2xx responses as failures');
assert.match(statesClient, /id="state-retry"[\s\S]*load\(fiscalYear\)/, 'state retry must preserve the selected fiscal year');
assert.match(courtsClient, /id="court-retry"[\s\S]*load\(\$\('#court-q'\)\.value\.trim\(\), selectedState\)/, 'court retry must preserve the search and state filters');
assert.match(statesClient, /role="alert"/, 'state load failures must be announced');
assert.match(courtsClient, /role="alert"/, 'court load failures must be announced');
assert.match(statesHtml, /id="state-results"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'state results must expose live loading state');
assert.match(courtsHtml, /id="court-results"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'court results must expose live loading state');
assert.match(courtsHtml, /data-fy="2026"[^>]*aria-pressed="true"[\s\S]*data-fy="2025"[^>]*aria-pressed="false"/, 'court year controls must have initial accessible selection state');
assert.match(courtsHtml, /courts\.js\?v=8/, 'court page must load the fiscal-year-link client');
assert.match(statesHtml, /courts\.css\?v=4[\s\S]*app-i18n\.js\?v=8[\s\S]*states\.js\?v=6/, 'state page must load the retry-enabled assets');
assert.match(courtsHtml, /courts\.css\?v=4[\s\S]*app-i18n\.js\?v=8[\s\S]*courts\.js\?v=8/, 'court page must load the retry and fiscal-year-link assets');
assert.match(courtsCss, /\.empty-retry:focus-visible/, 'retry controls must have a visible keyboard focus style');
assert.match(appI18n, /\['重新尝试','Try again'.*'إعادة المحاولة','Tekrar dene'\]/, 'retry action must be translated in all supported languages');
assert.match(detailClient, /params\.set\('state', state\)/, 'court detail must preserve state scope');
assert.match(detailClient, /params\.set\('fy', requestedYear\)/, 'court detail must request the fiscal year selected in the directory');
assert.match(detailClient, /data\.fiscal_year[\s\S]*#court-source/, 'court detail must visibly identify the returned fiscal year');
assert.match(detailClient, /backParams[\s\S]*fy:[\s\S]*#court-back/, 'court detail back link must preserve fiscal year and state context');
assert.match(readFileSync('immigration-judge-approval-rate/court-detail.html', 'utf8'), /id="court-back"[\s\S]*id="court-source"[\s\S]*court-detail\.js\?v=3/, 'court detail must load the fiscal-year-aware client and expose its context targets');
assert.match(overviewClient, /appPath\('courts'\)\}\?state=/, 'overview state rows must open that state\'s courts directly');

console.log('AsylumJudge state drill-down contract: PASS');

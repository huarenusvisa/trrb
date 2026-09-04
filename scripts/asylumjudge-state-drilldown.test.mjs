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
  { id: 'nyc-blank-state', judge_name: 'NYC Legacy Judge', court_name: 'New York (NYC)', court_city: 'New York', court_state: '', total_asylum_decisions: 30, grants: 12, denials: 15, other_decisions: 3 },
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
assert.equal(detailBody.judge_list_scope, 'all_time_profiles', 'missing fiscal-year judge index must be disclosed instead of presenting all-time profiles as fiscal-year rows');

const historicalDetailResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'court-detail', court: 'Shared Court', state: 'CA', fy: '2025' } });
const historicalDetailBody = JSON.parse(historicalDetailResponse.body);
assert.equal(historicalDetailResponse.statusCode, 200);
assert.equal(historicalDetailBody.fiscal_year, 2025, 'court detail must honor the requested fiscal year');

const catalogScopedDetailResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'court-detail', court: 'New York (NYC)', state: 'NY', fy: '2025' } });
const catalogScopedDetailBody = JSON.parse(catalogScopedDetailResponse.body);
assert.equal(catalogScopedDetailResponse.statusCode, 200, 'published courts must tolerate legacy judge rows with a missing court_state');
assert.equal(catalogScopedDetailBody.court.court_state, 'NY', 'published court catalog must restore the verified state');
assert.equal(catalogScopedDetailBody.fiscal_year, 2025);

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
assert.match(courtsClient, /load\(\$\('#court-q'\)\.value\.trim\(\), selectedState, Number\(button\.dataset\.fy\), 'push'\)/, 'year switching must preserve the current court search and state in browser history');
assert.match(courtsClient, /params\.set\('fy', fiscalYear\)/, 'court listing must send the selected fiscal year to the API');
assert.match(courtsClient, /url\.searchParams\.set\('fy', fiscalYear\)/, 'court listing must keep the selected fiscal year in the URL');
assert.match(courtsClient, /url\.searchParams\.set\('fy', fiscalYear\)[\s\S]*return `\$\{url\.pathname\}\$\{url\.search\}/, 'court profile links must preserve the selected fiscal year');
assert.match(courtsClient, /url\.searchParams\.set\('q', query\)/, 'court listing must preserve a search query in the URL');
assert.match(courtsClient, /button\.setAttribute\('aria-pressed', String\(active\)\)/, 'court year controls must expose their selected state');
assert.match(courtsClient, /loadController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'court listing must cancel a superseded request');
assert.match(courtsClient, /if \(requestId !== loadSequence\) return;/, 'court listing must ignore a stale response');
assert.match(courtsClient, /error\.name === 'AbortError' \|\| requestId !== loadSequence/, 'superseded court requests must not render an error');
assert.match(courtsClient, /history\[historyMode === 'push' \? 'pushState' : 'replaceState'\]/, 'user-selected court filters must create browser history entries');
assert.match(courtsClient, /addEventListener\('popstate',[\s\S]*applyLocationState\(\)[\s\S]*load\(query, selectedState, year, 'none'\)/, 'browser navigation must restore the court query, state, and fiscal year');
assert.match(statesClient, /if \(!response\.ok\) throw/, 'state listing must treat non-2xx responses as failures');
assert.match(statesClient, /initialParams\.get\('q'\) \|\| initialParams\.get\('state'\)/, 'state listing must prefer the canonical query parameter while accepting legacy state links');
assert.match(statesClient, /url\.searchParams\.set\('q', query\)/, 'state listing must preserve its search query in the URL');
assert.match(statesClient, /history\[historyMode === 'push' \? 'pushState' : 'replaceState'\]/, 'user-selected state filters must create browser history entries');
assert.match(statesClient, /addEventListener\('popstate',[\s\S]*load\(applyLocationState\(\), 'none'\)/, 'browser navigation must restore the state query and fiscal year');
assert.match(statesClient, /loadController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'state navigation must cancel a superseded request');
assert.match(statesClient, /if \(requestId !== loadSequence\) return;/, 'state navigation must ignore a stale response');
assert.match(statesClient, /url\.searchParams\.delete\('state'\)/, 'state listing must remove the legacy state alias after canonicalizing the URL');
assert.match(statesClient, /button\.setAttribute\('aria-pressed', String\(active\)\)/, 'state year controls must expose their selected state');
assert.match(courtsClient, /if \(!response\.ok\) throw/, 'court listing must treat non-2xx responses as failures');
assert.match(statesClient, /id="state-retry"[\s\S]*load\(fiscalYear\)/, 'state retry must preserve the selected fiscal year');
assert.match(statesClient, /async function load\(year = fiscalYear, historyMode = 'replace'\)[\s\S]*fiscalYear = Number\(year\) \|\| fiscalYear;\s*updateYearControls\(\);/, 'state year selection must be retained before a request can fail');
assert.match(courtsClient, /id="court-retry"[\s\S]*load\(\$\('#court-q'\)\.value\.trim\(\), selectedState\)/, 'court retry must preserve the search and state filters');
assert.match(statesClient, /role="alert"/, 'state load failures must be announced');
assert.match(courtsClient, /role="alert"/, 'court load failures must be announced');
assert.match(statesHtml, /id="state-results"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'state results must expose live loading state');
assert.match(courtsHtml, /id="court-results"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'court results must expose live loading state');
assert.match(courtsHtml, /data-fy="2026"[^>]*aria-pressed="true"[\s\S]*data-fy="2025"[^>]*aria-pressed="false"/, 'court year controls must have initial accessible selection state');
assert.match(statesHtml, /data-state-year="2026"[^>]*aria-pressed="true"[\s\S]*data-state-year="2025"[^>]*aria-pressed="false"/, 'state year controls must have initial accessible selection state');
assert.match(courtsHtml, /courts\.js\?v=10/, 'court page must load the history-navigation client');
assert.match(statesHtml, /courts\.css\?v=4[\s\S]*app-i18n\.js\?v=8[\s\S]*states\.js\?v=9/, 'state page must load the history-navigation client');
assert.match(courtsHtml, /courts\.css\?v=4[\s\S]*app-i18n\.js\?v=8[\s\S]*courts\.js\?v=10/, 'court page must load the retry and history-navigation assets');
assert.match(courtsCss, /\.empty-retry:focus-visible/, 'retry controls must have a visible keyboard focus style');
assert.match(appI18n, /\['重新尝试','Try again'.*'إعادة المحاولة','Tekrar dene'\]/, 'retry action must be translated in all supported languages');
assert.match(detailClient, /params\.set\('state', state\)/, 'court detail must preserve state scope');
assert.match(detailClient, /params\.set\('fy', requestedYear\)/, 'court detail must request the fiscal year selected in the directory');
assert.match(detailClient, /data\.fiscal_year[\s\S]*#court-source/, 'court detail must visibly identify the returned fiscal year');
assert.match(detailClient, /backParams[\s\S]*fy:[\s\S]*#court-back/, 'court detail back link must preserve fiscal year and state context');
assert.match(detailClient, /if \(!response\.ok\) throw new Error\(`Court detail failed: \$\{response\.status\}`\)[\s\S]*const data = await response\.json\(\)/, 'court detail must reject non-success responses before parsing');
assert.match(detailClient, /id="court-detail-retry"[\s\S]*addEventListener\('click', load\)/, 'court detail failures must offer an in-place retry');
assert.match(detailClient, /loading\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*loading\.setAttribute\('aria-busy', 'false'\)/, 'court detail must expose its loading state');
assert.match(detailClient, /judge_list_scope === 'fiscal_year'/, 'court detail must distinguish fiscal-year judge rows from all-time profiles');
assert.match(detailClient, /FY \$\{fiscalYear\} 法官[\s\S]*法院法官档案（全数据范围）[\s\S]*当前列表不限定 FY \$\{fiscalYear\}/, 'court detail must clearly separate fiscal-year counts from all-time profile rows');
const courtDetailPage = readFileSync('immigration-judge-approval-rate/court-detail.html', 'utf8');
assert.match(courtDetailPage, /id="judge-list-title"/, 'court judge list must have a persistent accessible heading');
assert.match(courtDetailPage, /id="judge-list"[^>]*role="region"[^>]*aria-labelledby="judge-list-title"/, 'court judge list must expose a labelled navigation region');
assert.match(detailClient, /class="trow thead outcome-row" aria-hidden="true"/, 'visual column headings must not be read separately from the complete row summary');
assert.match(detailClient, /const accessibleSummary = `\$\{row\.judge_name\}；\$\{decisionHeading\}[\s\S]*aria-label="\$\{esc\(accessibleSummary\)\}"/, 'each judge profile link must announce every visible metric with its label');
assert.match(courtDetailPage, /court-detail\.js\?v=6/, 'court detail must load the accessible row-summary client');
assert.match(courtDetailPage, /id="loading"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'court detail loading and failure updates must be announced');
assert.match(courtDetailPage, /detail\.css\?v=3[\s\S]*id="court-back"[\s\S]*id="court-source"[\s\S]*court-detail\.js\?v=6/, 'court detail must load the scope-aware client and expose its context targets');
assert.match(overviewClient, /appPath\('courts'\)\}\?state=/, 'overview state rows must open that state\'s courts directly');

// Court profile recovery and period-scope disclosure are part of the state-to-court drill-down contract.
console.log('AsylumJudge state drill-down contract: PASS');

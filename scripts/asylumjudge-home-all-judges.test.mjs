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

const trendResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'state-trend', state: 'NY', interval: 'month' } });
const trendBody = JSON.parse(trendResponse.body);
assert.equal(trendResponse.statusCode, 200);
assert.equal(trendBody.state, 'NY');
assert.equal(trendBody.interval, 'month');
assert.equal(trendBody.periods.length, 24, 'homepage trend should return the latest 24 monthly points');
for (const point of trendBody.periods) assert.equal(Number(point.total_asylum_decisions), Number(point.grants) + Number(point.denials) + Number(point.other_decisions));
const cityTrendResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'state-trend', court: 'NYC', interval: 'year' } });
const cityTrendBody = JSON.parse(cityTrendResponse.body);
assert.equal(cityTrendResponse.statusCode, 200);
assert.equal(cityTrendBody.court_code, 'NYC');
assert.match(cityTrendBody.court_name, /New York/);
assert.ok(cityTrendBody.periods.length >= 3, 'every city/court trend must expose fiscal-year data');

const standalone = readFileSync('asylumjudge/index.html', 'utf8');
const trrb = readFileSync('asylumjudge/trrb.html', 'utf8');
const client = readFileSync('asylumjudge/site.js', 'utf8');
const styles = readFileSync('asylumjudge/site.css', 'utf8');
const brandClient = readFileSync('asylumjudge/domain-brand.js', 'utf8');
const manifest = JSON.parse(readFileSync('asylumjudge/site.webmanifest', 'utf8'));
const bundleBuilder = readFileSync('scripts/build-asylumjudge-site.mjs', 'utf8');

const trendRateHelperSource = client.match(/const reportableTrendRates = \(row\) => \{.*?\n\};/s)?.[0];
assert.ok(trendRateHelperSource, 'homepage client must expose the trend sample-threshold helper');
const reportableTrendRates = Function(`${trendRateHelperSource}; return reportableTrendRates;`)();
assert.deepEqual(
  reportableTrendRates({ grants: 4, denials: 0, adjudicated_approval_rate: null }),
  { approval: null, denial: null },
  'a four-case month must not be presented as a 100% approval rate'
);
assert.deepEqual(
  reportableTrendRates({ grants: 49, denials: 0, adjudicated_approval_rate: 100 }),
  { approval: null, denial: null },
  'the client must enforce the 50-merits threshold even if an upstream rate is present'
);
assert.deepEqual(
  reportableTrendRates({ grants: 30, denials: 20, adjudicated_approval_rate: 60 }),
  { approval: 60, denial: 40 },
  'reportable trend points must preserve the API rate and its complementary denial rate'
);

for (const html of [standalone, trrb]) {
  assert.match(html, /id="all-judges"/, 'both homepage variants must expose the full judge directory');
  assert.match(html, /id="judge-directory-list"/);
  assert.match(html, /id="judge-search"[^>]+role="search"[^>]+aria-labelledby="judge-search-label"/, 'homepage judge filtering must expose a named search landmark');
  assert.match(html, /id="judge-search-label"[^>]+for="judge-q"/, 'homepage search must keep a persistent accessible label');
  assert.match(html, /id="judge-q"[^>]+type="search"[^>]+enterkeyhint="search"[^>]+aria-controls="judge-directory-list"[^>]+aria-describedby="judge-search-note"/, 'homepage search must expose mobile search input semantics and its result relationship');
  assert.match(html, /id="judge-search-note"[^>]+class="legal-note"/, 'homepage search must associate the visible data-use note');
  assert.match(html, /id="judge-directory-count"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/, 'judge directory must announce concise result-count changes');
  assert.match(html, /id="judge-directory-list"[^>]+aria-busy="true"/, 'judge directory must expose its initial loading state');
  assert.doesNotMatch(html, /id="judge-directory-list"[^>]+aria-live=/, 'judge cards must not be announced as one oversized live region');
  assert.match(html, /id="daily-knowledge-items"[^>]+aria-live="polite"[^>]+aria-busy="true"/, 'daily knowledge must expose its initial loading state');
  assert.match(html, /id="state-list"[^>]+aria-live="polite"[^>]+aria-busy="true"/, 'state overview must expose its initial loading state');
  assert.doesNotMatch(html, /id="featured-judges"/, 'the old top-12-only section must be removed');
  assert.match(html, /data-state-interval="month"/, 'homepage must offer a monthly trend');
  assert.match(html, /data-state-interval="year"/, 'homepage must offer a fiscal-year trend');
  assert.match(html, /data-state-interval="month" aria-pressed="true"/, 'the initial trend interval must expose its selected state');
  assert.match(html, /data-state-interval="year" aria-pressed="false"/, 'the inactive trend interval must expose its unselected state');
  assert.match(html, /data-state-fy="2026" aria-pressed="true"/, 'the initial fiscal year must expose its selected state');
  assert.match(html, /data-state-fy="2025" aria-pressed="false"/, 'inactive fiscal years must expose their unselected state');
  assert.match(html, /id="state-trend-detail"/, 'homepage must expose touch-friendly point details');
  assert.match(html, /id="trend-state-select"/, 'homepage must let users choose a state');
  assert.match(html, /id="trend-court-select"/, 'homepage must let users choose any city or immigration court');
  assert.match(html, /class="trend-scope-controls" aria-busy="true"/, 'trend location controls must expose their initial loading state');
  assert.match(html, /id="trend-location-status"[^>]+aria-live="polite"[^>]+hidden/, 'trend location failures must have a dedicated live status region');
  assert.match(html, /id="state-market-chart"[^>]+aria-live="polite"[^>]+aria-busy="true"/, 'trend chart must expose its initial loading state');
  assert.match(html, /拒绝率/, 'trend legend must expose the red denial series');
  assert.match(html, /其他占比/, 'trend legend must expose the blue other-outcome series');
  assert.match(html, /class="brand-lockup"[^>]+logo\.svg/, 'both homepage variants must render the final AsylumJudge logo');
}
assert.match(client, /mode=all/, 'homepage must request the complete judge dataset');
assert.match(client, /filterJudges\(query\)/, 'homepage search must filter the complete in-memory directory');
assert.match(client, /addEventListener\('input'/, 'judge search must update directly while typing');
assert.doesNotMatch(client, /role="link" tabindex="0"/, 'judge cards must not create a nested synthetic link around real links');
assert.doesNotMatch(client, /card\.addEventListener\('keydown'/, 'judge cards must not add a redundant keyboard stop');
assert.match(client, /class="judge-profile-link" href=/, 'each judge card must keep a semantic profile link');
assert.match(client, /class="directory-detail-link" href=/, 'each judge card must keep a semantic detail link');
assert.match(client, /verdict-pass/);
assert.match(client, /verdict-deny/);
assert.match(client, /verdict-other/);
assert.match(client, /mode=state-trend/, 'homepage must request the selected state time series');
assert.match(client, /pointerdown/, 'trend points must respond to touch without navigation');
assert.match(client, /setPointerCapture/, 'touch dragging must continue while a finger moves across the chart');
assert.match(client, /market-crosshair/, 'trend chart must expose a moving stock-style crosshair');
assert.match(client, /market-floating-tooltip/, 'trend chart must show live values inside the chart');
assert.match(client, /linePath\('denial'\)/, 'trend chart must draw the denial line');
assert.match(client, /linePath\('otherShare'\)/, 'trend chart must draw the other-outcome line');
assert.match(client, /if \(point\[key\] == null \|\| !Number\.isFinite/, 'trend lines must break across suppressed low-sample points');
assert.match(client, /point\.approval == null \? '' : `<circle/, 'suppressed approval rates must not render misleading zero-value dots');
assert.match(client, /point\.denial == null \? '' : `<circle/, 'suppressed denial rates must not render misleading zero-value dots');
assert.match(client, /container\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*container\.setAttribute\('aria-busy', 'false'\)/, 'judge directory must announce loading and completion');
assert.match(client, /id="judge-directory-retry"[\s\S]*addEventListener\('click', loadAllJudges\)/, 'judge directory failures must offer an in-place retry');
assert.match(client, /daily-knowledge-items[\s\S]*aria-busy', 'true'[\s\S]*id="knowledge-retry"[\s\S]*addEventListener\('click', loadDailyKnowledge\)[\s\S]*finally[\s\S]*aria-busy', 'false'/, 'daily knowledge failures must offer an in-place retry and announce completion');
assert.match(client, /chart\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*chart\.setAttribute\('aria-busy', 'false'\)/, 'trend chart must announce loading and completion');
assert.match(client, /id="state-trend-retry"[\s\S]*addEventListener\('click', \(\) => loadStateTrend\(state, interval, court\)\)/, 'trend failures must retry the same state, interval, and court');
assert.match(client, /controls\.setAttribute\('aria-busy', 'true'\)[\s\S]*id="trend-location-retry"[\s\S]*addEventListener\('click', loadTrendLocations\)[\s\S]*finally[\s\S]*controls\.setAttribute\('aria-busy', 'false'\)/, 'trend location failures must offer an in-place retry and announce loading completion');
assert.match(client, /trendController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'a new trend request must cancel the previous state, court, or interval request');
assert.match(client, /if \(trendController !== controller\) return;[\s\S]*error\.name === 'AbortError' \|\| trendController !== controller/, 'late or cancelled trend responses must not overwrite the latest selection');
assert.match(client, /if \(trendController === controller\) \{[\s\S]*trendController = null;[\s\S]*aria-busy/, 'only the current trend request may end the loading state');
assert.match(client, /container\.setAttribute\('aria-busy', 'true'\)[\s\S]*id="overview-retry"[\s\S]*loadOverview\(fiscalYear\)[\s\S]*finally[\s\S]*container\.setAttribute\('aria-busy', 'false'\)/, 'state overview failures must retry the selected fiscal year and announce completion');
assert.doesNotMatch(client, /catch \(error\) \{[\s\S]{0,500}state-market-chart[\s\S]{0,500}州级数据暂时无法读取/, 'state overview failures must not overwrite the independently loaded trend chart');
assert.match(client, /overviewController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'a new fiscal-year request must cancel the previous overview request');
assert.match(client, /if \(overviewController !== controller\) return;[\s\S]*error\.name === 'AbortError' \|\| overviewController !== controller/, 'late or cancelled overview responses must not overwrite the latest fiscal year');
assert.match(client, /if \(overviewController === controller\) \{[\s\S]*overviewController = null;[\s\S]*aria-busy/, 'only the current overview request may end the loading state');
assert.match(client, /data-state-fy[\s\S]*setAttribute\('aria-pressed', String\(selected\)\)/, 'fiscal-year buttons must announce selection changes');
assert.match(client, /data-state-interval[\s\S]*setAttribute\('aria-pressed', String\(selected\)\)/, 'trend interval buttons must announce selection changes');
assert.match(client, /data-trend-court[\s\S]*setAttribute\('aria-pressed', String\(selected\)\)/, 'city shortcut buttons must announce selection changes');
assert.match(client, /data-trend-state="\$\{item\.state\}" aria-pressed="false"/, 'generated city shortcuts must begin unselected');
assert.doesNotMatch(client, /state-market-link/, 'trend chart must not be wrapped in a navigation link');
assert.match(styles, /\.directory-metric\.verdict-pass b[^}]*var\(--pass\)/);
assert.match(styles, /\.directory-metric\.verdict-deny b[^}]*var\(--deny\)/);
assert.match(styles, /\.directory-metric\.verdict-other b[^}]*var\(--other\)/);
assert.match(standalone, /rel="icon"[^>]+favicon\.ico/, 'homepage must declare a search and browser favicon');
assert.match(standalone, /rel="apple-touch-icon"/, 'homepage must declare an iOS home-screen icon');
assert.match(standalone, /rel="manifest"/, 'homepage must expose an installable site manifest');
assert.match(standalone, /site\.css\?v=20[\s\S]*site\.js\?v=29/, 'standalone homepage must load the accessible judge-card assets');
assert.match(trrb, /site\.css\?v=19[\s\S]*site\.js\?v=28/, 'embedded homepage must load the accessible judge-card assets');
assert.match(standalone, /og:image/, 'homepage must expose a branded share image');
assert.doesNotMatch(standalone, /href="\/immigration-judge-approval-rate\//, 'standalone homepage must use clean public routes directly');
assert.match(standalone, /href="\/states"/, 'standalone homepage must link directly to the clean states route');
assert.match(standalone, /href="\/nationality"/, 'standalone homepage must link directly to the clean nationality route');
assert.match(brandClient, /class="asylumjudge-lockup"[^>]+logo\.svg/, 'all judge data pages must receive the same logo');
assert.match(styles, /\.directory-retry\{[^}]*min-height:44px[^}]*cursor:pointer[^}]*\}[\s\S]*\.directory-retry:focus-visible\{[^}]*outline:/, 'directory retry must be touch-sized and keyboard-visible');
assert.match(styles, /\.trend-retry\{[^}]*min-height:44px[^}]*cursor:pointer[^}]*\}[\s\S]*\.trend-retry:focus-visible\{[^}]*outline:/, 'trend retry must be touch-sized and keyboard-visible');
assert.match(styles, /\.trend-location-status\{[^}]*display:flex[^}]*color:#b42318[^}]*\}[\s\S]*\.trend-location-status\[hidden\]\{display:none\}/, 'trend location errors must remain visible and hide cleanly after recovery');
assert.match(styles, /\.knowledge-empty>span\{[^}]*display:grid[^}]*gap:10px/, 'knowledge recovery must keep its message and touch-sized retry legible');
assert.match(brandClient, /\['\/immigration-judge-approval-rate\/states', `\$\{root\}\/states`\]/, 'pretty-URL legacy state links must normalize to the clean route');
assert.equal(manifest.name, 'AsylumJudge.com');
assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
for (const asset of ['favicon.ico', 'favicon-48.png', 'apple-touch-icon.png', 'site.webmanifest']) assert.match(bundleBuilder, new RegExp(asset.replace('.', '\\.')));

console.log('AsylumJudge all-judge homepage contract: PASS');

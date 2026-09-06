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
const i18n = readFileSync('asylumjudge/app-i18n.js', 'utf8');
const styles = readFileSync('asylumjudge/site.css', 'utf8');
const brandClient = readFileSync('asylumjudge/domain-brand.js', 'utf8');
const manifest = JSON.parse(readFileSync('asylumjudge/site.webmanifest', 'utf8'));
const bundleBuilder = readFileSync('scripts/build-asylumjudge-site.mjs', 'utf8');

assert.match(styles, /\.judge-directory-row\{[^}]*content-visibility:auto[^}]*contain-intrinsic-block-size:auto 150px/, 'offscreen judge cards must defer layout and paint with a stable desktop placeholder');
assert.match(styles, /@media\(max-width:760px\)\{\.judge-directory-row\{[^}]*contain-intrinsic-block-size:auto 196px/, 'offscreen judge cards must reserve their mobile card height');
assert.match(standalone, /site\.css\?v=27/, 'standalone homepage must load the directory-action focus stylesheet');
assert.match(trrb, /site\.css\?v=26/, 'embedded homepage must load the directory-action focus stylesheet');
assert.match(styles, /\.header-inner \.home-nav a\{[^}]*min-height:44px[^}]*touch-action:manipulation/, 'mobile homepage navigation must provide responsive 44px touch targets');
assert.match(styles, /\.home-language-control select\{[^}]*height:44px[^}]*touch-action:manipulation/, 'homepage language selector must provide a 44px touch target');
assert.match(styles, /@media\(max-width:480px\)\{.*?\.home-language-control select\{[^}]*height:44px/, 'narrow screens must preserve the homepage language selector touch target');
assert.match(styles, /\.quick button\{[^}]*min-height:44px[^}]*touch-action:manipulation/, 'homepage quick-search buttons must provide 44px touch targets');
assert.match(styles, /\.state-fy-tabs button\{[^}]*min-height:44px[^}]*touch-action:manipulation/, 'homepage fiscal-year tabs must provide 44px touch targets');
assert.match(styles, /\.trend-interval-tabs button,\.state-trend-states button\{[^}]*min-height:44px[^}]*touch-action:manipulation/, 'homepage trend interval and city buttons must provide 44px touch targets');
assert.match(styles, /\.trend-scope-controls select\{[^}]*min-height:44px[^}]*touch-action:manipulation/, 'homepage trend selectors must provide 44px touch targets');
assert.match(styles, /@media\(max-width:560px\)\{[\s\S]*?\.state-trend-states button\{[^}]*min-height:44px/, 'narrow screens must preserve city shortcut touch targets');
assert.match(styles, /\.judge-webex a\{[^}]*display:inline-flex[^}]*min-height:44px[^}]*touch-action:manipulation/, 'judge Webex actions must provide 44px touch targets');
assert.match(styles, /\.directory-detail-link\{[^}]*display:inline-flex[^}]*min-height:44px[^}]*touch-action:manipulation/, 'judge detail actions must provide 44px touch targets');
assert.match(styles, /\.judge-profile-link:focus-visible,\.directory-detail-link:focus-visible,\.judge-webex a:focus-visible\{[^}]*outline:3px solid #101828[^}]*outline-offset:3px/, 'judge directory links must expose a high-contrast keyboard focus indicator');

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
  assert.match(html, /id="daily-knowledge-status"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/, 'daily knowledge must announce a concise atomic status');
  assert.match(html, /id="daily-knowledge-items"[^>]+aria-busy="true"/, 'daily knowledge must expose its initial loading state');
  assert.doesNotMatch(html, /id="daily-knowledge-items"[^>]+aria-live=/, 'daily knowledge cards must not be announced as one oversized live region');
  assert.match(html, /id="state-list-status"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/, 'state overview must announce a concise atomic status');
  assert.match(html, /id="state-list"[^>]+aria-busy="true"/, 'state overview must expose its initial loading state');
  assert.doesNotMatch(html, /id="state-list"[^>]+aria-live=/, 'state cards must not be announced as one oversized live region');
  assert.doesNotMatch(html, /id="featured-judges"/, 'the old top-12-only section must be removed');
  assert.match(html, /data-state-interval="month"/, 'homepage must offer a monthly trend');
  assert.match(html, /data-state-interval="year"/, 'homepage must offer a fiscal-year trend');
  assert.match(html, /data-state-interval="month" aria-pressed="true"/, 'the initial trend interval must expose its selected state');
  assert.match(html, /data-state-interval="year" aria-pressed="false"/, 'the inactive trend interval must expose its unselected state');
  assert.match(html, /data-state-fy="2026" aria-pressed="true"/, 'the initial fiscal year must expose its selected state');
  assert.match(html, /data-state-fy="2025" aria-pressed="false"/, 'inactive fiscal years must expose their unselected state');
  assert.match(html, /id="state-trend-detail"/, 'homepage must expose touch-friendly point details');
  assert.doesNotMatch(html, /id="state-trend-detail"[^>]*aria-live/, 'point details must not announce every hover or drag update');
  assert.match(html, /id="trend-state-select"/, 'homepage must let users choose a state');
  assert.match(html, /id="trend-court-select"/, 'homepage must let users choose any city or immigration court');
  assert.match(html, /class="trend-scope-controls" aria-busy="true"/, 'trend location controls must expose their initial loading state');
  assert.match(html, /id="trend-location-status"[^>]+aria-live="polite"[^>]+hidden/, 'trend location failures must have a dedicated live status region');
  assert.match(html, /id="state-market-status"[^>]+role="status"[^>]+aria-live="polite"[^>]+aria-atomic="true"/, 'trend updates must use a concise atomic status');
  assert.match(html, /id="state-market-chart"[^>]+aria-busy="true"/, 'trend chart must expose its initial loading state');
  assert.doesNotMatch(html, /id="state-market-chart"[^>]+aria-live=/, 'the full trend chart must not be announced as one oversized live region');
  assert.match(html, /拒绝率/, 'trend legend must expose the red denial series');
  assert.match(html, /其他占比/, 'trend legend must expose the blue other-outcome series');
  assert.match(html, /class="brand-lockup"[^>]+logo\.svg/, 'both homepage variants must render the final AsylumJudge logo');
}
assert.match(client, /mode=all/, 'homepage must request the complete judge dataset');
assert.match(client, /state-list-status[\s\S]{0,160}selected\.length/, 'state overview must announce only the rendered result count');
assert.match(client, /state-list-status[\s\S]{0,500}正在汇总州级样本/, 'state overview must announce its loading state');
assert.match(client, /status\.textContent = window\.AsylumI18n\?\.t\?\.\('数据库暂时无法读取'\)/, 'state overview failures must update the concise status');
assert.match(client, /status\.textContent = window\.AsylumI18n\?\.t\?\.\('趋势图已更新，共 \{count\} 个数据点'/, 'trend success must announce only a concise localized summary');
assert.match(client, /status\.textContent = window\.AsylumI18n\?\.t\?\.\('正在读取州趋势数据…'\)/, 'trend loading must update the concise status');
assert.match(client, /status\.textContent = window\.AsylumI18n\?\.t\?\.\('州趋势数据暂时无法读取'\)/, 'trend failures must update the concise status');
assert.match(client, /filterJudges\(query\)/, 'homepage search must filter the complete in-memory directory');
assert.match(client, /addEventListener\('input'/, 'judge search must update directly while typing');
assert.match(client, /addEventListener\('input'[\s\S]*applyJudgeFilter\(\$\('#judge-q'\)\.value, \{ updateUrl: false \}\)/, 'typing must preview results without overwriting browser history');
assert.match(client, /judge-search[\s\S]*pushHistory: true/, 'submitting a judge search must create a navigable history entry');
assert.match(client, /quick button[\s\S]*pushHistory: true/, 'quick searches must create navigable history entries');
assert.match(client, /nextUrl !== currentUrl[\s\S]*pushHistory \? 'pushState' : 'replaceState'/, 'identical searches must not create duplicate history entries');
assert.match(client, /addEventListener\('popstate'[\s\S]*URLSearchParams[\s\S]*applyJudgeFilter\(query, \{ updateUrl: false \}\)/, 'back and forward navigation must restore the query and matching results');
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
assert.match(client, /<svg viewBox=[^>]+role="group" aria-label=/, 'trend chart must expose its interactive points inside a named group');
assert.doesNotMatch(client, /<svg viewBox=[^>]+role="img"/, 'trend chart must not flatten interactive points into an image');
assert.match(client, /tabindex="\$\{index === points\.length - 1 \? 0 : -1\}"/, 'only the initially selected trend point must enter the tab order');
assert.match(client, /node\.setAttribute\('tabindex', selected \? '0' : '-1'\)/, 'trend point selection must maintain a single roving tab stop');
assert.match(client, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\][\s\S]*hitNodes\[next\]\?\.focus\(\)/, 'trend points must support arrow, Home, and End keyboard navigation');
assert.match(client, /t\('趋势数据点：\{period\}；批准率 \{approval\}；拒绝率 \{denial\}；其他占比 \{other\}；结案量 \{total\}'/, 'trend points must build their accessible labels through i18n');
assert.match(client, /const chartLabel = t\('\{label\}趋势图：\{interval\}显示批准、拒绝及其他裁决。使用左右方向键浏览数据点。'/, 'the trend group must use a localized keyboard-navigation label');
assert.match(client, /market-touch-hint[^>]*>\$\{esc\(t\('使用左右方向键浏览数据点；触摸设备可在图表上左右滑动。'\)\)\}/, 'the visible trend interaction hint must be localized');
assert.doesNotMatch(client, /market-floating-tooltip[^>]*role="status"/, 'trend tooltip must not announce every pointer movement');
assert.match(client, /linePath\('denial'\)/, 'trend chart must draw the denial line');
assert.match(client, /linePath\('otherShare'\)/, 'trend chart must draw the other-outcome line');
assert.match(client, /if \(point\[key\] == null \|\| !Number\.isFinite/, 'trend lines must break across suppressed low-sample points');
assert.match(client, /point\.approval == null \? '' : `<circle/, 'suppressed approval rates must not render misleading zero-value dots');
assert.match(client, /point\.denial == null \? '' : `<circle/, 'suppressed denial rates must not render misleading zero-value dots');
assert.match(client, /container\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*container\.setAttribute\('aria-busy', 'false'\)/, 'judge directory must announce loading and completion');
assert.match(client, /id="judge-directory-retry"[\s\S]*addEventListener\('click', loadAllJudges\)/, 'judge directory failures must offer an in-place retry');
assert.match(client, /freshness-badge'\)\.textContent = t\('稍后重试'\)[\s\S]*judge-directory-count'\)\.textContent = t\('读取失败'\)/, 'judge directory failure badges must be localized immediately');
assert.match(client, /t\('全部法官资料暂时无法读取'\)[\s\S]*t\('无需刷新页面，可以直接重新尝试。'\)[\s\S]*t\('重新尝试'\)/, 'judge directory recovery copy and action must be localized immediately');
assert.match(client, /daily-knowledge-items[\s\S]*aria-busy', 'true'[\s\S]*id="knowledge-retry"[\s\S]*addEventListener\('click', loadDailyKnowledge\)[\s\S]*finally[\s\S]*aria-busy', 'false'/, 'daily knowledge failures must offer an in-place retry and announce completion');
assert.match(client, /daily-knowledge-status[\s\S]{0,500}每日庇护知识已更新，共 \{count\} 篇/, 'daily knowledge success must announce only a concise localized result count');
assert.match(client, /status\.textContent = window\.AsylumI18n\?\.t\?\.\('最新庇护知识暂时无法读取'\)/, 'daily knowledge failures must update the concise status');
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
assert.match(standalone, /app-i18n\.js\?v=12[\s\S]*site\.js\?v=38/, 'standalone homepage must load the localized judge-directory recovery assets');
assert.match(trrb, /app-i18n\.js\?v=11[\s\S]*site\.js\?v=37/, 'embedded homepage must load the localized judge-directory recovery assets');
for (const source of ['正在读取全部法官资料…', '稍后重试', '读取失败', '全部法官资料暂时无法读取', '无需刷新页面，可以直接重新尝试。']) {
  const rowPattern = new RegExp(`\\['${source.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}'(?:,'[^']+'){9}\\]`);
  assert.match(i18n, rowPattern, `${source} must provide all nine non-source translations`);
}
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

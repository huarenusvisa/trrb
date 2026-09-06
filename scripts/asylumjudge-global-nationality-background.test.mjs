import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { localizedNationalityCodes, nationalityIsoCode } from './build-asylumjudge-seo.mjs';

const require = createRequire(import.meta.url);
const sharedPath = require.resolve('../netlify/functions/_shared/supabase-admin.js');
const apiPath = require.resolve('../netlify/functions/immigration-judges.js');
const nationalityIndex = JSON.parse(readFileSync('data/immigration-judge-nationality-periods.json', 'utf8'));
const nationalityData = {
  ...nationalityIndex,
  countries: nationalityIndex.shards.flatMap((name) => JSON.parse(readFileSync(`data/${name}`, 'utf8')).countries)
};
const backgroundData = JSON.parse(readFileSync('data/immigration-judge-backgrounds.json', 'utf8'));
const webexData = JSON.parse(readFileSync('data/eoir-webex-links.json', 'utf8'));

const cuba = nationalityData.countries.find((row) => row.nationality === 'Cuba');
const korea = nationalityData.countries.find((row) => row.nationality === 'South Korea');
const china = nationalityData.countries.find((row) => row.nationality === 'China');
const switzerland = nationalityData.countries.find((row) => row.nationality === 'Switzerland');
const comoros = nationalityData.countries.find((row) => row.nationality === 'Comoros');
assert.equal(nationalityData.countries.length, 227, 'the generated catalog must expose every observed nationality with a classified final outcome');
for (const field of ['nationality', 'nationality_code']) {
  const values = nationalityData.countries.map((row) => String(row[field] || '').trim().toLowerCase());
  assert.equal(new Set(values).size, values.length, `every catalog ${field} must uniquely identify one nationality`);
}
for (const country of nationalityData.countries) {
  assert.equal(Number(country.total_asylum_decisions), Number(country.grants) + Number(country.denials) + Number(country.other_decisions), `${country.nationality} aggregate outcomes must reconcile`);
  const monthlyTotals = (country.monthly || []).reduce((totals, row) => {
    for (const field of ['total_asylum_decisions', 'grants', 'denials', 'other_decisions']) totals[field] += Number(row[field] || 0);
    return totals;
  }, { total_asylum_decisions: 0, grants: 0, denials: 0, other_decisions: 0 });
  for (const field of Object.keys(monthlyTotals)) assert.equal(monthlyTotals[field], Number(country[field]), `${country.nationality} monthly ${field} must match its aggregate`);
  for (const period of ['monthly', 'quarterly', 'yearly']) {
    for (const row of country[period] || []) assert.equal(Number(row.total_asylum_decisions), Number(row.grants) + Number(row.denials) + Number(row.other_decisions), `${country.nationality} ${period} outcomes must reconcile`);
  }
}
for (const country of [cuba, korea, china]) assert.ok(country, 'China, Cuba, and South Korea must all be searchable');
assert.equal(nationalityIsoCode(china), 'CN', 'static China pages must identify ISO CN separately from EOIR CH');
assert.equal(nationalityIsoCode(switzerland), 'CH', 'static Switzerland pages must identify ISO CH separately from EOIR SZ');
assert.equal(nationalityIsoCode(comoros), 'KM', 'static Comoros pages must identify ISO KM separately from EOIR CN');
assert.equal(localizedNationalityCodes(china, 'zh-Hans'), 'EOIR代码：CH · ISO代码：CN', 'Chinese static pages must label both nationality code systems');
assert.equal(localizedNationalityCodes(switzerland, 'en'), 'EOIR code: SZ · ISO code: CH', 'English static pages must label both nationality code systems');
assert.deepEqual(
  {
    total: china.total_asylum_decisions,
    grants: china.grants,
    denials: china.denials,
    other: china.other_decisions,
    approvalRate: china.approval_rate,
    code: china.nationality_code,
    chineseName: china.nationality_zh
  },
  { total: 38607, grants: 16222, denials: 7063, other: 15322, approvalRate: 69.6672, code: 'CH', chineseName: '中国' },
  'the published China aggregate must remain tied to the verified July 2026 EOIR snapshot'
);
for (const year of ['2024', '2025', '2026']) assert.ok(cuba.yearly.some((row) => row.label === year), `Cuba must include real ${year} data`);
assert.ok(cuba.monthly.length > 2 && cuba.quarterly.length > 2 && cuba.yearly.length > 2, 'country trends must support month, quarter, and year views');
assert.equal(cuba.yearly.find((row) => row.label === '2025').approval_rate, 22.6253, 'trend data must be generated from the EOIR snapshot, not a placeholder');
assert.ok(backgroundData.profiles.length >= 560, 'historical DOJ/EOIR appointment biographies must be parsed across all configured releases');
assert.equal(backgroundData.diagnostics.find((row) => row.url.includes('/1441406/'))?.profiles, 82, 'all 77 judges and 5 temporary judges in the May 2026 release must be parsed');
for (const profile of backgroundData.profiles) {
  assert.match(profile.biography, /appointed/i, `${profile.judge_name} must contain an appointment biography`);
  assert.match(profile.source_url, /^https:\/\/www\.justice\.gov\//, `${profile.judge_name} must cite a first-party DOJ source`);
}
assert.ok(webexData.profiles.length > 700, 'official EOIR hearing directory must be parsed into judge profiles');
assert.ok(webexData.profiles.find((row) => row.name_key === 'reingold|jonathan')?.links[0]?.webex_url.includes('eoir.webex.com'), 'known official Webex links must be retained');

const judge = {
  id: 'judge-abbott',
  judge_name: 'Abbott, Lucas I.',
  court_name: 'Omaha Immigration Court',
  court_city: 'Omaha',
  court_state: 'NE',
  total_asylum_decisions: 100,
  grants: 40,
  denials: 55,
  other_decisions: 5
};

let nationalityQuery;
async function fakeRest(table, { query = {} } = {}) {
  if (table === 'immigration_judge_source_releases' || table === 'immigration_judge_import_batches') return [];
  if (table === 'immigration_judge_asylum_nationality') {
    if (query.judge_id) return [];
    nationalityQuery = query;
    return [{ judge_id: judge.id, nationality: 'Cuba', nationality_code: 'CU', total_asylum_decisions: 80, grants: 30, denials: 45, other_decisions: 5 }];
  }
  if (table === 'immigration_judge_asylum_yearly') return [];
  if (table === 'immigration_judges') return [judge];
  throw new Error(`unexpected table ${table}`);
}

require.cache[sharedPath] = { id: sharedPath, filename: sharedPath, loaded: true, exports: { rest: fakeRest } };
delete require.cache[apiPath];
const { handler } = require(apiPath);

const directoryResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'nationalities' } });
const directory = JSON.parse(directoryResponse.body);
assert.equal(directoryResponse.statusCode, 200);
assert.equal(directory.total_countries, 227);

const countryResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'nationality-detail', country: '古巴' } });
const countryDetail = JSON.parse(countryResponse.body);
assert.equal(countryResponse.statusCode, 200);
assert.equal(countryDetail.country.nationality, 'Cuba');
assert.ok(countryDetail.periods.monthly.length > 2);
assert.ok(countryDetail.periods.quarterly.length > 2);
assert.ok(countryDetail.periods.yearly.some((row) => row.label === '2026'));
assert.equal(countryDetail.judges[0].judge_name, judge.judge_name);
assert.equal(nationalityQuery.nationality_code, 'eq.CU', 'judge-level nationality data must match the exact EOIR code');
assert.equal(nationalityQuery.nationality, 'eq.Cuba', 'judge-level nationality data must also match the exact country name');

for (const ambiguous of ['congo', 'korea', 'guin']) {
  const response = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'nationality-detail', country: ambiguous } });
  assert.equal(response.statusCode, 404, `ambiguous partial nationality query ${ambiguous} must not silently select a country`);
}
const uniquePartialResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'nationality-detail', country: 'south kor' } });
assert.equal(uniquePartialResponse.statusCode, 200, 'an unambiguous partial nationality query may resolve safely');
assert.equal(JSON.parse(uniquePartialResponse.body).country.nationality, 'South Korea');

const judgeResponse = await handler({ httpMethod: 'GET', queryStringParameters: { mode: 'detail', id: judge.id } });
const judgeDetail = JSON.parse(judgeResponse.body);
assert.equal(judgeResponse.statusCode, 200);
assert.equal(judgeDetail.background.appointment_date, 'May 2026');
assert.match(judgeDetail.background.source_url, /justice\.gov/);
assert.equal(judgeDetail.background.departure_status, null);
assert.match(judgeDetail.background_policy, /absence of a departure record is not proof/);
assert.match(judgeDetail.judge.webex.links[0].webex_url, /^https:\/\/eoir\.webex\.com\/meet\//);

const page = readFileSync('immigration-judge-approval-rate/china-dashboard.html', 'utf8');
const client = readFileSync('immigration-judge-approval-rate/china-dashboard.js', 'utf8');
const i18nClient = readFileSync('immigration-judge-approval-rate/china-dashboard-i18n.js', 'utf8');
const searchHelpers = client.match(/function filterCountries\(query\)[\s\S]*?(?=\nfunction showTrendTooltip)/)?.[0];
assert.ok(searchHelpers, 'nationality search helpers must remain testable');
const searchSandbox = {
  countries: nationalityData.countries,
  i18n: {
    countryName: (row) => row.nationality,
    regionCodeForNationality: (row) => ({ China: 'CN', Switzerland: 'CH', 'South Korea': 'KR', 'North Korea': 'KP', Swaziland: 'SZ' })[row.nationality] || null
  }
};
runInNewContext(`${searchHelpers};
  const congo = filterCountries('congo');
  const korea = filterCountries('korea');
  const exactSouthKorea = filterCountries('South Korea');
  const chinaIso = filterCountries('CN');
  const chinaEoir = filterCountries('CH');
  const switzerlandEoir = filterCountries('SZ');
  const southKoreaIso = filterCountries('KR');
  searchResults = {
    congoCount: congo.length,
    congoResolved: resolveCountrySearch('congo', congo)?.nationality || null,
    koreaCount: korea.length,
    koreaResolved: resolveCountrySearch('korea', korea)?.nationality || null,
    exactResolved: resolveCountrySearch('South Korea', exactSouthKorea)?.nationality || null,
    uniqueResolved: resolveCountrySearch('south kor', filterCountries('south kor'))?.nationality || null,
    chinaIsoResolved: resolveCountrySearch('CN', chinaIso)?.nationality || null,
    chinaEoirResolved: resolveCountrySearch('CH', chinaEoir)?.nationality || null,
    switzerlandEoirResolved: resolveCountrySearch('SZ', switzerlandEoir)?.nationality || null,
    southKoreaIsoResolved: resolveCountrySearch('KR', southKoreaIso)?.nationality || null
  };`, searchSandbox);
assert.ok(searchSandbox.searchResults.congoCount > 1, 'Congo must exercise an ambiguous client-side search');
assert.equal(searchSandbox.searchResults.congoResolved, null, 'ambiguous Congo search must not pick the first country');
assert.ok(searchSandbox.searchResults.koreaCount > 1, 'Korea must exercise an ambiguous client-side search');
assert.equal(searchSandbox.searchResults.koreaResolved, null, 'ambiguous Korea search must not pick the first country');
assert.equal(searchSandbox.searchResults.exactResolved, 'South Korea', 'an exact country name must resolve even when it contains a shared search term');
assert.equal(searchSandbox.searchResults.uniqueResolved, 'South Korea', 'a unique partial search must still resolve');
assert.equal(searchSandbox.searchResults.chinaIsoResolved, null, 'CN must require confirmation because it means China in ISO and Comoros in EOIR');
assert.equal(searchSandbox.searchResults.chinaEoirResolved, null, 'CH must require confirmation because it means China in EOIR and Switzerland in ISO');
assert.equal(searchSandbox.searchResults.switzerlandEoirResolved, null, 'SZ must require confirmation because it means Switzerland in EOIR and Swaziland in ISO');
assert.equal(searchSandbox.searchResults.southKoreaIsoResolved, null, 'KR must require confirmation because it means South Korea in ISO and Kiribati in EOIR');
const i18nSandbox = {
  window: {},
  location: { pathname: '/nationality/', search: '', href: 'https://asylumjudge.com/nationality/' },
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    body: { dataset: {} },
    documentElement: {},
    querySelector: () => null,
    querySelectorAll: () => []
  },
  Intl,
  URL,
  URLSearchParams,
  CustomEvent: class CustomEvent {}
};
runInNewContext(i18nClient, i18nSandbox);
const chinaWithEoirCode = { nationality: 'China', nationality_zh: '中国', nationality_code: 'CH' };
i18nSandbox.window.AsylumI18n.setLocale('zh-Hans', { updateUrl: false, dispatch: false });
assert.equal(i18nSandbox.window.AsylumI18n.countryName(chinaWithEoirCode), '中国', 'EOIR CH must render as China, never Switzerland');
i18nSandbox.window.AsylumI18n.setLocale('en', { updateUrl: false, dispatch: false });
assert.equal(i18nSandbox.window.AsylumI18n.countryName(chinaWithEoirCode), 'China', 'EOIR nationality codes must not be treated as ISO region codes');
i18nSandbox.window.AsylumI18n.setLocale('zh-Hans', { updateUrl: false, dispatch: false });
assert.equal(i18nSandbox.window.AsylumI18n.countryName({ nationality: 'El Salvador', nationality_zh: '萨尔瓦多', nationality_code: 'ES' }), '萨尔瓦多', 'EOIR ES must not render as Spain');
assert.equal(i18nSandbox.window.AsylumI18n.regionCodeForNationality(chinaWithEoirCode), 'CN', 'China must expose ISO CN as a search alias without replacing EOIR CH');
assert.equal(i18nSandbox.window.AsylumI18n.regionCodeForNationality({ nationality: 'Switzerland', nationality_code: 'SZ' }), 'CH', 'Switzerland must expose ISO CH as a search alias without replacing EOIR SZ');
const standaloneProxy = readFileSync('asylumjudge/immigration-judges-proxy.js', 'utf8');
const detailPage = readFileSync('immigration-judge-approval-rate/detail.html', 'utf8');
const detailClient = readFileSync('immigration-judge-approval-rate/detail.js', 'utf8');
const detailStyles = readFileSync('immigration-judge-approval-rate/detail.css', 'utf8');
// Detail recovery assertions keep transient API failures from becoming dead ends.
const routes = readFileSync('scripts/finalize-redirects.mjs', 'utf8');
const seoBuilder = readFileSync('scripts/build-asylumjudge-seo.mjs', 'utf8');
const homepageClient = readFileSync('asylumjudge/site.js', 'utf8');
assert.match(detailPage, /id="detail-loading"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/, 'judge detail loading and failure updates must be announced');
assert.match(detailPage, /detail\.css\?v=6[\s\S]*detail\.js\?v=9/, 'judge detail page must load the current asset versions');
assert.match(detailStyles, /\.country-tools \.nationality-fy button\{[^}]*height:44px[^}]*touch-action:manipulation/, 'judge detail fiscal-year filters must provide responsive 44px touch targets');
assert.match(detailClient, /const REQUEST_TIMEOUT_MS = 15000/, 'judge detail requests must use a finite timeout');
assert.match(detailClient, /new DOMException\('Request timed out', 'TimeoutError'\)/, 'timed-out judge detail requests must reach the retry state');
assert.match(detailClient, /signal: controller\.signal/, 'judge detail fetches must use the timeout-aware abort signal');
assert.match(detailClient, /if \(!response\.ok\) throw new Error\(`Judge detail failed: \$\{response\.status\}`\)[\s\S]*return await response\.json\(\)/, 'judge details must reject non-success responses before parsing');
assert.match(detailClient, /finally \{[\s\S]*clearTimeout\(timeoutId\)/, 'completed judge detail requests must release their timeout');
assert.match(detailClient, /requestJson\(apiUrl\(localUrl\), \{ cache: 'no-store' \}\)/, 'judge details must use the timeout-aware request helper');
assert.match(detailClient, /id="judge-detail-retry"[\s\S]*addEventListener\('click', load\)/, 'judge detail failures must offer an in-place retry');
assert.match(detailClient, /detailLoading\.setAttribute\('aria-busy', 'true'\)[\s\S]*finally[\s\S]*detailLoading\.setAttribute\('aria-busy', 'false'\)/, 'judge detail must expose its loading state');
assert.match(detailStyles, /\.detail-retry:focus-visible/, 'judge detail retry must expose a visible keyboard focus state');
for (const label of ['全球申请人庇护裁决结果', '月度', '季度', '年度', '全部国籍']) assert.match(page, new RegExp(label));
assert.match(page, /主要国籍裁决结果对比图/);
assert.match(page, /id="country-comparison-chart"/);
assert.match(page, /id="country-search"[^>]*data-i18n-aria-label="searchButton"[^>]*aria-label="搜索国籍"/, 'nationality search must have a localized accessible name');
assert.match(page, /id="country-search"[^>]*aria-controls="country-directory"[^>]*aria-describedby="country-count"/, 'nationality search must identify its result list and status');
assert.match(page, /id="country-count"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/, 'filtered nationality counts must be announced to screen readers');
assert.match(page, /class="tabs"[^>]*role="group"[^>]*data-i18n-aria-label="trendLabel"/, 'trend period controls must expose a localized group label');
assert.match(page, /data-period="yearly"[^>]*aria-pressed="true"/, 'the active trend period must expose its selected state');
assert.match(page, /id="country-comparison-chart"[^>]*role="group"[^>]*data-i18n-aria-label="comparisonAria"/, 'country comparison chart must expose its interactive points inside a localized named group');
assert.match(page, /id="trend-chart"[^>]*role="group"[^>]*data-i18n-aria-label="trendTitle"/, 'trend chart must expose its interactive points inside a localized named group');
assert.doesNotMatch(page, /id="(?:country-comparison-chart|trend-chart)"[^>]*role="img"/, 'interactive nationality charts must not flatten their keyboard points into images');
assert.doesNotMatch(page, /id="(?:comparison-tooltip|trend-tooltip)"[^>]*(?:role="status"|aria-live=)/, 'pointer and touch tooltips must not trigger repeated live announcements');
assert.match(page, /china-dashboard-i18n\.js\?v=9/, 'nationality dashboard must load the localized chart guidance asset version');
assert.match(page, /china-dashboard\.js\?v=26/, 'nationality dashboard must load the chart shortcut semantics asset version');
assert.match(client, /mode=nationalities/);
assert.match(client, /mode=nationality-detail/);
assert.match(client, /trend-line/);
assert.match(client, /outcome-line/);
assert.match(client, /pointerup/);
assert.match(client, /trend-chart'\)\.setAttribute\('aria-label', t\('countryTrend'/, 'selected country must update the trend chart accessible name');
assert.match(client, /function updatePageMetadata\(country\)[\s\S]*document\.title = `\$\{t\('countryTrend', \{ country: label \}\)\} \| AsylumJudge`;[\s\S]*meta\[name="description"\][\s\S]*description\.content = `\$\{label\}\. \$\{t\('heroIntro'\)\}`/, 'selected country and locale must update the browser title and description');
assert.match(client, /\$\('#judge-ranking-title'\)\.textContent = t\('countryJudges',[\s\S]*updatePageMetadata\(country\)/, 'country metadata must refresh whenever selected data renders');
assert.match(client, /item\.setAttribute\('aria-pressed', 'false'\)[\s\S]*button\.setAttribute\('aria-pressed', 'true'\)/, 'trend period selection must keep aria-pressed in sync');
assert.match(client, /function outcomeAriaLabel\(row, label\)[\s\S]*t\('approved'\)[\s\S]*t\('denied'\)[\s\S]*t\('other'\)[\s\S]*t\('total'\)/, 'chart data labels must announce every outcome share and the total');
assert.match(client, /country-point-wrap[^\n]*aria-label="\$\{esc\(outcomeAriaLabel\(row, label\)\)\}"/, 'country comparison points must expose their values to screen readers');
assert.match(client, /trend-point[^\n]*aria-label="\$\{esc\(outcomeAriaLabel\(point, point\.label\)\)\}"/, 'trend points must expose their values to screen readers');
assert.match(client, /country-point-wrap[^\n]*tabindex="\$\{index === 0 \? 0 : -1\}"/, 'country comparison must expose only one initial tab stop');
assert.match(client, /trend-point[^\n]*tabindex="\$\{index === shown\.length - 1 \? 0 : -1\}"/, 'trend chart must expose only the latest point as its initial tab stop');
assert.match(client, /function moveChartFocus\(nodes, currentIndex, key\)[\s\S]*ArrowLeft[\s\S]*ArrowRight[\s\S]*Home[\s\S]*End[\s\S]*nodes\[nextIndex\]\?\.focus\(\)/, 'chart points must support roving arrow, Home, and End navigation');
assert.equal((client.match(/moveChartFocus\(pointNodes, index, event\.key\)/g) || []).length, 2, 'both nationality charts must use the shared keyboard navigation behavior');
assert.equal((client.match(/aria-keyshortcuts="ArrowLeft ArrowRight Home End"/g) || []).length, 2, 'both nationality chart point templates must expose their keyboard shortcuts');
assert.match(page, /id="country-comparison-chart"[^>]*aria-describedby="comparison-keyboard-note"/, 'country comparison must reference its visible keyboard instructions');
assert.match(page, /id="trend-chart"[^>]*aria-describedby="trend-keyboard-note"/, 'trend chart must reference its visible keyboard instructions');
assert.equal((page.match(/data-i18n="chartKeyboardHint"/g) || []).length, 2, 'both nationality charts must show localized keyboard instructions');
assert.match(i18nClient, /const chartKeyboardHints = \{[\s\S]*'zh-Hans':[\s\S]*'zh-Hant':[\s\S]*ar:[\s\S]*tr:[\s\S]*Object\.entries\(chartKeyboardHints\)/, 'chart keyboard instructions must be defined and applied across supported locales');
assert.match(page, /\.language-control select\{height:44px/, 'the nationality language selector must meet the mobile touch target height');
for (const selector of ['quick-countries button', 'tabs button', 'tooltip-action', 'data-retry']) {
  const selectorPattern = selector.replaceAll('.', '\\.').replaceAll(' ', '\\s+');
  assert.match(page, new RegExp(`\\.${selectorPattern}\\{[^}]*min-height:44px[^}]*touch-action:manipulation`), `${selector} must provide a 44px mobile touch target without delayed taps`);
}
assert.match(client, /function retryButton\(scope, country = '', updateUrl = false\)/, 'nationality failures must render an in-page retry action');
assert.match(client, /data-retry="\$\{scope\}"[^>]*data-country="\$\{esc\(country\)\}"[^>]*data-update-url="\$\{updateUrl\}"[^>]*data-i18n="retryAction"/, 'detail retries must preserve the failed nationality, URL behavior, and live translation');
assert.match(client, /button\.dataset\.retry === 'directory'\) await load\(\)[\s\S]*else await selectCountry\(button\.dataset\.country, button\.dataset\.updateUrl === 'true'\)/, 'retry actions must reload only the failed data scope');
assert.match(page, /\.data-retry:focus-visible/, 'retry actions must expose a visible keyboard focus state');
assert.match(page, /\.country-search input:focus-visible,\.country-search button:focus-visible,\.quick-countries button:focus-visible,\.tabs button:focus-visible,\.tooltip-action:focus-visible,\.country-card:focus-visible\{outline:3px solid #101828;outline-offset:3px\}/, 'all primary nationality controls must expose a consistent visible keyboard focus state');
assert.match(page, /class="quick-countries"[^>]*role="group"[^>]*data-i18n-aria-label="popularNationalities"/, 'popular nationality controls must expose a localized group label');
assert.match(page, /data-country="China"[^>]*aria-pressed="false"/, 'popular nationality buttons must expose their initial selection state');
assert.match(client, /country-card\$\{active \? ' active' : ''\}[^\n]*aria-pressed="\$\{active\}"/, 'directory buttons must expose the selected nationality');
assert.match(client, /const countryCodeLabels = \(row\) => \{[\s\S]*t\('eoirCode',[\s\S]*regionCodeForNationality\(row\)[\s\S]*t\('isoCode',[\s\S]*labels\.join/, 'country code labels must distinguish EOIR and ISO codes');
assert.match(client, /country-card[^\n]*countryCodeLabels\(row\)/, 'nationality directory entries must show both available code systems');
assert.match(client, /selected-code'\)\.textContent = countryCodeLabels\(country\)/, 'selected nationality details must show both available code systems');
assert.match(seoBuilder, /replace\('<h2 id="selected-country" tabindex="-1">正在读取国籍数据…<\/h2>',[\s\S]*localizedCountry/, 'static nationality pages must replace the loading heading while retaining its focus target');
assert.match(seoBuilder, /replace\('<span id="selected-code"><\/span>',[\s\S]*localizedNationalityCodes\(country, locale\.code\)/, 'static nationality pages must prerender both labeled code systems');
assert.match(client, /button\.setAttribute\('aria-pressed', String\(selected\?\.nationality === button\.dataset\.country\)\)/, 'popular nationality selection state must stay synchronized');
assert.match(page, /id="country-detail-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*data-i18n="loadingReal"/, 'nationality details must expose a concise localized loading status');
assert.match(page, /id="country-detail"[^>]*aria-busy="false"/, 'nationality details must expose their initial loading state');
assert.doesNotMatch(page, /id="country-detail"[^>]*aria-live=/, 'the full nationality detail must not be exposed as one oversized live region');
assert.match(client, /country-detail-status'\)\.textContent = `\$\{t\('detailsFor',[\s\S]*t\('approvalRate'\)[\s\S]*statusReliable[\s\S]*statusUnreliable/, 'completed nationality requests must announce a concise localized result summary');
assert.match(client, /const requestId = \+\+countryRequestId;[\s\S]*if \(requestId !== countryRequestId\) return;[\s\S]*if \(requestId === countryRequestId\)[\s\S]*aria-busy/, 'stale nationality responses must not replace the latest selection');
assert.match(client, /setPeriodControlsDisabled\(true\)[\s\S]*if \(requestId === countryRequestId\)[\s\S]*setPeriodControlsDisabled\(false\)/, 'trend period controls must stay disabled until the latest nationality request settles');
assert.match(client, /countryRequestController\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/, 'superseded nationality requests must be actively cancelled');
assert.match(client, /if \(requestId === countryRequestId\)[\s\S]*countryRequestController = null/, 'only the latest nationality request may clear its controller');
assert.match(page, /\.tabs button:disabled\{cursor:wait;opacity:\.6\}/, 'disabled trend controls must expose a clear loading state');
assert.match(client, /country-directory'\)\.querySelectorAll\('\[data-country\]'\)[^\n]*selectCountry\(button\.dataset\.country, true, true\)/, 'directory selections must reveal the updated detail panel');
assert.match(client, /prefers-reduced-motion: reduce[\s\S]*behavior: reduceMotion \? 'auto' : 'smooth'/, 'detail scrolling must respect reduced-motion preferences');
assert.match(page, /id="selected-country"[^>]*tabindex="-1"/, 'the updated nationality heading must accept programmatic focus');
assert.match(client, /selected-country'\)\.focus\(\{ preventScroll: true \}\)/, 'directory navigation must move keyboard focus to the updated heading');
assert.match(page, /\.country-name h2:focus-visible\{outline:3px solid var\(--pass\)/, 'the focused nationality heading must retain a visible focus indicator');
assert.match(client, /comparison-tooltip/);
assert.match(client, /function resolveCountrySearch\(query, matches\)[\s\S]*exactEoir\.length === 1 && exactIso\.length === 1 && exactEoir\[0\] !== exactIso\[0\]\) return null;[\s\S]*if \(exactEoir\.length === 1\) return exactEoir\[0\];[\s\S]*if \(exactIso\.length === 1\) return exactIso\[0\];[\s\S]*matches\.length === 1 \? matches\[0\] : null/, 'nationality search must require confirmation for EOIR and ISO code collisions before resolving safe exact or unique results');
assert.match(client, /filterCountries\(query\)[\s\S]*i18n\?\.regionCodeForNationality\(row\)/, 'nationality search must include ISO region-code aliases');
assert.match(client, /const match = resolveCountrySearch\(query, matches\);[\s\S]*if \(match\) selectCountry\(match\.nationality, true, true\)/, 'successful nationality searches must reveal and focus the selected country details');
assert.match(client, /else if \(matches\.length > 1\)[\s\S]*\$\('#country-count'\)\.textContent = t\('searchChooseOne', \{ count: fmt\(matches\.length\) \}\);[\s\S]*focusCountryResults\(\)/, 'ambiguous nationality searches must announce that the user should choose a result and move to the candidates');
assert.match(client, /querySelectorAll\('\.quick-countries button'\)[\s\S]*selectCountry\(button\.dataset\.country, true, true\)/, 'quick nationality buttons must reveal and focus the selected country details');
assert.match(client, /function focusCountryResults\(\)[\s\S]*querySelector\('\.country-card'\)[\s\S]*querySelector\('\.empty'\)[\s\S]*setAttribute\('tabindex', '-1'\)[\s\S]*prefers-reduced-motion: reduce[\s\S]*scrollIntoView[\s\S]*focus\(\{ preventScroll: true \}\)/, 'search results must focus either the first candidate or the empty state while respecting reduced-motion preferences');
assert.match(client, /else focusCountryResults\(\);[\s\S]*\$\('#country-search'\)\.addEventListener/, 'a submitted search with no matches must move users to the empty result state');
assert.equal((i18nClient.match(/searchChooseOne\s*:/g) || []).length, 10, 'ambiguous search guidance must be translated for all ten supported languages');
assert.match(client, /history\.pushState\(\{ country: data\.country\.nationality \}, '', nextUrl\)/, 'user-selected nationalities must create browser history entries');
assert.match(client, /if \(`\$\{location\.pathname\}\$\{location\.search\}` !== nextUrl\)[\s\S]*history\.pushState/, 'selecting the current nationality must not create duplicate history entries');
assert.match(client, /window\.addEventListener\('popstate',[\s\S]*new URLSearchParams\(location\.search\)\.get\('country'\)[\s\S]*selectCountry\(country\)/, 'browser back and forward navigation must restore the nationality from the URL');
const retryLabels = new Map(Object.entries({ en: 'Try again', es: 'Intentar de nuevo', fr: 'Réessayer', 'pt-BR': 'Tentar novamente', hi: 'फिर प्रयास करें', 'zh-Hans': '重新尝试', 'zh-Hant': '重新嘗試', ru: 'Повторить', ar: 'إعادة المحاولة', tr: 'Tekrar dene' }));
const eoirCodeLabels = new Map(Object.entries({ en: 'EOIR code: SZ', es: 'Código EOIR: SZ', fr: 'Code EOIR : SZ', 'pt-BR': 'Código EOIR: SZ', hi: 'EOIR कोड: SZ', 'zh-Hans': 'EOIR代码：SZ', 'zh-Hant': 'EOIR代碼：SZ', ru: 'Код EOIR: SZ', ar: 'رمز EOIR: SZ', tr: 'EOIR kodu: SZ' }));
const isoCodeLabels = new Map(Object.entries({ en: 'ISO code: CH', es: 'Código ISO: CH', fr: 'Code ISO : CH', 'pt-BR': 'Código ISO: CH', hi: 'ISO कोड: CH', 'zh-Hans': 'ISO代码：CH', 'zh-Hant': 'ISO代碼：CH', ru: 'Код ISO: CH', ar: 'رمز ISO: CH', tr: 'ISO kodu: CH' }));
for (const locale of ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr']) {
  assert.match(i18nClient, new RegExp(`['"]${locale}['"]`));
  i18nSandbox.window.AsylumI18n.setLocale(locale, { updateUrl: false, dispatch: false });
  assert.equal(i18nSandbox.window.AsylumI18n.t('retryAction'), retryLabels.get(locale), `retry action must be translated for ${locale}`);
  assert.equal(i18nSandbox.window.AsylumI18n.t('eoirCode', { code: 'SZ' }), eoirCodeLabels.get(locale), `EOIR code label must be translated for ${locale}`);
  assert.equal(i18nSandbox.window.AsylumI18n.t('isoCode', { code: 'CH' }), isoCodeLabels.get(locale), `ISO code label must be translated for ${locale}`);
}
assert.match(i18nClient, /locale === 'ar' \? 'rtl' : 'ltr'/);
assert.match(page, /id="language-select"/);
assert.match(page, /data-i18n="comparisonTitle"/);
assert.match(standaloneProxy, /cache: 'no-store'/);
assert.match(detailClient, /const apiUrl/);
assert.doesNotMatch(detailClient, /https:\/\/trrb\.net/, 'AsylumJudge detail pages must use the same-origin data proxy');
assert.doesNotMatch(page, /EOIR 尚未提供可核验的按月国籍裁决序列/);
assert.match(detailPage, /法官背景与任命信息/);
assert.match(detailPage, /未发现离任或被辞退记录，不等于确认仍在任/);
assert.match(detailClient, /EOIR Webex 网上上庭入口/);
assert.match(detailClient, /\['2026', '2025', '2024'\]/, 'judge years must display in 2026, 2025, 2024 order');
assert.match(detailClient, /横向年度裁决对比图/);
assert.doesNotMatch(detailClient, /中等样本/);
assert.match(homepageClient, /Webex 网上上庭/);
assert.match(homepageClient, /少于 50 件，不显示/);
assert.match(routes, /\/nationality/);

console.log('AsylumJudge global nationality trends and official judge backgrounds: PASS');

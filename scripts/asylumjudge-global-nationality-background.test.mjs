import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

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
assert.equal(nationalityData.countries.length, 227, 'the generated catalog must expose every observed nationality with a classified final outcome');
for (const country of [cuba, korea, china]) assert.ok(country, 'China, Cuba, and South Korea must all be searchable');
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

async function fakeRest(table, { query = {} } = {}) {
  if (table === 'immigration_judge_source_releases' || table === 'immigration_judge_import_batches') return [];
  if (table === 'immigration_judge_asylum_nationality') {
    if (query.judge_id) return [];
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
const standaloneProxy = readFileSync('asylumjudge/immigration-judges-proxy.js', 'utf8');
const detailPage = readFileSync('immigration-judge-approval-rate/detail.html', 'utf8');
const detailClient = readFileSync('immigration-judge-approval-rate/detail.js', 'utf8');
const routes = readFileSync('scripts/finalize-redirects.mjs', 'utf8');
const homepageClient = readFileSync('asylumjudge/site.js', 'utf8');
for (const label of ['全球申请人庇护裁决结果', '月度', '季度', '年度', '全部国籍']) assert.match(page, new RegExp(label));
assert.match(page, /主要国籍裁决结果对比图/);
assert.match(page, /id="country-comparison-chart"/);
assert.match(page, /id="country-search"[^>]*data-i18n-aria-label="searchButton"[^>]*aria-label="搜索国籍"/, 'nationality search must have a localized accessible name');
assert.match(page, /id="country-search"[^>]*aria-controls="country-directory"[^>]*aria-describedby="country-count"/, 'nationality search must identify its result list and status');
assert.match(page, /id="country-count"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/, 'filtered nationality counts must be announced to screen readers');
assert.match(page, /class="tabs"[^>]*role="group"[^>]*data-i18n-aria-label="trendLabel"/, 'trend period controls must expose a localized group label');
assert.match(page, /data-period="yearly"[^>]*aria-pressed="true"/, 'the active trend period must expose its selected state');
assert.match(page, /id="trend-chart"[^>]*role="img"[^>]*data-i18n-aria-label="trendTitle"/, 'trend chart must have a localized accessible name');
assert.match(page, /china-dashboard-i18n\.js\?v=4/, 'nationality dashboard must load the retry-translation asset version');
assert.match(page, /china-dashboard\.js\?v=9/, 'nationality dashboard must load the latest-request and busy-state asset version');
assert.match(client, /mode=nationalities/);
assert.match(client, /mode=nationality-detail/);
assert.match(client, /trend-line/);
assert.match(client, /outcome-line/);
assert.match(client, /pointerup/);
assert.match(client, /trend-chart'\)\.setAttribute\('aria-label', t\('countryTrend'/, 'selected country must update the trend chart accessible name');
assert.match(client, /item\.setAttribute\('aria-pressed', 'false'\)[\s\S]*button\.setAttribute\('aria-pressed', 'true'\)/, 'trend period selection must keep aria-pressed in sync');
assert.match(client, /function outcomeAriaLabel\(row, label\)[\s\S]*t\('approved'\)[\s\S]*t\('denied'\)[\s\S]*t\('other'\)[\s\S]*t\('total'\)/, 'chart data labels must announce every outcome share and the total');
assert.match(client, /country-point-wrap[^\n]*aria-label="\$\{esc\(outcomeAriaLabel\(row, label\)\)\}"/, 'country comparison points must expose their values to screen readers');
assert.match(client, /trend-point[^\n]*aria-label="\$\{esc\(outcomeAriaLabel\(point, point\.label\)\)\}"/, 'trend points must expose their values to screen readers');
assert.match(client, /function retryButton\(scope, country = '', updateUrl = false\)/, 'nationality failures must render an in-page retry action');
assert.match(client, /data-retry="\$\{scope\}"[^>]*data-country="\$\{esc\(country\)\}"[^>]*data-update-url="\$\{updateUrl\}"[^>]*data-i18n="retryAction"/, 'detail retries must preserve the failed nationality, URL behavior, and live translation');
assert.match(client, /button\.dataset\.retry === 'directory'\) await load\(\)[\s\S]*else await selectCountry\(button\.dataset\.country, button\.dataset\.updateUrl === 'true'\)/, 'retry actions must reload only the failed data scope');
assert.match(page, /\.data-retry:focus-visible/, 'retry actions must expose a visible keyboard focus state');
assert.match(page, /class="quick-countries"[^>]*role="group"[^>]*data-i18n-aria-label="popularNationalities"/, 'popular nationality controls must expose a localized group label');
assert.match(page, /data-country="China"[^>]*aria-pressed="false"/, 'popular nationality buttons must expose their initial selection state');
assert.match(client, /country-card\$\{active \? ' active' : ''\}[^\n]*aria-pressed="\$\{active\}"/, 'directory buttons must expose the selected nationality');
assert.match(client, /button\.setAttribute\('aria-pressed', String\(selected\?\.nationality === button\.dataset\.country\)\)/, 'popular nationality selection state must stay synchronized');
assert.match(page, /id="country-detail"[^>]*aria-live="polite"[^>]*aria-busy="false"/, 'nationality details must expose their initial loading state');
assert.match(client, /const requestId = \+\+countryRequestId;[\s\S]*if \(requestId !== countryRequestId\) return;[\s\S]*if \(requestId === countryRequestId\).*aria-busy/, 'stale nationality responses must not replace the latest selection');
assert.match(client, /comparison-tooltip/);
const retryLabels = new Map(Object.entries({ en: 'Try again', es: 'Intentar de nuevo', fr: 'Réessayer', 'pt-BR': 'Tentar novamente', hi: 'फिर प्रयास करें', 'zh-Hans': '重新尝试', 'zh-Hant': '重新嘗試', ru: 'Повторить', ar: 'إعادة المحاولة', tr: 'Tekrar dene' }));
for (const locale of ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr']) {
  assert.match(i18nClient, new RegExp(`['"]${locale}['"]`));
  i18nSandbox.window.AsylumI18n.setLocale(locale, { updateUrl: false, dispatch: false });
  assert.equal(i18nSandbox.window.AsylumI18n.t('retryAction'), retryLabels.get(locale), `retry action must be translated for ${locale}`);
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

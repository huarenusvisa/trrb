import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

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
const standaloneProxy = readFileSync('asylumjudge/immigration-judges-proxy.js', 'utf8');
const detailPage = readFileSync('immigration-judge-approval-rate/detail.html', 'utf8');
const detailClient = readFileSync('immigration-judge-approval-rate/detail.js', 'utf8');
const routes = readFileSync('scripts/finalize-redirects.mjs', 'utf8');
const homepageClient = readFileSync('asylumjudge/site.js', 'utf8');
for (const label of ['全球申请人庇护裁决结果', '月度', '季度', '年度', '全部国籍']) assert.match(page, new RegExp(label));
assert.match(page, /主要国籍裁决结果对比图/);
assert.match(page, /id="country-comparison-chart"/);
assert.match(client, /mode=nationalities/);
assert.match(client, /mode=nationality-detail/);
assert.match(client, /trend-line/);
assert.match(client, /outcome-line/);
assert.match(client, /pointerup/);
assert.match(client, /comparison-tooltip/);
for (const locale of ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr']) assert.match(i18nClient, new RegExp(`['"]${locale}['"]`));
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

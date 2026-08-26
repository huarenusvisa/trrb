const { rest } = require('./_shared/supabase-admin');
const nationalityPeriodIndex = require('../../data/immigration-judge-nationality-periods.json');
const nationalityPeriodShards = [
  require('../../data/immigration-judge-nationality-periods-1.json'),
  require('../../data/immigration-judge-nationality-periods-2.json'),
  require('../../data/immigration-judge-nationality-periods-3.json'),
  require('../../data/immigration-judge-nationality-periods-4.json'),
  require('../../data/immigration-judge-nationality-periods-5.json'),
  require('../../data/immigration-judge-nationality-periods-6.json'),
  require('../../data/immigration-judge-nationality-periods-7.json'),
  require('../../data/immigration-judge-nationality-periods-8.json')
];
const judgeBackgrounds = require('../../data/immigration-judge-backgrounds.json');
const webexDirectory = require('../../data/eoir-webex-links.json');
const statePeriods = require('../../data/immigration-judge-state-periods.json');
const trendIndex = require('../../data/immigration-judge-trends.json');
const trendShards = [
  require('../../data/immigration-judge-trends-1.json'),
  require('../../data/immigration-judge-trends-2.json'),
  require('../../data/immigration-judge-trends-3.json'),
  require('../../data/immigration-judge-trends-4.json')
];
const nationalityYearIndex = require('../../data/immigration-judge-nationality-yearly.json');
const nationalityYearShards = [
  require('../../data/immigration-judge-nationality-yearly-1.json'),
  require('../../data/immigration-judge-nationality-yearly-2.json'),
  require('../../data/immigration-judge-nationality-yearly-3.json'),
  require('../../data/immigration-judge-nationality-yearly-4.json'),
  require('../../data/immigration-judge-nationality-yearly-5.json'),
  require('../../data/immigration-judge-nationality-yearly-6.json'),
  require('../../data/immigration-judge-nationality-yearly-7.json'),
  require('../../data/immigration-judge-nationality-yearly-8.json')
];

const MIN_RELIABLE_DECISIONS = 50;
const REST_PAGE_SIZE = 1000;
const REST_MAX_ROWS = 10000;
const out = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(body)
});
const num = (v) => Number(v || 0);
const nationalityCatalog = nationalityPeriodShards.flatMap((shard) => Array.isArray(shard.countries) ? shard.countries : []);
const nationalityPeriods = { ...nationalityPeriodIndex, countries: nationalityCatalog };

function normalizedName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:jr|sr|ii|iii|iv)\.?\b/gi, '')
    .replace(/[^a-zA-Z,' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function judgeNameKey(value) {
  const name = normalizedName(value);
  if (!name) return '';
  if (name.includes(',')) {
    const [last, rest] = name.split(',', 2);
    const first = String(rest || '').trim().split(/\s+/)[0];
    return first && last ? `${last.trim()}|${first}` : '';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts.at(-1)}|${parts[0]}` : parts[0];
}

const backgroundByName = new Map(
  (judgeBackgrounds.profiles || []).map((profile) => [profile.name_key || judgeNameKey(profile.judge_name), profile])
);
const webexByName = new Map(
  (webexDirectory.profiles || []).map((profile) => [profile.name_key || judgeNameKey(profile.judge_name), profile])
);
const nationalityYearByName = new Map(
  nationalityYearShards.flatMap((shard) => shard.profiles || []).map((profile) => [profile.name_key, profile.rows || []])
);
const judgeOutcomeByName = new Map(
  (statePeriods.judges || []).map((profile) => [profile.name_key, profile.yearly || []])
);
const stateMonthlyTrends = trendShards.flatMap((shard) => shard.states || []);
const courtMonthlyTrends = trendShards.flatMap((shard) => shard.courts || []);

function sumOutcomeRows(rows) {
  const fields = ['total_asylum_decisions', 'grants', 'denials', 'other_decisions', 'other_protection',
    'other_cancellation', 'other_adjustment', 'other_voluntary_departure',
    'other_withdrawn_or_terminated', 'other_administrative_closure'];
  const result = {};
  for (const field of fields) result[field] = (rows || []).reduce((sum, row) => sum + num(row[field]), 0);
  result.data_start_date = (rows || []).map((row) => row.data_start_date).filter(Boolean).sort()[0] || null;
  result.data_end_date = (rows || []).map((row) => row.data_end_date).filter(Boolean).sort().at(-1) || null;
  return result;
}

function withOfficialOutcomes(row, fiscalYear = null) {
  const periods = judgeOutcomeByName.get(judgeNameKey(row?.judge_name)) || [];
  const selected = fiscalYear == null ? periods : periods.filter((period) => Number(period.fiscal_year) === Number(fiscalYear));
  return selected.length ? { ...row, ...(fiscalYear == null ? sumOutcomeRows(selected) : selected[0]) } : row;
}

function backgroundSummary(judgeName) {
  const background = backgroundByName.get(judgeNameKey(judgeName));
  if (!background) return null;
  const biography = String(background.biography || '').trim();
  return {
    appointment_date: background.appointment_date || null,
    appointment_court: background.appointment_court || null,
    appointment_type: background.appointment_type || null,
    biography_excerpt: biography ? `${biography.slice(0, 190)}${biography.length > 190 ? '…' : ''}` : null
  };
}

function findNationality(value) {
  const query = String(value || '').trim().toLowerCase();
  if (!query) return null;
  return nationalityCatalog.find((row) => [row.nationality, row.nationality_zh, row.nationality_code]
    .filter(Boolean)
    .some((candidate) => String(candidate).trim().toLowerCase() === query))
    || nationalityCatalog.find((row) => [row.nationality, row.nationality_zh, row.nationality_code]
      .filter(Boolean)
      .some((candidate) => String(candidate).trim().toLowerCase().includes(query)));
}

function nationalitySummary(row) {
  if (!row) return null;
  const { monthly, quarterly, yearly, ...summary } = row;
  return summary;
}

async function nationalityJudges(country) {
  if (!country) return [];
  const code = String(country.nationality_code || '').trim();
  const query = {
    select: 'judge_id,nationality,nationality_code,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date',
    order: 'total_asylum_decisions.desc',
    limit: '1500'
  };
  if (/^[A-Za-z]{2,3}$/.test(code)) query.nationality_code = `eq.${code}`;
  else query.nationality = `eq.${country.nationality}`;
  let nat = await rest('immigration_judge_asylum_nationality', { query });
  if (!(nat || []).length && country.nationality) {
    nat = await rest('immigration_judge_asylum_nationality', {
      query: { ...query, nationality_code: undefined, nationality: `eq.${country.nationality}` }
    });
  }
  const ids = [...new Set((nat || []).map((row) => row.judge_id).filter(Boolean))];
  const batches = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    batches.push(rest('immigration_judges', {
      query: {
        select: 'id,judge_name,court_name,court_city,court_state,source,source_updated_at',
        id: `in.(${batch.join(',')})`,
        limit: String(batch.length)
      }
    }));
  }
  const judges = (await Promise.all(batches)).flat();
  const judgeMap = new Map((judges || []).map((judge) => [judge.id, judge]));
  return (nat || [])
    .map((row) => derived({ ...row, ...(judgeMap.get(row.judge_id) || {}) }))
    .filter((row) => row.judge_name)
    .sort((a, b) => Number(b.adjudicated_decisions || 0) - Number(a.adjudicated_decisions || 0));
}
const ASYLUM_KNOWLEDGE_TERMS = [
  '种族迫害', '宗教迫害', '国籍迫害', '政治观点', '政治意见', '特定社会群体',
  '五项受保护理由', '五项受保护原因', '过去迫害', '未来迫害', '迫害恐惧',
  '政府保护能力', '政府无法保护', '政府不愿保护', '迫害者'
];
const ASYLUM_KNOWLEDGE_EXCLUDES = [
  'advance parole', '旅行许可', '回美证', 'ead', '工卡', 'i-765', 'c08', 'c-8',
  '费用', '成本', '家属', 'i-730', '绿卡', '一年申请期限', '迟交例外', 'i-589',
  '材料清单', '办理流程', '时间节点', '申请资格', '适用人群'
];

function isFiveGroundsKnowledge(row) {
  const text = `${row.title || ''} ${row.summary || ''}`.toLowerCase();
  if (ASYLUM_KNOWLEDGE_EXCLUDES.some((term) => text.includes(term.toLowerCase()))) return false;
  return ASYLUM_KNOWLEDGE_TERMS.some((term) => text.includes(term.toLowerCase()));
}

async function restAll(table, { query = {}, pageSize = REST_PAGE_SIZE, maxRows = REST_MAX_ROWS } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await rest(table, {
      query: {
        ...query,
        limit: String(pageSize),
        offset: String(offset)
      }
    });
    if (!Array.isArray(page)) throw new Error(`${table} pagination returned a non-array response`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error(`${table} pagination exceeded ${maxRows} rows`);
}

function derived(row) {
  const grants = num(row.grants);
  const denials = num(row.denials);
  const total = num(row.total_asylum_decisions);
  const adjudicated = grants + denials;
  const calculatedRate = adjudicated ? grants / adjudicated * 100 : null;
  const rateReliable = adjudicated >= MIN_RELIABLE_DECISIONS;
  const webexProfile = webexByName.get(judgeNameKey(row.judge_name));
  return {
    ...row,
    decision_count: adjudicated,
    adjudicated_decisions: adjudicated,
    calculated_approval_rate: calculatedRate,
    approval_rate: rateReliable ? calculatedRate : null,
    adjudicated_approval_rate: rateReliable ? calculatedRate : null,
    grant_share_all: total ? grants / total * 100 : null,
    sample_level: adjudicated < MIN_RELIABLE_DECISIONS ? 'insufficient' : adjudicated < 200 ? 'medium' : 'large',
    sample_status: rateReliable ? 'reportable' : 'insufficient_sample',
    minimum_reportable_decisions: MIN_RELIABLE_DECISIONS,
    rate_reliable: rateReliable,
    background_summary: row.judge_name ? backgroundSummary(row.judge_name) : null,
    webex: webexProfile ? {
      links: webexProfile.links,
      source_url: webexDirectory.source_url,
      source_updated_at: webexDirectory.source_updated_at,
      telephonic_number: webexDirectory.telephonic_number,
      notice: webexDirectory.notice
    } : null
  };
}

function aggregate(rows) {
  const x = { judges: 0, total_asylum_decisions: 0, grants: 0, denials: 0, other_decisions: 0 };
  for (const r of rows || []) {
    x.judges += 1;
    x.total_asylum_decisions += num(r.total_asylum_decisions);
    x.grants += num(r.grants);
    x.denials += num(r.denials);
    x.other_decisions += num(r.other_decisions);
  }
  return derived(x);
}

async function provenance() {
  const [releases, batches] = await Promise.all([
    rest('immigration_judge_source_releases', {
      query: {
        select: 'source_key,source_name,source_url,release_label,source_period_start,source_period_end,official,fetch_status,observed_at,fetched_at,notes',
        official: 'eq.true',
        order: 'observed_at.desc',
        limit: '10'
      }
    }).catch(() => []),
    rest('immigration_judge_import_batches', {
      query: {
        select: 'id,source_name,source_url,source_date,status,input_rows,accepted_rows,completed_at,created_at,notes',
        status: 'eq.imported',
        order: 'completed_at.desc.nullslast,created_at.desc',
        limit: '1'
      }
    }).catch(() => [])
  ]);
  const latestImport = (batches || [])[0] || null;
  const officialRelease = (releases || []).find((x) => x.source_key === 'eoir_case_data') || null;
  const importIsDirectOfficial = Boolean(latestImport && /direct first-party|direct eoir/i.test(String(latestImport.source_name || '')));
  return {
    official_release: officialRelease,
    latest_import: latestImport,
    production_grade: importIsDirectOfficial,
    data_quality: importIsDirectOfficial ? 'direct_official' : 'provisional_derivative',
    methodology: {
      grant_rate_formula: 'grant_count / (grant_count + deny_count)',
      excluded_from_rate: 'other_or_excluded_count',
      minimum_reportable_decisions: MIN_RELIABLE_DECISIONS,
      small_sample_behavior: 'rate suppressed; display sample insufficient'
    }
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return out(405, { error: 'Method not allowed' });
  try {
    const p = event.queryStringParameters || {};
    const mode = String(p.mode || '');

    if (mode === 'freshness' || mode === 'provenance') {
      return out(200, await provenance());
    }

    if (mode === 'stats') {
      const rows = await restAll('immigration_judges', {
        query: { select: 'id,court_name,total_asylum_decisions', order: 'id.asc' }
      });
      const courts = new Set((rows || []).map((x) => x.court_name).filter(Boolean));
      return out(200, {
        judges: (rows || []).length,
        courts: courts.size,
        decisions: (rows || []).reduce((n, x) => n + num(x.total_asylum_decisions), 0),
        ...(await provenance())
      });
    }

    if (mode === 'all') {
      const rows = await restAll('immigration_judges', {
        query: {
          select: 'id,judge_name,court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date,source,source_updated_at',
          order: 'judge_name.asc,id.asc'
        }
      });
      const results = (rows || []).filter((row) => row.judge_name).map((row) => {
        const result = derived(withOfficialOutcomes(row));
        return { ...result, background: backgroundByName.get(judgeNameKey(row.judge_name)) || null };
      });
      return out(200, { count: results.length, results, ...(await provenance()) });
    }

    if (mode === 'top') {
      const requestedLimit = Number.parseInt(String(p.limit || '12'), 10);
      const limit = Math.min(24, Math.max(6, Number.isFinite(requestedLimit) ? requestedLimit : 12));
      const rows = await rest('immigration_judges', {
        query: {
          select: 'id,judge_name,court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date,source,source_updated_at',
          order: 'total_asylum_decisions.desc',
          limit: String(limit)
        }
      });
      return out(200, { count: (rows || []).length, results: (rows || []).map((row) => derived(withOfficialOutcomes(row))), ...(await provenance()) });
    }

    if (mode === 'knowledge') {
      const requestedLimit = Number.parseInt(String(p.limit || '4'), 10);
      const limit = Math.min(8, Math.max(3, Number.isFinite(requestedLimit) ? requestedLimit : 4));
      const candidates = await rest('articles', {
        query: {
          select: 'id,title,slug,summary,category_name,published_at',
          status: 'eq.published',
          visibility: 'eq.public',
          category_name: 'like.移民美国·人道主义庇护·政治庇护·*',
          order: 'published_at.desc.nullslast',
          limit: '120'
        }
      });
      const rows = (candidates || [])
        .filter(isFiveGroundsKnowledge)
        .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
        .slice(0, limit);
      return out(200, {
        count: (rows || []).length,
        source: '唐人日报·政治庇护·五项法定理由',
        schedule: 'every_72_hours',
        results: rows || []
      });
    }

    if (mode === 'nationalities') {
      const query = String(p.q || '').trim().toLowerCase();
      const countries = nationalityCatalog
        .filter((row) => !query || [row.nationality, row.nationality_zh, row.nationality_code]
          .filter(Boolean)
          .some((candidate) => String(candidate).toLowerCase().includes(query)))
        .map(nationalitySummary);
      return out(200, {
        count: countries.length,
        total_countries: nationalityCatalog.length,
        countries,
        source_snapshot_date: nationalityPeriods.source_snapshot_date,
        scope_start: nationalityPeriods.scope_start,
        scope_end: nationalityPeriods.scope_end,
        minimum_reportable_decisions: nationalityPeriods.minimum_reportable_decisions,
        ...(await provenance())
      });
    }

    if (mode === 'nationality-detail') {
      const country = findNationality(p.country || p.q);
      if (!country) return out(404, { error: 'nationality_not_found' });
      const judges = await nationalityJudges(country);
      return out(200, {
        country: nationalitySummary(country),
        periods: { monthly: country.monthly || [], quarterly: country.quarterly || [], yearly: country.yearly || [] },
        judges,
        source_snapshot_date: nationalityPeriods.source_snapshot_date,
        scope_start: nationalityPeriods.scope_start,
        scope_end: nationalityPeriods.scope_end,
        minimum_reportable_decisions: nationalityPeriods.minimum_reportable_decisions,
        ...(await provenance())
      });
    }

    if (mode === 'china') {
      const country = findNationality('China');
      const results = await nationalityJudges(country);
      return out(200, {
        count: results.length,
        results,
        country: nationalitySummary(country),
        periods: { monthly: country?.monthly || [], quarterly: country?.quarterly || [], yearly: country?.yearly || [] },
        source_snapshot_date: nationalityPeriods.source_snapshot_date,
        ...(await provenance())
      });
    }

    if (mode === 'courts') {
      const q = String(p.q || '').trim().toLowerCase();
      const state = String(p.state || '').trim().toUpperCase();
      const availableYears = (statePeriods.years || []).map(Number).filter(Number.isFinite);
      const requestedYear = Number.parseInt(String(p.fy || ''), 10);
      const fiscalYear = availableYears.includes(requestedYear) ? requestedYear : Number(statePeriods.latest_fiscal_year || availableYears[0]);
      const courts = (statePeriods.courts || [])
        .filter((row) => !state || String(row.state || '').toUpperCase() === state)
        .filter((row) => !q || `${row.court_name || ''} ${row.court_code || ''} ${row.state || ''}`.toLowerCase().includes(q))
        .map((row) => {
          const period = (row.yearly || []).find((item) => Number(item.fiscal_year) === fiscalYear);
          const city = String(row.court_name || '').replace(/\s*\([^)]*\)\s*$/, '');
          return period ? derived({ ...period, court_name: row.court_name, court_city: city, court_state: row.state, court_code: row.court_code }) : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.total_asylum_decisions - a.total_asylum_decisions);
      return out(200, {
        count: courts.length,
        fiscal_year: fiscalYear,
        period_status: fiscalYear === Number(statePeriods.latest_fiscal_year) ? statePeriods.latest_period_status : 'complete',
        period_end: fiscalYear === Number(statePeriods.latest_fiscal_year) ? statePeriods.scope_end : `${fiscalYear}-09-30`,
        courts: courts.slice(0, 300),
        ...(await provenance())
      });
    }

    if (mode === 'court-detail') {
      const court = String(p.court || '').trim();
      const state = String(p.state || '').trim().toUpperCase();
      if (!court) return out(400, { error: 'missing_court' });
      const courtQuery = {
        select: 'id,judge_name,court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date,source,source_updated_at',
        court_name: `eq.${court}`,
        order: 'total_asylum_decisions.desc',
        limit: '500'
      };
      if (state) courtQuery.court_state = `eq.${state}`;
      const rows = await rest('immigration_judges', {
        query: courtQuery
      });
      if (!(rows || []).length) return out(404, { error: 'not_found' });
      const requestedYear = Number.parseInt(String(p.fy || ''), 10);
      const fiscalYear = (statePeriods.years || []).map(Number).includes(requestedYear) ? requestedYear : Number(statePeriods.latest_fiscal_year);
      const staticRows = (statePeriods.court_judges || []).filter((item) => item.court_name === court && (!state || item.state === state) && Number(item.fiscal_year) === fiscalYear);
      const dbByName = new Map((rows || []).map((row) => [judgeNameKey(row.judge_name), row]));
      const judges = staticRows.length
        ? staticRows.map((item) => derived({ ...(dbByName.get(item.name_key) || {}), ...item }))
        : (rows || []).map((row) => derived(withOfficialOutcomes(row, fiscalYear)));
      const courtPeriod = (statePeriods.courts || []).find((item) => item.court_name === court && (!state || item.state === state))?.yearly?.find((item) => Number(item.fiscal_year) === fiscalYear);
      return out(200, { fiscal_year: fiscalYear, court: { court_name: rows[0].court_name, court_city: rows[0].court_city, court_state: rows[0].court_state, ...derived(courtPeriod || aggregate(judges)) }, judges, ...(await provenance()) });
    }

    if (mode === 'states') {
      const availableYears = (statePeriods.years || []).map(Number).filter(Number.isFinite);
      const requestedYear = Number.parseInt(String(p.fy || ''), 10);
      const fiscalYear = availableYears.includes(requestedYear) ? requestedYear : Number(statePeriods.latest_fiscal_year || availableYears[0]);
      const states = (statePeriods.states || [])
        .map((state) => ({ state: state.state, ...(state.yearly || []).find((row) => Number(row.fiscal_year) === fiscalYear) }))
        .filter((row) => row.fiscal_year)
        .map(derived)
        .sort((a, b) => b.total_asylum_decisions - a.total_asylum_decisions);
      const national = derived((statePeriods.national || []).find((row) => Number(row.fiscal_year) === fiscalYear) || {});
      return out(200, {
        fiscal_year: fiscalYear,
        available_fiscal_years: availableYears,
        period_status: fiscalYear === Number(statePeriods.latest_fiscal_year) ? statePeriods.latest_period_status : 'complete',
        period_end: fiscalYear === Number(statePeriods.latest_fiscal_year) ? statePeriods.scope_end : `${fiscalYear}-09-30`,
        source_snapshot_date: statePeriods.source_snapshot_date,
        attribution: statePeriods.attribution,
        states,
        national,
        ...(await provenance())
      });
    }

    if (mode === 'state-trend') {
      const state = String(p.state || 'NY').trim().toUpperCase();
      const court = String(p.court || '').trim().toUpperCase();
      const interval = String(p.interval || 'month').toLowerCase() === 'year' ? 'year' : 'month';
      const stateYear = (statePeriods.states || []).find((item) => item.state === state);
      const stateMonth = stateMonthlyTrends.find((item) => item.state === state);
      const courtYear = court ? (statePeriods.courts || []).find((item) => item.court_code === court) : null;
      const courtMonth = court ? courtMonthlyTrends.find((item) => item.court_code === court) : null;
      if (court && !courtYear && !courtMonth) return out(404, { error: 'court_not_found' });
      if (!court && !stateYear && !stateMonth) return out(404, { error: 'state_not_found' });
      const yearly = court ? courtYear?.yearly : stateYear?.yearly;
      const monthly = court ? courtMonth?.monthly : stateMonth?.monthly;
      const periods = interval === 'year'
        ? (yearly || []).slice().sort((a, b) => Number(a.fiscal_year) - Number(b.fiscal_year)).map((row) => derived({ ...row, period: `FY ${row.fiscal_year}` }))
        : (monthly || []).slice(-24).map((row) => derived(row));
      return out(200, {
        state: court ? courtYear?.state || courtMonth?.state : state,
        court_code: court || null,
        court_name: court ? courtYear?.court_name || courtMonth?.court_name : null,
        interval,
        periods,
        source_snapshot_date: trendIndex.source_snapshot_date || statePeriods.source_snapshot_date,
        scope_start: trendIndex.scope_start || statePeriods.scope_start,
        scope_end: trendIndex.scope_end || statePeriods.scope_end,
        methodology: statePeriods.methodology,
        ...(await provenance())
      });
    }

    if (mode === 'trend-locations') {
      const locations = (statePeriods.courts || []).map((item) => ({ state: item.state, court_code: item.court_code, court_name: item.court_name }))
        .sort((a, b) => a.court_name.localeCompare(b.court_name));
      return out(200, { locations, source_snapshot_date: statePeriods.source_snapshot_date });
    }

    if (mode === 'detail') {
      const id = String(p.id || '').trim();
      if (!id) return out(400, { error: 'missing_id' });
      const judges = await rest('immigration_judges', { query: { select: '*', id: `eq.${id}`, limit: '1' } });
      const judge = (judges || [])[0];
      if (!judge) return out(404, { error: 'not_found' });
      const [yearly, nationality] = await Promise.all([
        rest('immigration_judge_asylum_yearly', { query: { select: 'fiscal_year,total_asylum_decisions,grants,denials,other_decisions,approval_rate,denial_rate', judge_id: `eq.${id}`, order: 'fiscal_year.asc', limit: '100' } }),
        rest('immigration_judge_asylum_nationality', { query: { select: 'nationality,nationality_code,total_asylum_decisions,grants,denials,other_decisions,approval_rate,data_start_date,data_end_date', judge_id: `eq.${id}`, order: 'total_asylum_decisions.desc', limit: '250' } })
      ]);
      return out(200, {
        judge: derived(withOfficialOutcomes(judge)),
        yearly: (judgeOutcomeByName.get(judgeNameKey(judge.judge_name)) || yearly || []).map(derived),
        nationality: (nationality || []).map(derived),
        nationality_yearly: nationalityYearByName.get(judgeNameKey(judge.judge_name)) || [],
        nationality_yearly_source: {
          source_snapshot_date: nationalityYearIndex.source_snapshot_date,
          scope_start: nationalityYearIndex.scope_start,
          scope_end: nationalityYearIndex.scope_end
        },
        background: backgroundByName.get(judgeNameKey(judge.judge_name)) || null,
        background_policy: judgeBackgrounds.source_policy,
        ...(await provenance())
      });
    }

    const q = String(p.q || '').trim().slice(0, 100);
    if (!q) return out(200, { results: [], ...(await provenance()) });
    const safe = q.replace(/[,%()]/g, ' ').trim();
    const rows = await rest('immigration_judges', {
      query: {
        select: 'id,judge_name,court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions,approval_rate,denial_rate,data_start_date,data_end_date,source,source_updated_at',
        or: `(judge_name.ilike.*${safe}*,court_name.ilike.*${safe}*,court_city.ilike.*${safe}*,court_state.ilike.*${safe}*)`,
        order: 'total_asylum_decisions.desc',
        limit: '50'
      }
    });
    return out(200, { query: q, count: (rows || []).length, results: (rows || []).map((row) => derived(withOfficialOutcomes(row))), ...(await provenance()) });
  } catch (e) {
    console.error('immigration judges api', e);
    return out(500, { error: 'database_unavailable' });
  }
};

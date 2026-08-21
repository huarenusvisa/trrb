const { rest } = require('./_shared/supabase-admin');

const MIN_RELIABLE_DECISIONS = 50;
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

function derived(row) {
  const grants = num(row.grants);
  const denials = num(row.denials);
  const total = num(row.total_asylum_decisions);
  const adjudicated = grants + denials;
  const calculatedRate = adjudicated ? grants / adjudicated * 100 : null;
  const rateReliable = adjudicated >= MIN_RELIABLE_DECISIONS;
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
    rate_reliable: rateReliable
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
      const rows = await rest('immigration_judges', { query: { select: 'court_name,total_asylum_decisions', limit: '5000' } });
      const courts = new Set((rows || []).map((x) => x.court_name).filter(Boolean));
      return out(200, {
        judges: (rows || []).length,
        courts: courts.size,
        decisions: (rows || []).reduce((n, x) => n + num(x.total_asylum_decisions), 0),
        ...(await provenance())
      });
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
      return out(200, { count: (rows || []).length, results: (rows || []).map(derived), ...(await provenance()) });
    }

    if (mode === 'china') {
      const nat = await rest('immigration_judge_asylum_nationality', {
        query: {
          select: 'judge_id,nationality,nationality_code,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date',
          or: '(nationality.ilike.*China*,nationality.ilike.*中国*,nationality_code.eq.CHN)',
          order: 'total_asylum_decisions.desc',
          limit: '1000'
        }
      });
      const ids = [...new Set((nat || []).map((x) => x.judge_id).filter(Boolean))];
      if (!ids.length) return out(200, { count: 0, results: [], ...(await provenance()) });
      // Keep PostgREST URLs below proxy/CDN limits. A single China query can
      // contain hundreds of judge UUIDs, and one giant `in.(...)` filter can
      // exceed the upstream request-line limit even though the data is valid.
      const judgeBatches = [];
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        judgeBatches.push(rest('immigration_judges', {
          query: {
            select: 'id,judge_name,court_name,court_city,court_state,source,source_updated_at',
            id: `in.(${batch.join(',')})`,
            limit: String(batch.length)
          }
        }));
      }
      const judges = (await Promise.all(judgeBatches)).flat();
      const jm = new Map((judges || []).map((j) => [j.id, j]));
      const results = (nat || []).map((x) => derived({ ...x, ...(jm.get(x.judge_id) || {}) })).filter((x) => x.judge_name);
      return out(200, { count: results.length, results, ...(await provenance()) });
    }

    if (mode === 'courts') {
      const q = String(p.q || '').trim().toLowerCase();
      const rows = await rest('immigration_judges', { query: { select: 'court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions', limit: '5000' } });
      const map = new Map();
      for (const r of rows || []) {
        const key = [r.court_name, r.court_city, r.court_state].join('|');
        if (q && !`${r.court_name || ''} ${r.court_city || ''} ${r.court_state || ''}`.toLowerCase().includes(q)) continue;
        const x = map.get(key) || { court_name: r.court_name, court_city: r.court_city, court_state: r.court_state, judges: 0, total_asylum_decisions: 0, grants: 0, denials: 0, other_decisions: 0 };
        x.judges += 1;
        x.total_asylum_decisions += num(r.total_asylum_decisions);
        x.grants += num(r.grants);
        x.denials += num(r.denials);
        x.other_decisions += num(r.other_decisions);
        map.set(key, x);
      }
      const courts = [...map.values()].map(derived).sort((a, b) => b.total_asylum_decisions - a.total_asylum_decisions);
      return out(200, { count: courts.length, courts: courts.slice(0, 300), ...(await provenance()) });
    }

    if (mode === 'court-detail') {
      const court = String(p.court || '').trim();
      if (!court) return out(400, { error: 'missing_court' });
      const safe = court.replace(/[,%()]/g, ' ').trim();
      const rows = await rest('immigration_judges', {
        query: {
          select: 'id,judge_name,court_name,court_city,court_state,total_asylum_decisions,grants,denials,other_decisions,data_start_date,data_end_date,source,source_updated_at',
          court_name: `ilike.*${safe}*`,
          order: 'total_asylum_decisions.desc',
          limit: '500'
        }
      });
      if (!(rows || []).length) return out(404, { error: 'not_found' });
      const judges = (rows || []).map(derived);
      return out(200, { court: { court_name: rows[0].court_name, court_city: rows[0].court_city, court_state: rows[0].court_state, ...aggregate(rows) }, judges, ...(await provenance()) });
    }

    if (mode === 'states') {
      const rows = await rest('immigration_judges', { query: { select: 'court_name,court_state,total_asylum_decisions,grants,denials,other_decisions', limit: '5000' } });
      const map = new Map();
      for (const r of rows || []) {
        const state = r.court_state || 'Unknown';
        const x = map.get(state) || { state, courts: new Set(), judges: 0, total_asylum_decisions: 0, grants: 0, denials: 0, other_decisions: 0 };
        if (r.court_name) x.courts.add(r.court_name);
        x.judges += 1;
        x.total_asylum_decisions += num(r.total_asylum_decisions);
        x.grants += num(r.grants);
        x.denials += num(r.denials);
        x.other_decisions += num(r.other_decisions);
        map.set(state, x);
      }
      const states = [...map.values()].map((x) => derived({ ...x, courts: x.courts.size })).sort((a, b) => b.total_asylum_decisions - a.total_asylum_decisions);
      return out(200, { states, ...(await provenance()) });
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
      return out(200, { judge: derived(judge), yearly: (yearly || []).map(derived), nationality: (nationality || []).map(derived), ...(await provenance()) });
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
    return out(200, { query: q, count: (rows || []).length, results: (rows || []).map(derived), ...(await provenance()) });
  } catch (e) {
    console.error('immigration judges api', e);
    return out(500, { error: 'database_unavailable' });
  }
};

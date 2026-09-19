const { rest } = require('./_shared/supabase-admin');
const fallback = require('../../data/uscis-asylum-snapshot.json');

const out = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(body)
});
const num = (value) => Number(value || 0);

function summarizeOfficeRows(rows) {
  const byOffice = new Map();
  for (const row of rows || []) {
    const name = String(row.office || '').trim();
    if (!name) continue;
    const current = byOffice.get(name) || {
      office: name, applications_received: 0, cases_completed: 0, cases_pending: 0,
      interviews_completed: 0, grants: 0, deny_referrals: 0, admin_close_dismissals: 0,
      period_start: row.period, period_end: row.period, has_suppressed_values: false
    };
    for (const field of ['applications_received', 'cases_completed', 'interviews_completed', 'grants', 'deny_referrals', 'admin_close_dismissals']) {
      current[field] += num(row[field]);
    }
    if (String(row.period) >= String(current.period_end)) {
      current.period_end = row.period;
      current.cases_pending = row.cases_pending == null ? current.cases_pending : num(row.cases_pending);
    }
    if (String(row.period) < String(current.period_start)) current.period_start = row.period;
    current.has_suppressed_values ||= Boolean(row.has_suppressed_values);
    byOffice.set(name, current);
  }
  return [...byOffice.values()].map((row) => {
    const denominator = row.grants + row.deny_referrals;
    return { ...row, grant_rate: denominator ? row.grants / denominator * 100 : null };
  }).sort((a, b) => b.cases_completed - a.cases_completed || a.office.localeCompare(b.office));
}

function nationalSummary(offices) {
  const summary = {
    applications_received: 0, cases_completed: 0, cases_pending: 0, interviews_completed: 0,
    grants: 0, deny_referrals: 0, admin_close_dismissals: 0, offices: offices.length
  };
  for (const row of offices) for (const field of Object.keys(summary)) {
    if (field !== 'offices') summary[field] += num(row[field]);
  }
  const denominator = summary.grants + summary.deny_referrals;
  summary.grant_rate = denominator ? summary.grants / denominator * 100 : null;
  return summary;
}

function nationalitySummary(rows) {
  const countries = new Map();
  for (const row of rows || []) {
    const name = String(row.nationality || '').trim();
    if (!name) continue;
    const current = countries.get(name) || { nationality: name, applications_received: 0, has_suppressed_values: false };
    current.applications_received += num(row.applications_received);
    current.has_suppressed_values ||= Boolean(row.has_suppressed_values);
    countries.set(name, current);
  }
  return [...countries.values()].sort((a, b) => b.applications_received - a.applications_received);
}

async function loadData() {
  try {
    const releases = await rest('uscis_asylum_data_releases', {
      query: { select: 'id,source_url,source_title,fiscal_year,period_end,fetched_at,metadata', official: 'eq.true', status: 'eq.published', order: 'period_end.desc.nullslast,fetched_at.desc', limit: '1' }
    });
    const release = releases?.[0];
    if (!release) throw new Error('no release');
    const [offices, nationalities] = await Promise.all([
      rest('uscis_asylum_office_monthly', { query: { select: 'office,fiscal_year,period,applications_received,cases_completed,cases_pending,interviews_completed,grants,deny_referrals,admin_close_dismissals,has_suppressed_values', release_id: `eq.${release.id}`, order: 'period.asc,office.asc', limit: '5000' } }),
      rest('uscis_asylum_nationality_monthly', { query: { select: 'nationality,fiscal_year,period,applications_received,has_suppressed_values', release_id: `eq.${release.id}`, order: 'period.asc,nationality.asc', limit: '5000' } })
    ]);
    return {
      source: { agency: 'U.S. Citizenship and Immigration Services', title: release.source_title, url: release.source_url, fiscal_year: release.fiscal_year, period_end: release.period_end, official: true, retrieved_at: release.fetched_at },
      methodology: release.metadata?.methodology || fallback.methodology,
      offices: offices || [], nationalities: nationalities || [], storage: 'database'
    };
  } catch (error) {
    console.warn('USCIS asylum database fallback', error.message);
    return { ...fallback, storage: 'bundled_official_snapshot' };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return out(405, { error: 'method_not_allowed' });
  try {
    const data = await loadData();
    const params = event.queryStringParameters || {};
    const mode = String(params.mode || 'overview');
    const officeRows = data.offices || [];
    const offices = summarizeOfficeRows(officeRows);
    const common = { source: data.source, methodology: data.methodology, storage: data.storage };

    if (mode === 'offices' || mode === 'overview') {
      return out(200, { ...common, national: nationalSummary(offices), offices });
    }
    if (mode === 'office') {
      const office = String(params.office || '').trim().toLowerCase();
      const selected = offices.find((row) => row.office.toLowerCase() === office);
      if (!selected) return out(404, { error: 'office_not_found' });
      const periods = officeRows.filter((row) => String(row.office || '').trim().toLowerCase() === office).sort((a, b) => String(a.period).localeCompare(String(b.period)));
      return out(200, { ...common, office: selected, periods });
    }
    if (mode === 'nationalities') {
      return out(200, { ...common, nationalities: nationalitySummary(data.nationalities || []) });
    }
    return out(400, { error: 'unsupported_mode' });
  } catch (error) {
    console.error('USCIS asylum data API', error);
    return out(500, { error: 'uscis_asylum_data_unavailable' });
  }
};

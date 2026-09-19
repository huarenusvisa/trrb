const UPSTREAM = 'https://trrb.net/.netlify/functions/uscis-asylum-data';
const fallback = require('./uscis-asylum-snapshot.json');

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
  'Access-Control-Allow-Origin': '*'
};
const out = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
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
    for (const field of ['applications_received', 'cases_completed', 'interviews_completed', 'grants', 'deny_referrals', 'admin_close_dismissals']) current[field] += num(row[field]);
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
  const result = { applications_received: 0, cases_completed: 0, cases_pending: 0, interviews_completed: 0, grants: 0, deny_referrals: 0, admin_close_dismissals: 0, offices: offices.length };
  for (const row of offices) for (const field of Object.keys(result)) if (field !== 'offices') result[field] += num(row[field]);
  const denominator = result.grants + result.deny_referrals;
  result.grant_rate = denominator ? result.grants / denominator * 100 : null;
  return result;
}

function localFallback(event) {
  const params = event.queryStringParameters || {};
  const mode = String(params.mode || 'overview');
  const officeRows = fallback.offices || [];
  const offices = summarizeOfficeRows(officeRows);
  const common = { source: fallback.source, methodology: fallback.methodology, storage: 'bundled_official_snapshot' };
  if (mode === 'overview' || mode === 'offices') return out(200, { ...common, national: nationalSummary(offices), offices });
  if (mode === 'office') {
    const office = String(params.office || '').trim().toLowerCase();
    const selected = offices.find((row) => row.office.toLowerCase() === office);
    if (!selected) return out(404, { error: 'office_not_found' });
    const periods = officeRows.filter((row) => String(row.office || '').trim().toLowerCase() === office).sort((a, b) => String(a.period).localeCompare(String(b.period)));
    return out(200, { ...common, office: selected, periods });
  }
  return out(400, { error: 'unsupported_mode' });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  try {
    const url = new URL(UPSTREAM);
    for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    const body = await response.text();
    if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
    const parsed = JSON.parse(body);
    const mode = String(event.queryStringParameters?.mode || 'overview');
    if ((mode === 'overview' || mode === 'offices') && !Array.isArray(parsed.offices)) throw new Error('upstream overview is incomplete');
    if (mode === 'office' && !Array.isArray(parsed.periods)) throw new Error('upstream office trend is incomplete');
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': response.headers.get('cache-control') || 'public, max-age=300, stale-while-revalidate=3600',
        'Access-Control-Allow-Origin': '*'
      },
      body
    };
  } catch (error) {
    console.warn('AsylumJudge USCIS data proxy fallback', error.message);
    return localFallback(event);
  }
};

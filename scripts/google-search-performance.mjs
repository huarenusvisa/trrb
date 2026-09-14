// Search Analytics dates are inclusive Pacific dates, not UTC dates.
// API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
// Load/paging: https://developers.google.com/webmaster-tools/limits
const DAY_MS = 86400000;
const METRIC_KEYS = ['clicks', 'impressions', 'ctr', 'averagePosition'];
const DIMENSIONS = {
  country: ['country'],
  page: ['page'],
  query: ['query'],
  countryPage: ['country', 'page'],
  countryQuery: ['country', 'query'],
};

function shiftDate(isoDate, days) {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function searchPerformanceWindows(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => parts.find((value) => value.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const endDate = shiftDate(today, -3);
  const startDate = shiftDate(endDate, -27);
  return {
    daysPerWindow: 28,
    timeZone: 'America/Los_Angeles',
    requestedDataState: 'final',
    reportingLagDays: 3,
    current: { startDate, endDate },
    previous: { startDate: shiftDate(startDate, -28), endDate: shiftDate(startDate, -1) },
  };
}

function metrics(row) {
  const clicks = Number(row.clicks) || 0;
  const impressions = Number(row.impressions) || 0;
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    averagePosition: impressions && row.position != null && Number.isFinite(Number(row.position)) ? Number(row.position) : null,
  };
}

function summarizeDaily(rows) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const knownPosition = rows.every((row) => !row.impressions || row.averagePosition !== null);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    averagePosition: impressions && knownPosition
      ? rows.reduce((sum, row) => sum + (row.averagePosition || 0) * row.impressions, 0) / impressions
      : null,
  };
}

function change(current, previous) {
  if (!current || !previous) return null;
  return {
    clicks: current.clicks - previous.clicks,
    clicksPercent: previous.clicks ? (current.clicks - previous.clicks) / previous.clicks * 100 : null,
    impressions: current.impressions - previous.impressions,
    impressionsPercent: previous.impressions ? (current.impressions - previous.impressions) / previous.impressions * 100 : null,
    ctrPercentagePoints: (current.ctr - previous.ctr) * 100,
    averagePosition: current.averagePosition !== null && previous.averagePosition !== null
      ? current.averagePosition - previous.averagePosition : null,
  };
}

export function compareReturnedRows(current, previous, dimensions) {
  const key = (row) => JSON.stringify(dimensions.map((name) => row[name]));
  const currentMap = new Map((current.rows || []).map((row) => [key(row), row]));
  const previousMap = new Map((previous.rows || []).map((row) => [key(row), row]));
  return [...new Set([...currentMap.keys(), ...previousMap.keys()])].map((id) => {
    const now = currentMap.get(id) || null;
    const before = previousMap.get(id) || null;
    return {
      ...Object.fromEntries(dimensions.map((name) => [name, (now || before)[name]])),
      current: now ? Object.fromEntries(METRIC_KEYS.map((name) => [name, now[name]])) : null,
      previous: before ? Object.fromEntries(METRIC_KEYS.map((name) => [name, before[name]])) : null,
      comparison: now && before ? 'observed_in_both_windows' : 'not_returned_in_one_window',
      delta: change(now, before),
    };
  });
}

// Dependency injection keeps fixture tests offline; this function never submits URLs.
export async function collectGoogleSearchPerformance({ query, siteUrl, now = new Date(), rowLimit = 500, maxPages = 2 }) {
  if (typeof query !== 'function') throw new TypeError('query must be a Search Analytics query function');
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 25000) throw new RangeError('rowLimit must be 1..25000');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 2) throw new RangeError('maxPages must be 1..2');
  const windows = searchPerformanceWindows(now);
  const warnings = [];
  let requestsMade = 0;
  let stoppedForQuotaOrPermission = false;
  const result = {
    channel: 'google', searchType: 'web', siteUrl, windows,
    units: { ctr: 'ratio_0_to_1', ctrDelta: 'percentage_points', country: 'ISO_3166_1_alpha_3', averagePositionDelta: 'positive_means_worse' },
    limits: { rowLimit, maxPagesPerBreakdown: maxPages, maximumRequests: 1 + Object.keys(DIMENSIONS).length * 2 * maxPages },
    notes: [
      'Google web search only. Bing, Discover and Google News are not included or combined.',
      'Breakdowns contain returned top rows, not an exhaustive inventory, even when pagination ends.',
      'Anonymized queries are omitted from query breakdowns; top-row/data limits also prevent sums from matching totals.',
      'Page-based aggregation differs from property totals. Do not add breakdown rows to obtain site totals.',
      'A missing breakdown row is unknown, not zero; country does not establish ethnicity or content preference.',
      'CTR changes are percentage points; percentage changes from a zero baseline are null.',
    ],
    current: null, previous: null, delta: null, breakdowns: {}, warnings,
  };

  async function fetchRows(dimensions, window, pages, limit, label) {
    const rows = [];
    const seen = new Set();
    let responseAggregationType = null;
    let requestCapReached = false;
    let duplicateRowsSkipped = 0;
    if (stoppedForQuotaOrPermission) return { status: 'unavailable', rows, reason: 'stopped_after_quota_or_permission_error', requestCapReached };
    for (let page = 0; page < pages; page += 1) {
      try {
        requestsMade += 1;
        const response = await query({
          siteUrl,
          requestBody: {
            ...window, dimensions, type: 'web', dataState: 'final',
            aggregationType: dimensions.includes('page') ? 'auto' : 'byProperty',
            rowLimit: limit, startRow: page * limit,
          },
        });
        const data = response.data || {};
        responseAggregationType = data.responseAggregationType || responseAggregationType;
        const pageRows = data.rows || [];
        for (const row of pageRows) {
          const id = JSON.stringify(row.keys);
          if (seen.has(id)) { duplicateRowsSkipped += 1; continue; }
          seen.add(id);
          rows.push({ ...Object.fromEntries(dimensions.map((name, index) => [name, row.keys?.[index] ?? null])), ...metrics(row) });
        }
        if (pageRows.length < limit) break;
        if (page === pages - 1) requestCapReached = true;
      } catch (error) {
        const status = Number(error.response?.status || error.code);
        const message = String(error.message || 'Search Analytics request failed');
        if ([401, 403, 429].includes(status) || /quota|rate.?limit/i.test(message)) stoppedForQuotaOrPermission = true;
        warnings.push(`${label}: ${message}`);
        return { status: rows.length ? 'partial' : 'unavailable', rows, responseAggregationType, requestCapReached, duplicateRowsSkipped, reason: message };
      }
    }
    if (requestCapReached) warnings.push(`${label}: request cap reached; only returned top rows are available`);
    if (duplicateRowsSkipped) warnings.push(`${label}: duplicate pagination rows skipped; equal-click ordering can be unstable`);
    return { status: 'available', rows, responseAggregationType, requestCapReached, duplicateRowsSkipped };
  }

  const daily = await fetchRows(['date'], { startDate: windows.previous.startDate, endDate: windows.current.endDate }, 1, 100, 'daily');
  result.daily = daily;
  result.notes.push('Dates with no data are omitted by the API; lastReturnedDate is not proof of the latest complete processing date.');
  if (daily.status === 'available') {
    for (const name of ['current', 'previous']) {
      const window = windows[name];
      const rows = daily.rows.filter((row) => row.date >= window.startDate && row.date <= window.endDate);
      result[name] = {
        ...window, ...summarizeDaily(rows), daysWithReturnedData: rows.length,
        lastReturnedDate: rows.map((row) => row.date).sort().at(-1) || null,
        responseAggregationType: daily.responseAggregationType,
      };
    }
    result.delta = change(result.current, result.previous);
  }

  // Sequential and bounded: no daily fan-out and no expensive page+query grouping.
  for (const [name, dimensions] of Object.entries(DIMENSIONS)) {
    const current = await fetchRows(dimensions, windows.current, maxPages, rowLimit, `${name}.current`);
    const previous = await fetchRows(dimensions, windows.previous, maxPages, rowLimit, `${name}.previous`);
    const comparisons = compareReturnedRows(current, previous, dimensions);
    result.breakdowns[name] = {
      dimensions, scope: 'returned_top_rows', current, previous,
      changes: comparisons,
      largestObservedClickLosses: comparisons.filter((row) => row.delta?.clicks < 0).sort((a, b) => a.delta.clicks - b.delta.clicks).slice(0, 20),
      largestObservedClickGains: comparisons.filter((row) => row.delta?.clicks > 0).sort((a, b) => b.delta.clicks - a.delta.clicks).slice(0, 20),
    };
  }
  const datasets = [daily, ...Object.values(result.breakdowns).flatMap((value) => [value.current, value.previous])];
  result.status = datasets.every((value) => value.status === 'available') ? 'available'
    : datasets.every((value) => value.status === 'unavailable') ? 'unavailable' : 'partial';
  result.limits.requestsMade = requestsMade;
  result.limits.stoppedForQuotaOrPermission = stoppedForQuotaOrPermission;
  return result;
}

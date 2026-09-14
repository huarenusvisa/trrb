import assert from 'node:assert/strict';
import test from 'node:test';
import { collectGoogleSearchPerformance, compareReturnedRows, searchPerformanceWindows } from './google-search-performance.mjs';

const NOW = new Date('2026-09-14T20:00:00Z');
const SITE = 'sc-domain:trrb.net';
const apiRow = (keys, clicks, impressions, position) => ({ keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });
const DAILY = [
  apiRow(['2026-08-01'], 10, 100, 2),
  apiRow(['2026-08-02'], 20, 1000, 10),
  apiRow(['2026-08-20'], 40, 200, 6),
  apiRow(['2026-09-10'], 20, 800, 2),
];

function fixtureQuery(calls, override) {
  return async (params) => {
    calls.push(params);
    const body = params.requestBody;
    if (override) {
      const response = override(body);
      if (response !== undefined) return response;
    }
    if (body.dimensions[0] === 'date') return { data: { rows: DAILY, responseAggregationType: 'byProperty' } };
    const current = body.endDate === '2026-09-11';
    const dimensions = body.dimensions;
    const key = dimensions.map((name) => ({ country: 'chn', page: 'https://trrb.net/us-news/report', query: '美国新闻进展' })[name]);
    return { data: {
      rows: body.startRow ? [] : [apiRow(key, current ? 3 : 5, current ? 50 : 70, current ? 4 : 3)],
      responseAggregationType: dimensions.includes('page') ? 'byPage' : 'byProperty',
    } };
  };
}

test('uses adjacent inclusive 28-day Pacific windows across UTC midnight and daylight saving', () => {
  assert.deepEqual(searchPerformanceWindows(NOW).current, { startDate: '2026-08-15', endDate: '2026-09-11' });
  assert.deepEqual(searchPerformanceWindows(NOW).previous, { startDate: '2026-07-18', endDate: '2026-08-14' });
  const midnight = searchPerformanceWindows(new Date('2026-09-14T00:30:00Z'));
  assert.deepEqual(midnight.current, { startDate: '2026-08-14', endDate: '2026-09-10' });
  const dst = searchPerformanceWindows(new Date('2026-11-04T12:00:00Z'));
  assert.deepEqual(dst.current, { startDate: '2026-10-05', endDate: '2026-11-01' });
  assert.deepEqual(dst.previous, { startDate: '2026-09-07', endDate: '2026-10-04' });
});

test('keeps property totals separate from limited query/page rows and uses weighted position', async () => {
  const calls = [];
  const report = await collectGoogleSearchPerformance({ query: fixtureQuery(calls), siteUrl: SITE, now: NOW });
  assert.equal(report.channel, 'google');
  assert.equal(report.searchType, 'web');
  assert.equal(report.status, 'available');
  assert.equal(report.current.clicks, 60);
  assert.equal(report.previous.clicks, 30);
  assert.equal(report.current.impressions, 1000);
  assert.equal(report.current.ctr, 0.06);
  assert.equal(report.current.averagePosition, 2.8);
  assert.equal(report.previous.averagePosition, 10200 / 1100);
  assert.equal(report.delta.clicks, 30);
  assert.equal(report.delta.clicksPercent, 100);
  assert.equal(report.current.daysWithReturnedData, 2);
  assert.equal(report.current.lastReturnedDate, '2026-09-10');
  assert.equal(report.breakdowns.query.current.rows[0].clicks, 3);
  assert.equal(report.breakdowns.countryPage.current.responseAggregationType, 'byPage');
  assert.equal(report.breakdowns.countryQuery.current.rows[0].country, 'chn');
  assert.equal(report.breakdowns.countryQuery.current.rows[0].query, '美国新闻进展');
  assert.equal(report.breakdowns.countryQuery.largestObservedClickLosses[0].delta.clicks, -2);
  assert.equal(report.limits.requestsMade, 11);
  assert.equal(calls[0].requestBody.startDate, '2026-07-18');
  for (const { siteUrl, requestBody } of calls) {
    assert.equal(siteUrl, SITE);
    assert.equal(requestBody.type, 'web');
    assert.equal(requestBody.dataState, 'final');
    assert.equal(requestBody.dimensions.includes('page') && requestBody.dimensions.includes('query'), false);
  }
  assert.ok(report.notes.some((note) => /Anonymized queries/.test(note)));
});

test('paginates with startRow and labels hard caps without claiming exhaustive coverage', async () => {
  const calls = [];
  const report = await collectGoogleSearchPerformance({
    siteUrl: SITE, now: NOW, rowLimit: 2, maxPages: 2,
    query: fixtureQuery(calls, (body) => {
      if (body.dimensions.join(',') !== 'page') return undefined;
      return { data: { rows: [0, 1].map((index) => apiRow([`https://trrb.net/story-${body.startRow + index}`], 10 - body.startRow - index, 100, 3)), responseAggregationType: 'byPage' } };
    }),
  });
  assert.deepEqual(calls.filter((call) => call.requestBody.dimensions.join(',') === 'page').map((call) => call.requestBody.startRow), [0, 2, 0, 2]);
  assert.equal(report.breakdowns.page.current.rows.length, 4);
  assert.equal(report.breakdowns.page.current.requestCapReached, true);
  assert.equal(report.breakdowns.page.scope, 'returned_top_rows');
  assert.ok(report.warnings.some((warning) => /page.current: request cap/.test(warning)));
  assert.ok(report.limits.requestsMade <= report.limits.maximumRequests);
});

test('does not turn a missing top-row into a fabricated zero or a 100 percent decline', () => {
  const now = { rows: [{ query: 'newly observed', clicks: 2, impressions: 10, ctr: 0.2, averagePosition: 4 }] };
  const before = { rows: [{ query: 'previously observed', clicks: 10, impressions: 100, ctr: 0.1, averagePosition: 3 }] };
  const comparison = compareReturnedRows(now, before, ['query']);
  assert.equal(comparison[0].previous, null);
  assert.equal(comparison[1].current, null);
  assert.ok(comparison.every((row) => row.delta === null && row.comparison === 'not_returned_in_one_window'));
});

test('retains successful data after a quota error and stops further expensive API calls', async () => {
  const calls = [];
  const report = await collectGoogleSearchPerformance({
    siteUrl: SITE, now: NOW,
    query: fixtureQuery(calls, (body) => {
      if (body.dimensions.join(',') === 'page') throw Object.assign(new Error('Search Analytics load quota exceeded'), { code: 429 });
    }),
  });
  assert.equal(report.status, 'partial');
  assert.equal(report.current.clicks, 60);
  assert.equal(report.breakdowns.country.current.status, 'available');
  assert.equal(report.breakdowns.page.current.status, 'unavailable');
  assert.equal(report.breakdowns.query.current.reason, 'stopped_after_quota_or_permission_error');
  assert.equal(report.limits.stoppedForQuotaOrPermission, true);
  assert.equal(calls.length, 4);
  assert.equal(report.warnings.length, 1);
});

test('permission failure produces unavailable/null data instead of a false zero-traffic report', async () => {
  let calls = 0;
  const report = await collectGoogleSearchPerformance({ siteUrl: SITE, now: NOW, query: async () => {
    calls += 1;
    throw Object.assign(new Error('Insufficient permission'), { response: { status: 403 } });
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, 'unavailable');
  assert.equal(report.current, null);
  assert.equal(report.previous, null);
  assert.equal(report.delta, null);
  assert.match(report.warnings[0], /permission/);
});

test('empty finalized report has zero counts and no invented percentage change or position', async () => {
  const report = await collectGoogleSearchPerformance({ siteUrl: SITE, now: NOW, query: async () => ({ data: {} }) });
  assert.equal(report.current.clicks, 0);
  assert.equal(report.current.averagePosition, null);
  assert.equal(report.current.lastReturnedDate, null);
  assert.equal(report.delta.clicksPercent, null);
  assert.equal(report.delta.impressionsPercent, null);
  assert.equal(report.delta.averagePosition, null);
});

test('rejects unbounded pagination before making a network request', async () => {
  let calls = 0;
  await assert.rejects(collectGoogleSearchPerformance({ siteUrl: SITE, query: async () => { calls += 1; }, maxPages: 3 }), /maxPages/);
  assert.equal(calls, 0);
});

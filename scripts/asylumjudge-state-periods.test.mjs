import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stateData = JSON.parse(readFileSync('data/immigration-judge-state-periods.json', 'utf8'));
const yearIndex = JSON.parse(readFileSync('data/immigration-judge-nationality-yearly.json', 'utf8'));
const yearShards = yearIndex.shards.flatMap((name) => JSON.parse(readFileSync(`data/${name}`, 'utf8')).profiles || []);

assert.deepEqual(stateData.years.slice(0, 3), [2026, 2025, 2024], 'latest fiscal years must be newest first');
assert.equal(stateData.states.length, 32, 'all mapped states and territories in this snapshot must be present');
assert.equal(stateData.courts.length, 77, 'all source court codes must be mapped');
assert.ok(!stateData.states.some((row) => !row.state || /unknown/i.test(row.state)), 'no state may be unknown');

for (const national of stateData.national) {
  const year = Number(national.fiscal_year);
  const stateRows = stateData.states.map((state) => state.yearly.find((row) => Number(row.fiscal_year) === year)).filter(Boolean);
  const courtRows = stateData.courts.map((court) => court.yearly.find((row) => Number(row.fiscal_year) === year)).filter(Boolean);
  for (const field of ['total_asylum_decisions', 'grants', 'denials', 'other_decisions']) {
    assert.equal(stateRows.reduce((sum, row) => sum + Number(row[field] || 0), 0), Number(national[field] || 0), `FY ${year} state ${field} must equal national`);
    assert.equal(courtRows.reduce((sum, row) => sum + Number(row[field] || 0), 0), Number(national[field] || 0), `FY ${year} court ${field} must equal national`);
  }
  assert.equal(Number(national.total_asylum_decisions), Number(national.grants) + Number(national.denials) + Number(national.other_decisions), `FY ${year} outcomes must reconcile`);
}

for (const state of stateData.states) {
  for (const period of state.yearly) {
    const courtPeriods = stateData.courts
      .filter((court) => court.state === state.state)
      .map((court) => court.yearly.find((row) => Number(row.fiscal_year) === Number(period.fiscal_year)))
      .filter(Boolean);
    for (const field of ['total_asylum_decisions', 'grants', 'denials', 'other_decisions']) {
      assert.equal(courtPeriods.reduce((sum, row) => sum + Number(row[field] || 0), 0), Number(period[field] || 0), `${state.state} FY ${period.fiscal_year} court ${field} must equal state`);
    }
  }
}

const nationalTotal = stateData.national.reduce((sum, row) => sum + Number(row.total_asylum_decisions || 0), 0);
assert.equal(nationalTotal, 510063, 'published 2020-01-01 through 2026-07-01 scope must reconcile to source preflight');
const newYork = stateData.states.find((row) => row.state === 'NY');
assert.ok(newYork, 'New York must be present');
assert.equal(newYork.yearly.reduce((sum, row) => sum + Number(row.total_asylum_decisions || 0), 0), 83628, 'New York all-scope total must include every NY court code');
assert.equal(newYork.yearly.find((row) => row.fiscal_year === 2026)?.total_asylum_decisions, 16802, 'New York FY 2026 YTD total must be stable');

assert.equal(yearShards.length, yearIndex.profile_count, 'judge nationality-year shard profile count must match index');
const nationalityRows = yearShards.flatMap((profile) => profile.rows || []);
assert.equal(nationalityRows.length, yearIndex.row_count, 'judge nationality-year row count must match index');
for (const row of nationalityRows) {
  assert.equal(Number(row.total_asylum_decisions), Number(row.grants) + Number(row.denials) + Number(row.other_decisions), 'judge nationality-year outcomes must reconcile');
  assert.ok(row.fiscal_year && row.nationality, 'judge nationality-year rows require fiscal year and nationality');
}

console.log('AsylumJudge fiscal-year state/court/nationality reconciliation: PASS');

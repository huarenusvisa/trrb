import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DAILY_EDITORIAL_PLAN,
  DAILY_PUBLICATION_HOUR,
  newYorkDateKey,
  plannedDailyTarget,
  publicationSlot,
  rotatingAngleOffset
} from './immigration-knowledge-plan.mjs';

assert.equal(DAILY_PUBLICATION_HOUR, 8);
assert.equal(DAILY_EDITORIAL_PLAN.length, 5);
assert.deepEqual(DAILY_EDITORIAL_PLAN.map(slot => slot.cumulative), [10, 20, 30, 40, 50]);

// 2026-09-20 is in EDT (UTC-4).
assert.equal(newYorkDateKey('2026-09-20T03:59:59Z'), '2026-09-19');
assert.equal(newYorkDateKey('2026-09-20T04:00:00Z'), '2026-09-20');
assert.equal(plannedDailyTarget('2026-09-20T11:59:59Z'), 0);
assert.equal(plannedDailyTarget('2026-09-20T12:00:00Z'), 50);

// 2026-12-20 is in EST (UTC-5); the same New York plan must still apply.
assert.equal(plannedDailyTarget('2026-12-20T12:59:59Z'), 0);
assert.equal(plannedDailyTarget('2026-12-20T13:00:00Z'), 50);

assert.equal(publicationSlot(0).label, '基础规则与适用条件');
assert.equal(publicationSlot(10).label, '表格期限与证据准备');
assert.equal(publicationSlot(49).label, '工卡家庭与数据解读');
assert.equal(rotatingAngleOffset('2026-09-20', 61), rotatingAngleOffset('2026-09-20', 61));
assert.notEqual(rotatingAngleOffset('2026-09-20', 61), rotatingAngleOffset('2026-09-21', 61));

const workflow = fs.readFileSync('.github/workflows/asylum-knowledge-daily-50.yml', 'utf8');
const generator = fs.readFileSync('scripts/immigration-knowledge-daily.mjs', 'utf8');
assert.match(workflow, /cron: "17 12 \* \* \*"/);
assert.match(workflow, /cron: "17 13 \* \* \*"/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(workflow, /KNOWLEDGE_BATCH_SIZE: "2"/);
assert.match(workflow, /纽约上午8点时区门控/);
assert.doesNotMatch(workflow, /date \+%H/);
assert.match(generator, /daily_plan_date: publicationDate/);
assert.match(generator, /daily_plan_slot: publicationSlot\(articlePlanIndex\)/);
assert.match(generator, /daily_plan_order: articlePlanIndex \+ 1/);
assert.match(generator, /Math\.ceil\(missing \/ batchSize\) \* 3/);
assert.match(generator, /rejected\.push\(\{ title/);

console.log('immigration knowledge publication plan checks passed');

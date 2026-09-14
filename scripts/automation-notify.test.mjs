import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNotification } from './automation-notify.mjs';

test('identifies the failed task pool without blaming a successful live audit or exposing outputs', () => {
  const payload = buildNotification({
    AUTOMATION_CONTROL_KEY: 'seo_search_engine',
    AUTOMATION_NOTIFICATION_MESSAGE: '移民法官 SEO 任务执行失败。',
    AUTOMATION_FAILURE_RESULTS: JSON.stringify({ live_audit: { outcome: 'success' }, task_pool: { outcome: 'failure', outputs: { secret: 'not-for-notifications' } } }),
    AUTOMATION_FAILURE_LABELS: JSON.stringify({ live_audit: '线上页面检查', task_pool: '任务清单校验及入队' })
  });
  assert.match(payload.message, /任务清单校验及入队/);
  assert.doesNotMatch(payload.message, /线上页面检查/);
  assert.doesNotMatch(JSON.stringify(payload), /not-for-notifications|outputs/);
  assert.deepEqual(payload.details.failed_steps, [{ id: 'task_pool', label: '任务清单校验及入队' }]);
});

test('control-plane notification identifies failed jobs and ignores skipped jobs', () => {
  const payload = buildNotification({
    AUTOMATION_FAILURE_RESULTS: JSON.stringify({ seo: { result: 'failure' }, jobs: { result: 'skipped' } }),
    AUTOMATION_FAILURE_LABELS: '{"seo":"总 SEO 任务"}'
  });
  assert.match(payload.message, /总 SEO 任务/);
  assert.equal(payload.details.failed_steps.length, 1);
});

test('missing or invalid failure context preserves the original notification', () => {
  assert.equal(buildNotification({ AUTOMATION_NOTIFICATION_MESSAGE: '原始错误', AUTOMATION_FAILURE_RESULTS: 'invalid' }).message, '原始错误');
});

import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const allowedKeys = new Set([
  'global', 'ice', 'china_hot', 'trump_x', 'jobs', 'secondhand',
  'seo_indexnow', 'seo_search_engine', 'monitor', 'maintenance',
  'seo_metadata', 'legacy_recovery'
]);

function clean(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export function buildNotification(env = process.env) {
  const rawKey = clean(env.AUTOMATION_CONTROL_KEY, 80);
  const controlKey = allowedKeys.has(rawKey) ? rawKey : null;
  const title = clean(env.AUTOMATION_NOTIFICATION_TITLE, 160) || '机器人工作流运行失败';
  const parse = (value) => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
  const results = parse(env.AUTOMATION_FAILURE_RESULTS);
  const labels = parse(env.AUTOMATION_FAILURE_LABELS);
  const failed = Object.entries(results || {}).filter(([, value]) =>
    value?.outcome === 'failure' || value?.result === 'failure'
  ).map(([id]) => ({ id: clean(id, 100), label: clean(labels?.[id] || id, 160) }));
  const baseMessage = clean(env.AUTOMATION_NOTIFICATION_MESSAGE, 800)
    || `${clean(env.GITHUB_WORKFLOW, 200) || '机器人工作流'}执行失败，请查看 GitHub Actions 日志。`;
  const message = clean(baseMessage + (failed.length ? ` 失败环节：${failed.map((item) => item.label).join('；')}。` : ''), 1200);
  const details = {
    workflow: clean(env.GITHUB_WORKFLOW, 200),
    run_id: clean(env.GITHUB_RUN_ID, 80),
    run_attempt: clean(env.GITHUB_RUN_ATTEMPT, 40),
    event_name: clean(env.GITHUB_EVENT_NAME, 80),
    ref: clean(env.GITHUB_REF, 300),
    server_url: clean(env.GITHUB_SERVER_URL, 300),
    repository: clean(env.GITHUB_REPOSITORY, 200),
    failed_steps: failed
  };
  return { control_key: controlKey, severity: 'error', title, message, details };
}

async function main() {
  if (!url || !serviceKey) {
    console.error('Cannot send automation notification: Supabase configuration is missing.');
    return;
  }
  const response = await fetch(`${url}/rest/v1/automation_notifications`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(buildNotification())
  });
  if (!response.ok) {
    throw new Error(`notification API returned ${response.status}: ${await response.text()}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();

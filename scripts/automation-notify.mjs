import process from 'node:process';

const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const allowedKeys = new Set([
  'global', 'ice', 'china_hot', 'trump_x', 'jobs', 'secondhand',
  'seo_indexnow', 'seo_search_engine', 'monitor', 'maintenance',
  'legacy_404', 'seo_metadata', 'legacy_recovery'
]);

function clean(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

async function main() {
  if (!url || !serviceKey) {
    console.error('Cannot send automation notification: Supabase configuration is missing.');
    return;
  }
  const rawKey = clean(process.env.AUTOMATION_CONTROL_KEY, 80);
  const controlKey = allowedKeys.has(rawKey) ? rawKey : null;
  const title = clean(process.env.AUTOMATION_NOTIFICATION_TITLE, 160) || '机器人工作流运行失败';
  const message = clean(process.env.AUTOMATION_NOTIFICATION_MESSAGE, 1200)
    || `${clean(process.env.GITHUB_WORKFLOW, 200) || '机器人工作流'}执行失败，请查看 GitHub Actions 日志。`;
  const details = {
    workflow: clean(process.env.GITHUB_WORKFLOW, 200),
    run_id: clean(process.env.GITHUB_RUN_ID, 80),
    run_attempt: clean(process.env.GITHUB_RUN_ATTEMPT, 40),
    event_name: clean(process.env.GITHUB_EVENT_NAME, 80),
    ref: clean(process.env.GITHUB_REF, 300),
    server_url: clean(process.env.GITHUB_SERVER_URL, 300),
    repository: clean(process.env.GITHUB_REPOSITORY, 200)
  };
  const response = await fetch(`${url}/rest/v1/automation_notifications`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      control_key: controlKey,
      severity: 'error',
      title,
      message,
      details
    })
  });
  if (!response.ok) {
    throw new Error(`notification API returned ${response.status}: ${await response.text()}`);
  }
}

await main();

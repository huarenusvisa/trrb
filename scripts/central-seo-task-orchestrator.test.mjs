import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { orchestrate } from './central-seo-task-orchestrator.mjs';

const dir = await mkdtemp(join(tmpdir(), 'central-seo-'));
const file = (name) => join(dir, name);
await writeFile(file('asylum.json'), JSON.stringify({
  origin: 'https://asylumjudge.com',
  task_id: 'aj-1',
  status: 'pending_central_seo_robot',
  external_submission_performed: false,
  counts: { add: 1, update: 1, delete: 1 }
}));
await writeFile(file('asylum-expanded.json'), JSON.stringify({
  task_id: 'aj-1',
  external_submission_performed: false,
  actions: {
    add: ['https://asylumjudge.com/new/'],
    update: ['https://asylumjudge.com/current/'],
    delete: ['https://asylumjudge.com/retired/']
  }
}));
await writeFile(file('jobs.json'), JSON.stringify({
  origin: 'https://huarengongzuo.com',
  dispatch: false,
  generated_at: '2026-09-13T00:00:00Z',
  tasks: [
    { id: 'job-add', action: 'add', url: 'https://huarengongzuo.com/jobs/1/' },
    { id: 'job-update', action: 'update', url: 'https://huarengongzuo.com/jobs/' }
  ]
}));
await writeFile(file('config.json'), JSON.stringify({
  schema_version: 1,
  strategy: 'central-only',
  dispatch: false,
  action_priority: ['add', 'delete', 'update'],
  sites: [
    { key: 'asylumjudge', origin: 'https://asylumjudge.com', manifest_path: file('asylum.json'), expanded_path: file('asylum-expanded.json'), daily_quota: 2 },
    { key: 'huarengongzuo', origin: 'https://huarengongzuo.com', manifest_path: file('jobs.json'), daily_quota: 1 }
  ]
}));

const { report, plan } = await orchestrate({ configPath: file('config.json'), reportPath: file('report.json'), planPath: file('plan.json'), dryRun: true });
assert.equal(report.mode, 'dry-run');
assert.equal(report.external_submission_performed, false);
assert.equal(report.queue_persistence, 'skipped');
assert.equal(report.domain_isolation, 'passed');
assert.equal(report.totals.pending, 5);
assert.equal(report.totals.selected, 3);
assert.equal(plan.tasks.filter((task) => task.site === 'asylumjudge').length, 2);
assert.equal(plan.tasks.filter((task) => task.site === 'huarengongzuo').length, 1);
assert.equal(JSON.parse(await readFile(file('plan.json'), 'utf8')).dispatch, false);

const bad = JSON.parse(await readFile(file('jobs.json'), 'utf8'));
bad.tasks[0].url = 'https://asylumjudge.com/foreign/';
await writeFile(file('jobs-bad.json'), JSON.stringify(bad));
const badConfig = JSON.parse(await readFile(file('config.json'), 'utf8'));
badConfig.sites[1].manifest_path = file('jobs-bad.json');
await writeFile(file('config-bad.json'), JSON.stringify(badConfig));
await assert.rejects(
  orchestrate({ configPath: file('config-bad.json'), reportPath: file('bad-report.json'), planPath: file('bad-plan.json'), dryRun: true }),
  /foreign origin/
);

const centralWorkflow = await readFile('.github/workflows/seo-search-engine-ops.yml', 'utf8');
const productionConfig = JSON.parse(await readFile('seo/central-task-pools.json', 'utf8'));
const asylumPool = productionConfig.sites.find((site) => site.key === 'asylumjudge');
assert.equal(asylumPool.manifest_path, '.netlify/asylumjudge-bundle/public/asylumjudge/seo-url-tasks.json', 'consume the freshly built manifest, not a previous day source snapshot');
assert.equal(asylumPool.expanded_path, '.netlify/asylumjudge-bundle/public/asylumjudge/seo-url-tasks-expanded.json');

const mismatched = JSON.parse(await readFile(file('asylum-expanded.json'), 'utf8'));
mismatched.task_id = 'aj-next-day';
await writeFile(file('asylum-expanded.json'), JSON.stringify(mismatched));
await assert.rejects(
  orchestrate({ configPath: file('config.json'), reportPath: file('mismatch-report.json'), planPath: file('mismatch-plan.json'), dryRun: true }),
  /expanded task_id mismatch/,
  'stale or mixed build artifacts must still be rejected'
);
mismatched.task_id = 'aj-1';
await writeFile(file('asylum-expanded.json'), JSON.stringify(mismatched));

// Reproduce a historical row with the same site/action/URL but a different ID.
// Intake must update it without resetting its submission status or retry state.
const originalFetch = globalThis.fetch;
const originalBase = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const semanticKey = (row) => `${row.site_key}\n${row.action}\n${row.url}`;
const oldRow = { task_id: 'previous-id', site_key: 'huarengongzuo', action: 'update', url: 'https://huarengongzuo.com/jobs/', status: 'submitted', attempts: 3, lock_owner: null };
const database = new Map([[semanticKey(oldRow), oldRow]]);
try {
  process.env.SUPABASE_URL = 'https://queue.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
  globalThis.fetch = async (input, options) => {
    const request = new URL(input);
    assert.equal(request.origin, 'https://queue.test', 'intake must not submit to search engines');
    if (request.searchParams.get('on_conflict') !== 'site_key,action,url') {
      return new Response('duplicate key value violates seo_task_queue_site_key_action_url_key', { status: 409 });
    }
    for (const row of JSON.parse(options.body)) {
      for (const field of ['status', 'attempts', 'lock_owner', 'locked_until', 'created_at']) {
        assert.equal(Object.hasOwn(row, field), false, `intake must preserve ${field}`);
      }
      const key = semanticKey(row);
      database.set(key, { ...(database.get(key) || { status: 'pending', attempts: 0 }), ...row });
    }
    return new Response(null, { status: 201 });
  };
  for (let pass = 0; pass < 2; pass++) {
    const jobs = JSON.parse(await readFile(file('jobs.json'), 'utf8'));
    jobs.tasks[1].id = `job-update-generation-${pass}`;
    await writeFile(file('jobs.json'), JSON.stringify(jobs));
    const result = await orchestrate({ configPath: file('config.json'), reportPath: file('persist-report.json'), planPath: file('persist-plan.json'), dryRun: true, persist: true });
    assert.equal(result.report.persisted, 5);
    assert.equal(result.report.external_submission_performed, false);
    assert.equal(database.size, 5, 'repeat intake must not duplicate semantic tasks');
    assert.equal(database.get(semanticKey(oldRow)).status, 'submitted');
    assert.equal(database.get(semanticKey(oldRow)).attempts, 3);
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalBase;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
}
const jobsWorkflow = await readFile('.github/workflows/huarengongzuo-google-jobs-submit.yml', 'utf8');
assert.doesNotMatch(centralWorkflow, /node scripts\/submit-asylumjudge-indexnow\.mjs/, 'AsylumJudge must not bypass the central task pool');
assert.doesNotMatch(jobsWorkflow, /workflow_run:|schedule:/, 'Huaren Gongzuo must not schedule an independent SEO robot');
assert.doesNotMatch(jobsWorkflow, /node scripts\/huarengongzuo-google-jobs-submit\.mjs/, 'Huaren Gongzuo must not submit outside the central robot');

console.log('Central SEO task orchestrator: PASS (two isolated pools, quotas, deduplication and dry-run gate)');

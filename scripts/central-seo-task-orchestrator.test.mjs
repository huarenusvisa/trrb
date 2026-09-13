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
const jobsWorkflow = await readFile('.github/workflows/huarengongzuo-google-jobs-submit.yml', 'utf8');
assert.doesNotMatch(centralWorkflow, /node scripts\/submit-asylumjudge-indexnow\.mjs/, 'AsylumJudge must not bypass the central task pool');
assert.doesNotMatch(jobsWorkflow, /workflow_run:|schedule:/, 'Huaren Gongzuo must not schedule an independent SEO robot');
assert.doesNotMatch(jobsWorkflow, /node scripts\/huarengongzuo-google-jobs-submit\.mjs/, 'Huaren Gongzuo must not submit outside the central robot');

console.log('Central SEO task orchestrator: PASS (two isolated pools, quotas, deduplication and dry-run gate)');

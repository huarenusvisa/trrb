#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_CONFIG = 'seo/central-task-pools.json';
const DEFAULT_REPORT = 'central-seo-task-report.json';
const DEFAULT_PLAN = 'central-seo-dispatch-plan.json';
const ACTIONS = new Set(['add', 'update', 'delete']);

function flag(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function taskId(site, action, url) {
  return createHash('sha256').update(`${site}\n${action}\n${url}`).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeUrl(raw, origin, label) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error(`${label}: invalid URL`); }
  assert(url.protocol === 'https:', `${label}: only HTTPS URLs are allowed`);
  assert(url.origin === origin, `${label}: foreign origin ${url.origin}`);
  assert(!url.username && !url.password, `${label}: credentials are forbidden`);
  assert(!url.hash, `${label}: fragments are forbidden`);
  return url.href;
}

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

function validateConfig(config) {
  assert(config?.schema_version === 1, 'central config schema_version must be 1');
  assert(config.strategy === 'central-only', 'central config strategy must be central-only');
  assert(config.dispatch === false, 'central dispatch must remain false during integration');
  assert(Array.isArray(config.sites) && config.sites.length > 0, 'central config requires sites');
  assert(new Set(config.sites.map((site) => site.key)).size === config.sites.length, 'site keys must be unique');
  assert(Array.isArray(config.action_priority) && config.action_priority.length === 3, 'action priority is incomplete');
  assert(config.action_priority.every((action) => ACTIONS.has(action)), 'action priority contains an unknown action');
}

function fairSelect(tasks, priority, quota) {
  const buckets = Object.fromEntries(priority.map((action) => [action, tasks.filter((task) => task.action === action)]));
  const cursors = Object.fromEntries(priority.map((action) => [action, 0]));
  const selected = [];
  while (selected.length < quota) {
    let progressed = false;
    for (const action of priority) {
      const next = buckets[action][cursors[action]];
      if (!next || selected.length >= quota) continue;
      selected.push(next);
      cursors[action] += 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return selected;
}

async function persistQueue(tasks, sourceBySite) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  assert(base && key, 'queue persistence requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    prefer: 'resolution=merge-duplicates,return=minimal'
  };
  let persisted = 0;
  for (let index = 0; index < tasks.length; index += 500) {
    const rows = tasks.slice(index, index + 500).map((task) => ({
      task_id: task.id,
      site_key: task.site,
      origin: task.origin,
      action: task.action,
      url: task.url,
      lastmod: task.lastmod,
      source_id: sourceBySite.get(task.site),
      updated_at: new Date().toISOString()
    }));
    const response = await fetch(`${base}/rest/v1/seo_task_queue?on_conflict=task_id`, {
      method: 'POST', headers, body: JSON.stringify(rows), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`central queue upsert failed: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    persisted += rows.length;
  }
  return persisted;
}

async function loadTasks(site) {
  const manifest = await json(site.manifest_path);
  assert(manifest.origin === site.origin, `${site.key}: manifest origin mismatch`);
  assert(Number.isInteger(site.daily_quota) && site.daily_quota > 0, `${site.key}: invalid daily quota`);

  let source;
  let rows = [];
  if (site.expanded_path) {
    assert(manifest.external_submission_performed === false, `${site.key}: site already performed external submission`);
    assert(manifest.status === 'pending_central_seo_robot', `${site.key}: manifest is not pending for the central robot`);
    const expanded = await json(site.expanded_path);
    assert(expanded.external_submission_performed === false, `${site.key}: expanded task list already submitted externally`);
    assert(expanded.task_id === manifest.task_id, `${site.key}: expanded task_id mismatch`);
    for (const action of ACTIONS) {
      const urls = expanded.actions?.[action];
      assert(Array.isArray(urls), `${site.key}: missing ${action} action array`);
      assert(urls.length === manifest.counts?.[action], `${site.key}: ${action} count mismatch`);
      rows.push(...urls.map((url) => ({ action, url })));
    }
    source = expanded.task_id;
  } else {
    assert(manifest.dispatch === false, `${site.key}: independent-site dispatch must remain false`);
    assert(Array.isArray(manifest.tasks), `${site.key}: task list is missing`);
    rows = manifest.tasks.map(({ id, action, url, lastmod }) => ({ id, action, url, lastmod }));
    source = `${site.key}:${manifest.generated_at || 'unknown'}`;
  }

  const normalized = [];
  const seenIds = new Set();
  const actionByUrl = new Map();
  for (const [index, row] of rows.entries()) {
    assert(ACTIONS.has(row.action), `${site.key}[${index}]: unknown action ${row.action}`);
    const url = normalizeUrl(row.url, site.origin, `${site.key}[${index}]`);
    const id = row.id || taskId(site.key, row.action, url);
    assert(!seenIds.has(id), `${site.key}: duplicate task id ${id}`);
    seenIds.add(id);
    const previous = actionByUrl.get(url);
    assert(!previous || previous === row.action, `${site.key}: URL appears in both ${previous} and ${row.action}: ${url}`);
    actionByUrl.set(url, row.action);
    normalized.push({ id, site: site.key, origin: site.origin, action: row.action, url, lastmod: row.lastmod || null });
  }
  return { source, tasks: normalized };
}

export async function orchestrate({ configPath = DEFAULT_CONFIG, reportPath = DEFAULT_REPORT, planPath = DEFAULT_PLAN, dryRun = true, persist = false } = {}) {
  const config = await json(configPath);
  validateConfig(config);
  assert(dryRun, 'external dispatch is intentionally unavailable until dry-run approval');

  const globalIds = new Set();
  const sites = [];
  const allTasks = [];
  const selected = [];
  const sourceBySite = new Map();
  for (const site of config.sites) {
    const loaded = await loadTasks(site);
    sourceBySite.set(site.key, loaded.source);
    for (const task of loaded.tasks) {
      assert(!globalIds.has(task.id), `duplicate task id across sites: ${task.id}`);
      globalIds.add(task.id);
    }
    allTasks.push(...loaded.tasks);
    const ordered = [...loaded.tasks].sort((a, b) => a.url.localeCompare(b.url));
    const siteSelected = fairSelect(ordered, config.action_priority, site.daily_quota);
    selected.push(...siteSelected);
    sites.push({
      key: site.key,
      origin: site.origin,
      lock_key: `central-seo:${site.key}`,
      source: loaded.source,
      quota: site.daily_quota,
      pending: Object.fromEntries([...ACTIONS].map((action) => [action, loaded.tasks.filter((task) => task.action === action).length])),
      selected: Object.fromEntries([...ACTIONS].map((action) => [action, siteSelected.filter((task) => task.action === action).length]))
    });
  }

  const generatedAt = new Date().toISOString();
  const persisted = persist ? await persistQueue(allTasks, sourceBySite) : 0;
  const report = {
    schema_version: 1,
    generated_at: generatedAt,
    strategy: config.strategy,
    mode: 'dry-run',
    dispatch: false,
    external_submission_performed: false,
    queue_persistence: persist ? 'completed' : 'skipped',
    persisted,
    domain_isolation: 'passed',
    duplicate_task_ids: 0,
    sites,
    totals: {
      pending: sites.reduce((sum, site) => sum + Object.values(site.pending).reduce((a, b) => a + b, 0), 0),
      selected: selected.length
    }
  };
  const plan = {
    schema_version: 1,
    generated_at: generatedAt,
    mode: 'dry-run',
    dispatch: false,
    channels: {
      indexnow: 'central-router-only',
      google: 'sitemap-and-inspection-only',
      bing: 'quota-aware-central-router-only'
    },
    tasks: selected
  };
  await writeFile(resolve(ROOT, reportPath), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(ROOT, planPath), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  return { report, plan };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await orchestrate({
    configPath: flag('--config', DEFAULT_CONFIG),
    reportPath: flag('--report', DEFAULT_REPORT),
    planPath: flag('--plan', DEFAULT_PLAN),
    dryRun: process.argv.includes('--dry-run'),
    persist: process.argv.includes('--persist')
  });
}

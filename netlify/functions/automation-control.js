const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');

const REPOSITORY = 'huarenusvisa/trrb';
const CONTROL_PLANE_WORKFLOW = 'operations-control-plane.yml';
const ACTIVE_RUN_STATES = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const STOP_POLL_ATTEMPTS = 8;
const STOP_POLL_DELAY_MS = 600;
const MANUAL_ONLY_KEYS = new Set(['seo_metadata', 'legacy_recovery']);
const CONTROL_GROUPS = {
  seo_suite: {
    display_name: 'SEO收录与监控',
    keys: ['seo_indexnow', 'seo_search_engine', 'monitor']
  }
};
const CONTROL_PLANE_KEYS = new Set(['ice', 'china_hot', 'trump_x', 'jobs', 'secondhand', 'seo_indexnow', 'monitor', 'maintenance', 'seo_metadata', 'legacy_recovery']);
const DISPATCHES = {
  seo_suite: [
    { workflow: 'operations-control-plane.yml', inputs: { module: 'seo' } },
    { workflow: 'seo-search-engine-ops.yml' },
    { workflow: 'operations-control-plane.yml', inputs: { module: 'monitor' } }
  ],
  global: [
    { workflow: 'operations-control-plane.yml', inputs: { module: 'all' } },
    { workflow: 'seo-search-engine-ops.yml' },
    { workflow: 'legacy-404-audit.yml' }
  ],
  ice: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'ice' } }],
  china_hot: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'china-hot' } }],
  trump_x: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'trump-x' } }],
  jobs: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'jobs' } }],
  secondhand: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'secondhand' } }],
  seo_indexnow: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'seo' } }],
  seo_search_engine: [{ workflow: 'seo-search-engine-ops.yml' }],
  monitor: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'monitor' } }],
  maintenance: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'maintenance' } }],
  legacy_404: [{ workflow: 'legacy-404-audit.yml' }],
  seo_metadata: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'seo' } }],
  legacy_recovery: [{ workflow: 'operations-control-plane.yml', inputs: { module: 'ico' } }]
};

const CANCEL_WORKFLOWS = {
  seo_suite: ['indexnow.yml', 'seo-search-engine-ops.yml', 'live-seo-crawl.yml', 'seo-integrity.yml'],
  ice: [
    'ice-unified-pipeline.yml', 'ice-forced-clock.yml', 'ice-auto-publish.yml',
    'ice-collector-continuous.yml', 'ice-publisher-continuous.yml', 'ice-watchdog.yml',
    'ice-emergency-watchdog.yml', 'ice-rescue-direct.yml'
  ],
  china_hot: ['china-hot-li-teacher-ingest.yml'],
  trump_x: ['trump-x-ingest.yml'],
  jobs: ['jobs-daily-ingest.yml'],
  secondhand: ['secondhand-daily-ingest.yml'],
  seo_indexnow: ['indexnow.yml'],
  seo_search_engine: ['seo-search-engine-ops.yml'],
  monitor: ['live-seo-crawl.yml', 'seo-integrity.yml'],
  maintenance: ['ice-night-maintenance.yml', 'ice-orphan-media-cleanup.yml'],
  legacy_404: ['legacy-404-audit.yml'],
  seo_metadata: ['round13-publish-seo-sync.yml'],
  legacy_recovery: ['legacy-search-recovery.yml']
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function getEnv(name) {
  return globalThis.Netlify?.env?.get?.(name) || process.env[name] || '';
}

function githubToken() {
  return getEnv('GITHUB_AUTOMATION_TOKEN') || getEnv('GH_AUTOMATION_TOKEN');
}

async function github(path, options = {}) {
  const token = githubToken();
  if (!token) {
    const error = new Error('缺少 GITHUB_AUTOMATION_TOKEN，已保存开关，但无法立即启动或停止 GitHub 工作流');
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'trrb-automation-control'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || `GitHub 工作流请求失败（${response.status}）`);
    error.statusCode = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function createNotification({ controlKey, severity = 'error', title, message, details, userId }) {
  try {
    await rest('automation_notifications', {
      method: 'POST',
      body: {
        control_key: controlKey || null,
        severity,
        title: safeText(title, 160) || '机器人运行通知',
        message: safeText(message, 1200) || '机器人任务发生异常',
        details: details || {},
        created_by: userId || null
      },
      prefer: 'return=minimal'
    });
  } catch (error) {
    console.error('Automation notification write failed:', error);
  }
}

async function readNotifications() {
  try {
    const rows = await rest('automation_notifications', {
      query: {
        select: 'id,control_key,severity,title,message,details,created_at',
        order: 'created_at.desc',
        limit: 20
      }
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error('Automation notifications read failed:', error);
    return [];
  }
}

async function dispatchControl(key) {
  const dispatches = DISPATCHES[key] || [];
  if (!dispatches.length) throw new Error('该机器人尚未配置可执行工作流');
  const results = await Promise.allSettled(dispatches.map((item) => github(
    `/actions/workflows/${encodeURIComponent(item.workflow)}/dispatches`,
    { method: 'POST', body: { ref: 'main', inputs: item.inputs || {} } }
  )));
  const failures = results
    .map((result, index) => ({ result, item: dispatches[index] }))
    .filter(({ result }) => result.status === 'rejected');
  if (failures.length) {
    throw new Error(failures.map(({ result, item }) => `${item.workflow}: ${result.reason.message}`).join('；'));
  }
  return dispatches.map((item) => item.workflow);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cancelWorkflow(workflow) {
  const query = new URLSearchParams({ branch: 'main', per_page: '30' });
  const payload = await github(`/actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`);
  const activeRuns = (payload?.workflow_runs || []).filter((run) => ACTIVE_RUN_STATES.has(run.status));
  await Promise.all(activeRuns.map((run) => github(`/actions/runs/${run.id}/cancel`, { method: 'POST' })));

  let pendingIds = activeRuns.map((run) => run.id);
  for (let attempt = 0; pendingIds.length && attempt < STOP_POLL_ATTEMPTS; attempt += 1) {
    await sleep(STOP_POLL_DELAY_MS);
    const checks = await Promise.allSettled(pendingIds.map((runId) => github(`/actions/runs/${runId}`)));
    pendingIds = pendingIds.filter((runId, index) => {
      const check = checks[index];
      if (check.status !== 'fulfilled') return true;
      return ACTIVE_RUN_STATES.has(check.value?.status);
    });
  }

  return {
    requested: activeRuns.length,
    confirmed: activeRuns.length - pendingIds.length,
    pending: pendingIds.length
  };
}

async function cancelControl(key) {
  const groupKeys = CONTROL_GROUPS[key]?.keys || [];
  const workflows = key === 'global'
    ? [...new Set([CONTROL_PLANE_WORKFLOW, ...Object.values(CANCEL_WORKFLOWS).flat()])]
    : [...new Set([
        ...(CANCEL_WORKFLOWS[key] || []),
        ...groupKeys.flatMap((member) => CANCEL_WORKFLOWS[member] || []),
        ...(CONTROL_PLANE_KEYS.has(key) || groupKeys.some((member) => CONTROL_PLANE_KEYS.has(member)) ? [CONTROL_PLANE_WORKFLOW] : [])
      ])];
  const results = await Promise.allSettled(workflows.map(async (workflow) => ({
    workflow,
    stop: await cancelWorkflow(workflow)
  })));
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new Error(failures.map((result) => result.reason.message).join('；'));
  }
  return results.reduce((summary, result) => ({
    requested: summary.requested + result.value.stop.requested,
    confirmed: summary.confirmed + result.value.stop.confirmed,
    pending: summary.pending + result.value.stop.pending
  }), { requested: 0, confirmed: 0, pending: 0 });
}

async function patchControls(query, enabled, userId, prefer = 'return=minimal') {
  return rest('automation_controls', {
    method: 'PATCH',
    query,
    body: {
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: userId
    },
    prefer
  });
}

async function readControl(key) {
  const controls = await rest('automation_controls', {
    query: {
      select: 'control_key,display_name,enabled,description,sort_order,updated_at,updated_by',
      control_key: `eq.${key}`,
      limit: 1
    }
  });
  return Array.isArray(controls) ? controls[0] : null;
}

async function readControlGroup(key) {
  const group = CONTROL_GROUPS[key];
  if (!group) return null;
  const controls = await rest('automation_controls', {
    query: {
      select: 'control_key,display_name,enabled,description,sort_order,updated_at,updated_by',
      control_key: `in.(${group.keys.join(',')})`,
      order: 'sort_order.asc'
    }
  });
  const rows = Array.isArray(controls) ? controls : [];
  if (rows.length !== group.keys.length) return null;
  return {
    control_key: key,
    display_name: group.display_name,
    enabled: rows.every((item) => item.enabled === true),
    members: rows
  };
}

function controlKeyFilter(keys) {
  return keys.length === 1 ? `eq.${keys[0]}` : `in.(${keys.join(',')})`;
}

async function closeGlobalIfNoEnabledChildren(userId) {
  const activeChildren = await rest('automation_controls', {
    query: {
      select: 'control_key',
      control_key: 'neq.global',
      enabled: 'eq.true',
      limit: 1
    }
  });
  if (Array.isArray(activeChildren) && activeChildren.length) return false;
  await patchControls({ control_key: 'eq.global' }, false, userId);
  return true;
}

exports.handler = async (event) => {
  if (!['GET', 'PATCH'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });
  let user = null;
  let requestedKey = null;
  try {
    ({ user } = await authenticateStaff(event, ['owner', 'editor']));
    if (event.httpMethod === 'GET') {
      const [controls, notifications] = await Promise.all([
        rest('automation_controls', {
          query: { select: 'control_key,display_name,enabled,description,sort_order,updated_at,updated_by', order: 'sort_order.asc' }
        }),
        readNotifications()
      ]);
      return json(200, {
        controls: Array.isArray(controls) ? controls : [],
        notifications,
        dispatch_ready: Boolean(githubToken())
      });
    }

    const body = JSON.parse(event.body || '{}');
    const key = safeText(body.control_key, 80);
    requestedKey = key;
    if (!/^[a-z0-9_]+$/.test(key) || typeof body.enabled !== 'boolean') {
      return json(400, { error: '开关参数无效' });
    }

    const group = CONTROL_GROUPS[key] || null;
    const targetKeys = group?.keys || [key];
    const existing = group ? await readControlGroup(key) : await readControl(key);
    if (!existing) return json(404, { error: '机器人流程不存在' });

    let mode = 'individual';
    let globalAutoClosed = false;
    if (key === 'global') {
      mode = body.enabled ? 'all_on' : 'all_off';
      if (body.enabled) {
        // "全部启用"只启用自动机器人。人工恢复/元数据任务必须逐项人工启动。
        await patchControls({ control_key: 'not.in.(global,seo_metadata,legacy_recovery)' }, true, user.id);
        await patchControls({ control_key: 'in.(seo_metadata,legacy_recovery)' }, false, user.id);
        await patchControls({ control_key: 'eq.global' }, true, user.id);
      } else {
        await patchControls({ control_key: 'eq.global' }, false, user.id);
        await patchControls({ control_key: 'neq.global' }, false, user.id);
      }
    } else if (body.enabled) {
      const globalControl = await readControl('global');
      if (!globalControl) return json(500, { error: '机器人总控不存在' });
      if (!globalControl.enabled) {
        mode = 'single';
        await patchControls({ control_key: 'neq.global' }, false, user.id);
        await patchControls({ control_key: controlKeyFilter(targetKeys) }, true, user.id);
        await patchControls({ control_key: 'eq.global' }, true, user.id);
      } else {
        await patchControls({ control_key: controlKeyFilter(targetKeys) }, true, user.id);
      }
    } else {
      await patchControls({ control_key: controlKeyFilter(targetKeys) }, false, user.id);
      globalAutoClosed = await closeGlobalIfNoEnabledChildren(user.id);
    }

    const control = group ? await readControlGroup(key) : await readControl(key);
    if (!control) return json(500, { error: '保存后无法读取机器人状态' });

    try {
      if (body.enabled) {
        const dispatched = await dispatchControl(key);
        await createNotification({
          controlKey: key,
          severity: 'success',
          title: `${existing.display_name}已打开`,
          message: '开关已启用，并已立即发送到 GitHub Actions 开始执行。',
          details: { mode, workflows: dispatched },
          userId: user.id
        });
        return json(200, {
          control,
          mode,
          action: 'dispatched',
          workflows: dispatched,
          notification_created: true
        });
      }

      const stop = await cancelControl(key);
      const fullyStopped = stop.pending === 0;
      await createNotification({
        controlKey: key,
        severity: fullyStopped ? 'info' : 'warning',
        title: fullyStopped ? `${existing.display_name}已停止` : `${existing.display_name}正在停止`,
        message: stop.requested === 0
          ? '关闭开关已生效；没有发现正在运行或排队的实例。'
          : fullyStopped
            ? `关闭开关已生效；${stop.confirmed} 个运行实例已确认停止。`
            : `关闭开关已生效；已发送 ${stop.requested} 个停止请求，${stop.confirmed} 个已确认停止，${stop.pending} 个仍在结束中。`,
        details: { mode, ...stop, global_auto_closed: globalAutoClosed },
        userId: user.id
      });
      return json(200, {
        control,
        mode,
        action: fullyStopped ? 'stopped' : 'stopping',
        cancelled_runs: stop.requested,
        confirmed_stopped_runs: stop.confirmed,
        pending_stop_runs: stop.pending,
        global_auto_closed: globalAutoClosed,
        notification_created: true
      });
    } catch (actionError) {
      await createNotification({
        controlKey: key,
        severity: 'error',
        title: body.enabled ? '机器人启用后未能立即启动' : '机器人关闭后取消运行失败',
        message: actionError.message,
        details: { enabled: body.enabled, mode },
        userId: user.id
      });
      return json(actionError.statusCode || 502, {
        error: actionError.message,
        saved: true,
        control,
        mode,
        notification_created: true
      });
    }
  } catch (error) {
    console.error('Automation control error:', error);
    if (user && requestedKey) {
      await createNotification({
        controlKey: requestedKey,
        severity: 'error',
        title: '机器人控制失败',
        message: error.message || '机器人控制失败',
        details: {},
        userId: user.id
      });
    }
    return json(error.statusCode || 500, { error: error.message || '机器人控制失败' });
  }
};

const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
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

exports.handler = async (event) => {
  if (!['GET', 'PATCH'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });
  try {
    const { user } = await authenticateStaff(event, ['owner', 'editor']);
    if (event.httpMethod === 'GET') {
      const controls = await rest('automation_controls', {
        query: { select: 'control_key,display_name,enabled,description,sort_order,updated_at,updated_by', order: 'sort_order.asc' }
      });
      return json(200, { controls: Array.isArray(controls) ? controls : [] });
    }

    const body = JSON.parse(event.body || '{}');
    const key = safeText(body.control_key, 80);
    if (!/^[a-z0-9_]+$/.test(key) || typeof body.enabled !== 'boolean') {
      return json(400, { error: '开关参数无效' });
    }

    const existing = await readControl(key);
    if (!existing) return json(404, { error: '机器人流程不存在' });

    let mode = 'individual';
    if (key === 'global') {
      mode = body.enabled ? 'all_on' : 'all_off';
      if (body.enabled) {
        // Safe order: prepare every task first, then release the hard gate last.
        await patchControls({ control_key: 'neq.global' }, true, user.id);
        await patchControls({ control_key: 'eq.global' }, true, user.id);
      } else {
        // Stop execution first, then clear every child flag so the UI cannot
        // show an armed task that is actually blocked by the global gate.
        await patchControls({ control_key: 'eq.global' }, false, user.id);
        await patchControls({ control_key: 'neq.global' }, false, user.id);
      }
    } else if (body.enabled) {
      const globalControl = await readControl('global');
      if (!globalControl) return json(500, { error: '机器人总控不存在' });
      if (!globalControl.enabled) {
        mode = 'single';
        // While the hard gate is closed, clear stale child flags, arm only the
        // selected task, and release the gate last. A partial failure remains
        // fail-closed and cannot accidentally start another task.
        await patchControls({ control_key: 'neq.global' }, false, user.id);
        await patchControls({ control_key: `eq.${key}` }, true, user.id);
        await patchControls({ control_key: 'eq.global' }, true, user.id);
      } else {
        await patchControls({ control_key: `eq.${key}` }, true, user.id);
      }
    } else {
      await patchControls({ control_key: `eq.${key}` }, false, user.id);
    }

    const control = await readControl(key);
    if (!control) return json(500, { error: '保存后无法读取机器人状态' });
    return json(200, { control, mode });
  } catch (error) {
    console.error('Automation control error:', error);
    return json(error.statusCode || 500, { error: error.message || '机器人控制失败' });
  }
};

const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (!['GET', 'PATCH'].includes(event.httpMethod)) return json(405, { error: 'Method not allowed' });
  try {
    const { user } = await authenticateStaff(event, ['owner', 'admin']);
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
    const controls = await rest('automation_controls', {
      method: 'PATCH',
      query: { control_key: `eq.${key}` },
      body: { enabled: body.enabled, updated_at: new Date().toISOString(), updated_by: user.id },
      prefer: 'return=representation'
    });
    const control = Array.isArray(controls) ? controls[0] : null;
    if (!control) return json(404, { error: '机器人流程不存在' });
    return json(200, { control });
  } catch (error) {
    console.error('Automation control error:', error);
    return json(error.statusCode || 500, { error: error.message || '机器人控制失败' });
  }
};

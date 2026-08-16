const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  try {
    const { user, admin } = await authenticateStaff(event, ['owner','admin','moderator']);
    if (event.httpMethod === 'GET') {
      const [users, comments, reports] = await Promise.all([
        rest('profiles', { query: { select: 'id,display_name,avatar_key,role,status,created_at,updated_at', order: 'created_at.desc', limit: '200' } }),
        rest('comments', { query: { select: 'id,article_id,user_id,parent_id,content,status,is_pinned,created_at', order: 'created_at.desc', limit: '200' } }),
        rest('comment_reports', { query: { select: 'id,comment_id,reporter_user_id,reason,status,created_at,reviewed_at', order: 'created_at.desc', limit: '200' } })
      ]);
      return json(200, { ok: true, role: admin.role, users: users || [], comments: comments || [], reports: reports || [] });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    const body = JSON.parse(event.body || '{}');
    const action = safeText(body.action, 80);
    const id = safeText(body.id, 100);
    const value = safeText(body.value, 80);
    if (!id) return json(400, { error: 'missing_id' });

    const actorId = user.id;
    let targetUserId = null;
    let commentId = null;
    let auditAction = action;

    if (action === 'set_user_status') {
      if (!['owner','admin'].includes(admin.role)) return json(403, { error: 'user_management_forbidden' });
      if (!['active','restricted','suspended'].includes(value)) return json(400, { error: 'invalid_status' });
      await rest('profiles', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = id;
      auditAction = `profile_status:${value}`;
    } else if (action === 'set_comment_status') {
      if (!['published','pending','hidden','deleted'].includes(value)) return json(400, { error: 'invalid_status' });
      const rows = await rest('comments', { query: { select: 'id,user_id', id: `eq.${id}`, limit: '1' } });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(404, { error: 'comment_not_found' });
      await rest('comments', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = row.user_id;
      commentId = id;
      auditAction = `comment_status:${value}`;
    } else if (action === 'set_report_status') {
      if (!['reviewed','dismissed','actioned'].includes(value)) return json(400, { error: 'invalid_status' });
      const rows = await rest('comment_reports', { query: { select: 'id,comment_id,reporter_user_id', id: `eq.${id}`, limit: '1' } });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(404, { error: 'report_not_found' });
      await rest('comment_reports', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, reviewed_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = row.reporter_user_id;
      commentId = row.comment_id;
      auditAction = `report_status:${value}`;
    } else {
      return json(400, { error: 'unknown_action' });
    }

    await rest('moderation_actions', {
      method: 'POST',
      body: { actor_user_id: actorId, target_user_id: targetUserId, comment_id: commentId, action: auditAction, reason: 'community admin center' },
      prefer: 'return=minimal'
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'server_error' });
  }
};

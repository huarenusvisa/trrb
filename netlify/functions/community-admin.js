const { authenticateStaff, rest, safeText } = require('./_shared/supabase-admin');

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const optionalRest = async (table, options) => {
  try { return await rest(table, options); }
  catch (error) {
    if (/schema cache|could not find the table|does not exist/i.test(String(error?.message || ''))) return [];
    throw error;
  }
};

exports.handler = async (event) => {
  try {
    const readOnly = event.httpMethod === 'GET';
    const { user, admin } = await authenticateStaff(event, readOnly ? ['owner','editor','viewer'] : ['owner','editor']);
    if (readOnly) {
      const [users, comments, reports, posts, postComments, postReports] = await Promise.all([
        rest('profiles', { query: { select: 'id,display_name,avatar_key,role,status,created_at,updated_at', order: 'created_at.desc', limit: '200' } }),
        optionalRest('comments', { query: { select: 'id,article_id,user_id,parent_id,content,status,is_pinned,created_at', order: 'created_at.desc', limit: '200' } }),
        optionalRest('comment_reports', { query: { select: 'id,comment_id,reporter_user_id,reason,status,created_at,reviewed_at', order: 'created_at.desc', limit: '200' } }),
        optionalRest('community_posts', { query: { select: 'id,user_id,category,title,content,status,moderation_state,risk_level,is_indexable,created_at', order: 'created_at.desc', limit: '200' } }),
        optionalRest('community_post_comments', { query: { select: 'id,post_id,user_id,content,status,risk_level,created_at', order: 'created_at.desc', limit: '200' } }),
        optionalRest('community_post_reports', { query: { select: 'id,post_id,reporter_user_id,reason,status,created_at,reviewed_at', order: 'created_at.desc', limit: '200' } })
      ]);
      return json(200, { ok: true, role: admin.role, users: users || [], comments: comments || [], reports: reports || [], posts: posts || [], postComments: postComments || [], postReports: postReports || [] });
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
    let postId = null;
    let auditAction = action;

    if (action === 'set_user_status') {
      if (!['owner','editor'].includes(admin.role)) return json(403, { error: 'user_management_forbidden' });
      if (!['active','restricted','suspended'].includes(value)) return json(400, { error: 'invalid_status' });
      await rest('profiles', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = id;
      auditAction = `profile_status:${value}`;
    } else if (action === 'set_post_status') {
      if (!['published','pending','hidden','deleted'].includes(value)) return json(400, { error: 'invalid_status' });
      const rows = await rest('community_posts', { query: { select: 'id,user_id,status', id: `eq.${id}`, limit: '1' } });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(404, { error: 'post_not_found' });
      await rest('community_posts', {
        method: 'PATCH', query: { id: `eq.${id}` },
        body: {
          status: value,
          moderation_state: value === 'published' ? 'approved' : (value === 'deleted' ? 'rejected' : 'manual_review'),
          is_indexable: value === 'published' && row.status === 'pending',
          published_at: value === 'published' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        }, prefer: 'return=minimal'
      });
      targetUserId = row.user_id;
      postId = id;
      auditAction = `community_post_status:${value}`;
    } else if (action === 'set_community_comment_status') {
      if (!['published','pending','hidden','deleted'].includes(value)) return json(400, { error: 'invalid_status' });
      const rows = await rest('community_post_comments', { query: { select: 'id,user_id,post_id', id: `eq.${id}`, limit: '1' } });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(404, { error: 'comment_not_found' });
      await rest('community_post_comments', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, updated_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = row.user_id;
      commentId = id;
      postId = row.post_id;
      auditAction = `community_comment_status:${value}`;
    } else if (action === 'set_post_report_status') {
      if (!['reviewed','dismissed','actioned'].includes(value)) return json(400, { error: 'invalid_status' });
      const rows = await rest('community_post_reports', { query: { select: 'id,post_id,reporter_user_id', id: `eq.${id}`, limit: '1' } });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(404, { error: 'report_not_found' });
      await rest('community_post_reports', { method: 'PATCH', query: { id: `eq.${id}` }, body: { status: value, reviewed_at: new Date().toISOString() }, prefer: 'return=minimal' });
      targetUserId = row.reporter_user_id;
      postId = row.post_id;
      auditAction = `community_post_report:${value}`;
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

    await optionalRest(postId || (commentId && action === 'set_community_comment_status') ? 'community_moderation_actions' : 'moderation_actions', {
      method: 'POST',
      body: postId
        ? { actor_user_id: actorId, post_id: postId, comment_id: action === 'set_community_comment_status' ? commentId : null, action: auditAction, reason: 'community admin center' }
        : { actor_user_id: actorId, target_user_id: targetUserId, comment_id: commentId, action: auditAction, reason: 'community admin center' },
      prefer: 'return=minimal'
    });
    return json(200, { ok: true });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'server_error' });
  }
};

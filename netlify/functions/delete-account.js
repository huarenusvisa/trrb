const { SUPABASE_URL, SERVICE_KEY, requestJson, rest, safeText } = require('./_shared/supabase-admin');

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const token = safeText(event.headers.authorization || event.headers.Authorization, 2000).replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'authentication_required' });
    const apiKey = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;
    const user = await requestJson(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: apiKey, Authorization: `Bearer ${token}` } });
    if (!user?.id) return json(401, { error: 'invalid_session' });

    const body = JSON.parse(event.body || '{}');
    const source = safeText(body.source || 'app', 20).toLowerCase();
    if (!['ios','android','web','support','app'].includes(source)) return json(400, { error: 'invalid_source' });
    if (body.confirm !== 'DELETE') return json(400, { error: 'confirmation_required' });

    await rest('account_deletion_requests', {
      method: 'POST',
      body: { user_id: user.id, status: 'processing', source, reason: safeText(body.reason, 500), processing_at: new Date().toISOString(), retention_notice: 'Only minimal deletion completion proof is retained.' },
      prefer: 'resolution=merge-duplicates,return=minimal'
    }).catch(async () => {
      await rest('account_deletion_requests', {
        method: 'PATCH',
        query: { user_id: `eq.${user.id}`, status: 'in.(requested,processing)' },
        body: { status: 'processing', source, processing_at: new Date().toISOString(), retention_notice: 'Only minimal deletion completion proof is retained.' },
        prefer: 'return=minimal'
      });
    });

    await requestJson(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });

    await rest('account_deletion_audit', {
      method: 'POST',
      body: { deleted_user_id: user.id, source, retention_reason: 'Minimal proof that authenticated account deletion completed; no profile/content retained here.' },
      prefer: 'return=minimal'
    });

    return json(200, { ok: true, deleted: true });
  } catch (error) {
    return json(error.statusCode || 500, { error: error.message || 'server_error' });
  }
};

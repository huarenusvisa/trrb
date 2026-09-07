const { authenticateUser, rest } = require('./_shared/supabase-admin');
const { normalizePushTokenClaim } = require('./push-token-registration-core');

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS'
  },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { user } = await authenticateUser(event);
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: '请求格式无效' });
    }
    const claim = normalizePushTokenClaim(body);
    const claimedAt = new Date().toISOString();
    const rows = await rest('rpc/claim_mobile_push_token', {
      method: 'POST',
      body: {
        p_user_id: user.id,
        p_platform: claim.platform,
        p_expo_push_token: claim.expoPushToken,
        p_updated_at: claimedAt
      }
    });
    const result = Array.isArray(rows) ? rows[0] : null;
    if (!result?.token_id) throw new Error('推送令牌登记失败');
    return json(200, {
      ok: true,
      user_id: user.id,
      replaced_owner_count: Number(result.replaced_owner_count || 0)
    });
  } catch (error) {
    console.error('Push token registration error:', error);
    return json(error.statusCode || 500, { error: error.message || '推送令牌登记失败' });
  }
};

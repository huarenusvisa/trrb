const SUPPORT_EMAIL = 'tangrenribao@gmail.com';
const RESET_REDIRECT = 'https://trrb.net/reset-password/';

function env(name) { return Netlify.env.get(name) || ''; }
function json(status, body) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }

function normalizeIdentifier(value) {
  const identifier = String(value || '').trim().toLowerCase().slice(0, 320);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return { type: 'email', value: identifier };
  let digits = identifier.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return { type: 'phone', value: `+${digits}` };
  return null;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.error_description || body?.msg || body?.message || `请求失败（${response.status}）`);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await request.json();
    const action = String(body.action || 'request');
    const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
    const authApiKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !authApiKey) return json(503, { error: '账号服务暂不可用' });

    if (action === 'request') {
      const account = normalizeIdentifier(body.identifier);
      if (!account) return json(400, { error: '请输入有效的邮箱或手机号' });
      if (account.type === 'phone') {
        return json(200, { method: 'support', support_email: SUPPORT_EMAIL });
      }
      try {
        await requestJson(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, {
          method: 'POST',
          headers: { apikey: authApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: account.value }),
        });
      } catch (error) {
        if (error?.statusCode === 429) return json(429, { error: '发送次数过多，请稍后再试' });
        // Avoid revealing whether an email is registered.
        if (error?.statusCode >= 400 && error?.statusCode < 500) return json(200, { method: 'email' });
        throw error;
      }
      return json(200, { method: 'email' });
    }

    if (action === 'complete') {
      const token = String(body.access_token || '').trim().slice(0, 4000);
      const password = String(body.password || '');
      if (!token) return json(401, { error: '重置链接无效或已过期，请重新申请' });
      if (password.length < 8 || password.length > 128) return json(400, { error: '新密码需要 8–128 位' });
      const headers = { apikey: authApiKey, Authorization: `Bearer ${token}` };
      const user = await requestJson(`${supabaseUrl}/auth/v1/user`, { headers });
      if (!user?.id) return json(401, { error: '重置链接无效或已过期，请重新申请' });
      await requestJson(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      return json(200, { updated: true });
    }

    return json(400, { error: '不支持的操作' });
  } catch (error) {
    console.error('Unified account recovery error:', error);
    const status = error?.statusCode === 401 ? 401 : error?.statusCode === 429 ? 429 : 500;
    return json(status, { error: status === 401 ? '重置链接无效或已过期，请重新申请' : error?.message || '找回密码失败' });
  }
};

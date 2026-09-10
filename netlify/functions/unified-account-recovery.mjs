import crypto from 'node:crypto';

const SUPPORT_EMAIL = 'tangrenribao@gmail.com';
const RESET_REDIRECT = 'https://trrb.net/reset-password/';

function env(name) { return Netlify.env.get(name) || ''; }
function json(status, body) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }

function keyedHash(value, serviceKey) {
  return crypto.createHmac('sha256', serviceKey).update(String(value || '')).digest('hex');
}

function phoneAlias(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `phone.${digits}@accounts.trrb.invalid` : '';
}

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

async function rest(supabaseUrl, serviceKey, table, { method = 'GET', query = {}, body, prefer = '' } = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function sendRecoveryEmail(supabaseUrl, authApiKey, email, redirect = RESET_REDIRECT) {
  return requestJson(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST', headers: { apikey: authApiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
}

async function markRecoveryEmailVerified(supabaseUrl, serviceKey, user) {
  if (!serviceKey || !user?.id || !user?.email) return false;
  const rows = await rest(supabaseUrl, serviceKey, 'account_recovery_channels', {
    query: { select: 'recovery_email,email_status', user_id: `eq.${user.id}`, limit: '1' },
  });
  const channel = Array.isArray(rows) ? rows[0] : null;
  if (!channel || String(channel.recovery_email).toLowerCase() !== String(user.email).toLowerCase()) return false;
  const now = new Date().toISOString();
  await rest(supabaseUrl, serviceKey, 'account_recovery_channels', {
    method: 'PATCH', query: { user_id: `eq.${user.id}` },
    body: { email_status: 'verified', email_verified_at: now, updated_at: now }, prefer: 'return=minimal',
  });
  return true;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const body = await request.json();
    const action = String(body.action || 'request');
    const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const authApiKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !authApiKey) return json(503, { error: '账号服务暂不可用' });

    if (action === 'request') {
      const account = normalizeIdentifier(body.identifier);
      if (!account) return json(400, { error: '请输入有效的邮箱或手机号' });
      if (account.type === 'phone') {
        if (serviceKey) {
          const alias = phoneAlias(account.value);
          const mappings = await rest(supabaseUrl, serviceKey, 'account_login_identifiers', {
            query: { select: 'user_id', identifier_hash: `eq.${keyedHash(alias, serviceKey)}`, limit: '1' },
          });
          const userId = Array.isArray(mappings) ? mappings[0]?.user_id : '';
          if (userId) {
            const channels = await rest(supabaseUrl, serviceKey, 'account_recovery_channels', {
              query: { select: 'recovery_email,email_status', user_id: `eq.${userId}`, email_status: 'eq.verified', limit: '1' },
            });
            const channel = Array.isArray(channels) ? channels[0] : null;
            if (channel?.recovery_email) {
              try { await sendRecoveryEmail(supabaseUrl, authApiKey, channel.recovery_email); }
              catch (error) {
                if (error?.statusCode === 429) return json(429, { error: '发送次数过多，请稍后再试' });
                if (error?.statusCode >= 400 && error?.statusCode < 500) return json(200, { method: 'email' });
                throw error;
              }
              return json(200, { method: 'email' });
            }
          }
        }
        return json(200, { method: 'support', support_email: SUPPORT_EMAIL });
      }
      try {
        await sendRecoveryEmail(supabaseUrl, authApiKey, account.value);
      } catch (error) {
        if (error?.statusCode === 429) return json(429, { error: '发送次数过多，请稍后再试' });
        // Avoid revealing whether an email is registered.
        if (error?.statusCode >= 400 && error?.statusCode < 500) return json(200, { method: 'email' });
        throw error;
      }
      return json(200, { method: 'email' });
    }

    if (action === 'complete' || action === 'verify_email') {
      const token = String(body.access_token || '').trim().slice(0, 4000);
      if (!token) return json(401, { error: '重置链接无效或已过期，请重新申请' });
      const headers = { apikey: authApiKey, Authorization: `Bearer ${token}` };
      const user = await requestJson(`${supabaseUrl}/auth/v1/user`, { headers });
      if (!user?.id) return json(401, { error: '重置链接无效或已过期，请重新申请' });
      if (action === 'verify_email') {
        if (!serviceKey) return json(503, { error: '账号服务暂不可用' });
        const verified = await markRecoveryEmailVerified(supabaseUrl, serviceKey, user);
        if (!verified) return json(409, { error: '这封确认邮件已失效，请回到 App 重新绑定' });
        return json(200, { verified: true });
      }
      const password = String(body.password || '');
      if (password.length < 8 || password.length > 128) return json(400, { error: '新密码需要 8–128 位' });
      await requestJson(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      await markRecoveryEmailVerified(supabaseUrl, serviceKey, user).catch(() => undefined);
      return json(200, { updated: true });
    }

    return json(400, { error: '不支持的操作' });
  } catch (error) {
    console.error('Unified account recovery error:', error);
    const status = error?.statusCode === 401 ? 401 : error?.statusCode === 429 ? 429 : 500;
    return json(status, { error: status === 401 ? '重置链接无效或已过期，请重新申请' : error?.message || '找回密码失败' });
  }
};

export const _test = { normalizeIdentifier, keyedHash, phoneAlias };

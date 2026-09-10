import crypto from 'node:crypto';

const BIND_EMAIL_REDIRECT = 'https://trrb.net/reset-password/?mode=bind-email';

function env(name) { return Netlify.env.get(name) || ''; }
function json(status, body) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
function safeText(value, max = 320) { return String(value || '').replace(/\u0000/g, '').trim().slice(0, max); }

function normalizeEmail(value) {
  const email = safeText(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@accounts.trrb.invalid')) return '';
  return email;
}

function maskEmail(value) {
  const [local = '', domain = ''] = String(value || '').split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

function phoneAlias(loginLabel) {
  let digits = safeText(loginLabel, 40).replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 10 || digits.length > 15) return '';
  return `phone.${digits}@accounts.trrb.invalid`;
}

function keyedHash(value, serviceKey) {
  return crypto.createHmac('sha256', serviceKey).update(String(value || '')).digest('hex');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.error_description || body?.msg || body?.message || body?.details || `请求失败（${response.status}）`);
    error.statusCode = response.status;
    throw error;
  }
  return body;
}

function makeRest(supabaseUrl, serviceKey) {
  return async (table, { method = 'GET', query = {}, body, prefer = '' } = {}) => {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return requestJson(url, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
}

async function authenticate(request, supabaseUrl, authApiKey) {
  const token = safeText(request.headers.get('authorization'), 4000).replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('请先登录唐人日报账号'), { statusCode: 401 });
  const user = await requestJson(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: authApiKey, Authorization: `Bearer ${token}` },
  });
  if (!user?.id) throw Object.assign(new Error('登录状态已失效，请重新登录'), { statusCode: 401 });
  return user;
}

function publicStatus(user, channel) {
  const loginType = user?.user_metadata?.login_type === 'phone' ? 'phone' : 'email';
  if (loginType === 'email') {
    return {
      login_type: 'email',
      login_label: safeText(user?.user_metadata?.login_label || user?.email),
      recovery_email_masked: maskEmail(user?.email),
      email_status: 'verified',
      sms_status: 'disabled',
      can_bind_email: false,
    };
  }
  return {
    login_type: 'phone',
    login_label: safeText(user?.user_metadata?.login_label),
    recovery_email_masked: channel ? maskEmail(channel.recovery_email) : '',
    email_status: channel?.email_status || 'missing',
    sms_status: 'disabled',
    can_bind_email: true,
  };
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const authApiKey = env('SUPABASE_ANON_KEY') || serviceKey;
  if (!supabaseUrl || !serviceKey || !authApiKey) return json(503, { error: '账号服务暂不可用' });
  const rest = makeRest(supabaseUrl, serviceKey);

  try {
    const body = await request.json();
    const action = String(body.action || 'status');
    const user = await authenticate(request, supabaseUrl, authApiKey);
    const channels = await rest('account_recovery_channels', {
      query: { select: 'recovery_email,email_status,email_verified_at,sms_status', user_id: `eq.${user.id}`, limit: '1' },
    });
    const currentChannel = Array.isArray(channels) ? channels[0] : null;

    if (action === 'status') return json(200, publicStatus(user, currentChannel));
    if (action !== 'bind_email') return json(400, { error: '不支持的操作' });
    if (user?.user_metadata?.login_type !== 'phone') return json(400, { error: '邮箱账号已使用登录邮箱找回密码' });

    const recoveryEmail = normalizeEmail(body.recovery_email);
    const currentPassword = String(body.current_password || '');
    if (!recoveryEmail) return json(400, { error: '请输入有效的找回邮箱' });
    if (currentPassword.length < 8 || currentPassword.length > 128) return json(400, { error: '请输入当前密码' });
    const currentAuthEmail = normalizeEmail(user.email) || safeText(user.email, 320).toLowerCase();
    let session;
    try {
      session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: authApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentAuthEmail, password: currentPassword }),
      });
    } catch (error) {
      if (error?.statusCode === 400 || error?.statusCode === 401) throw Object.assign(new Error('当前密码不正确'), { statusCode: 401 });
      throw error;
    }
    if (session?.user?.id !== user.id) throw Object.assign(new Error('当前密码不正确'), { statusCode: 401 });

    const alias = phoneAlias(user?.user_metadata?.login_label);
    if (!alias) throw Object.assign(new Error('手机号账号资料不完整，请联系客服处理'), { statusCode: 409 });
    const now = new Date().toISOString();
    await rest('account_login_identifiers', {
      method: 'POST', query: { on_conflict: 'identifier_hash' },
      body: { identifier_hash: keyedHash(alias, serviceKey), user_id: user.id, identifier_type: 'phone', updated_at: now },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    await requestJson(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: recoveryEmail, email_confirm: true }),
    });
    try {
      await rest('account_recovery_channels', {
        method: 'POST', query: { on_conflict: 'user_id' },
        body: { user_id: user.id, recovery_email: recoveryEmail, email_status: 'pending', email_requested_at: now, email_verified_at: null, sms_status: 'disabled', updated_at: now },
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
      await requestJson(`${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(BIND_EMAIL_REDIRECT)}`, {
        method: 'POST', headers: { apikey: authApiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recoveryEmail }),
      });
    } catch (error) {
      await requestJson(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: currentAuthEmail, email_confirm: true }),
      }).catch(() => undefined);
      if (currentChannel) {
        await rest('account_recovery_channels', {
          method: 'POST', query: { on_conflict: 'user_id' }, body: { ...currentChannel, user_id: user.id, updated_at: now }, prefer: 'resolution=merge-duplicates,return=minimal',
        }).catch(() => undefined);
      } else {
        await rest('account_recovery_channels', { method: 'DELETE', query: { user_id: `eq.${user.id}` } }).catch(() => undefined);
      }
      throw error;
    }

    return json(200, { ...publicStatus({ ...user, email: recoveryEmail }, { recovery_email: recoveryEmail, email_status: 'pending' }), email_sent: true });
  } catch (error) {
    console.error('Unified account security error:', error);
    const status = error?.statusCode === 401 ? 401 : error?.statusCode === 429 ? 429 : error?.statusCode === 409 ? 409 : error?.statusCode === 400 ? 400 : 500;
    const fallback = status === 401 ? '当前密码不正确或登录已失效' : status === 429 ? '发送次数过多，请稍后再试' : '账号安全设置保存失败';
    return json(status, { error: error?.message || fallback });
  }
};

export const _test = { normalizeEmail, maskEmail, phoneAlias, keyedHash, publicStatus };

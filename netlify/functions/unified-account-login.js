const crypto = require('node:crypto');
const {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  requestJson,
  rest
} = require('./_shared/supabase-admin');

const AUTH_API_KEY = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;

function allowedOrigin(event) {
  const origin = safeText(event?.headers?.origin || event?.headers?.Origin, 300);
  if (!origin) return '*';
  if (/^https:\/\/(?:www\.)?(?:trrb\.net|huarengongzuo\.com|asylumjudge\.com)$/i.test(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+(?:--trrb)?\.netlify\.app$/i.test(origin)) return origin;
  return '';
}

function json(statusCode, body, event) {
  const origin = allowedOrigin(event);
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 10 || digits.length > 15) return '';
  return `+${digits}`;
}

function normalizeIdentifier(value) {
  const input = safeText(value, 320).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
    const local = input.split('@')[0].replace(/[._-]+/g, ' ').trim();
    return {
      type: 'email',
      label: input,
      authEmail: input,
      displayName: (local || '新用户').slice(0, 24)
    };
  }
  const phone = normalizePhone(input);
  if (!phone) throw Object.assign(new Error('请输入有效的邮箱或手机号'), { statusCode: 400 });
  const digits = phone.slice(1);
  return {
    type: 'phone',
    label: phone,
    authEmail: `phone.${digits}@accounts.trrb.invalid`,
    displayName: `用户${digits.slice(-4)}`
  };
}

function keyedHash(value) {
  return crypto.createHmac('sha256', SERVICE_KEY).update(String(value || '')).digest('hex');
}

async function passwordSignIn(email, password) {
  return requestJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: AUTH_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
}

async function recentAttempts(column, hash) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = await rest('account_registration_attempts', {
    query: { select: 'id', [column]: `eq.${hash}`, attempted_at: `gte.${since}`, limit: '6' }
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function recordAttempt(identifierHash, ipHash, wasCreated) {
  await rest('account_registration_attempts', {
    method: 'POST',
    body: { identifier_hash: identifierHash, ip_hash: ipHash, was_created: wasCreated },
    prefer: 'return=minimal'
  });
}

async function requestEmailVerification(account, password, event) {
  const origin = allowedOrigin(event);
  const redirectOrigin = origin && origin !== '*' ? origin : 'https://huarengongzuo.com';
  const url = new URL(`${SUPABASE_URL}/auth/v1/signup`);
  url.searchParams.set('redirect_to', `${redirectOrigin}/jobs/publish.html`);
  return requestJson(url, {
    method: 'POST',
    headers: {
      apikey: AUTH_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: account.authEmail,
      password,
      data: {
        display_name: account.displayName,
        login_type: account.type,
        login_label: account.label
      }
    })
  });
}

async function removeUnsafeAutoconfirmedSignup(signup) {
  const userId = safeText(signup?.user?.id, 80);
  if (!userId) return;
  await requestJson(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
}

exports.handler = async (event) => {
  if (!allowedOrigin(event)) return json(403, { error: 'Origin not allowed' }, event);
  if (event.httpMethod === 'OPTIONS') return json(204, {}, event);
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' }, event);
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !AUTH_API_KEY) return json(503, { error: '统一账号服务暂不可用' }, event);
    const body = JSON.parse(event.body || '{}');
    const account = normalizeIdentifier(body.identifier);
    const password = String(body.password || '');
    if (password.length < 8 || password.length > 128) return json(400, { error: '密码需要 8–128 位' }, event);

    try {
      const session = await passwordSignIn(account.authEmail, password);
      return json(200, { created: false, account: { type: account.type, label: account.label }, session }, event);
    } catch (signInError) {
      const identifierHash = keyedHash(account.authEmail);
      const clientIp = safeText(event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown', 128);
      const ipHash = keyedHash(clientIp);
      const [identifierCount, ipCount] = await Promise.all([
        recentAttempts('identifier_hash', identifierHash),
        recentAttempts('ip_hash', ipHash)
      ]);
      if (identifierCount >= 5 || ipCount >= 5) return json(429, { error: '尝试次数过多，请一小时后再试' }, event);

      if (account.type === 'phone') {
        await recordAttempt(identifierHash, ipHash, false);
        return json(401, { error: '手机号账号或密码错误。新账号请先使用邮箱注册并完成验证；已有手机号账号仍可正常登录。' }, event);
      }

      try {
        const signup = await requestEmailVerification(account, password, event);
        if (signup?.access_token || signup?.session || signup?.user?.email_confirmed_at || signup?.user?.confirmed_at) {
          await removeUnsafeAutoconfirmedSignup(signup);
          throw Object.assign(new Error('邮箱验证服务配置异常，已安全停止注册，请联系管理员。'), { statusCode: 503 });
        }
        await recordAttempt(identifierHash, ipHash, true);
        return json(202, {
          created: true,
          verification_required: true,
          account: { type: account.type, label: account.label },
          user: signup?.user ? { id: signup.user.id, email: signup.user.email } : null
        }, event);
      } catch (createError) {
        await recordAttempt(identifierHash, ipHash, false);
        if (createError.statusCode === 503) return json(503, { error: createError.message }, event);
        return json(401, { error: '账号或密码错误' }, event);
      }
    }
  } catch (error) {
    console.error('Unified account login error:', error);
    return json(error.statusCode || 500, { error: error.message || '登录失败' }, event);
  }
};

exports._test = { normalizePhone, normalizeIdentifier };

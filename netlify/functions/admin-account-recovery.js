const crypto = require('node:crypto');
const {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  requestJson,
  rest,
  authenticateStaff
} = require('./_shared/supabase-admin');

const AUTH_API_KEY = process.env.SUPABASE_ANON_KEY || SERVICE_KEY;
const RESET_REDIRECT = 'https://trrb.net/reset-password/';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  },
  body: JSON.stringify(body)
});

function normalizePhone(value) {
  let digits = safeText(value, 40).replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length < 10 || digits.length > 15) return '';
  return `+${digits}`;
}

function phoneAlias(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `phone.${normalized.slice(1)}@accounts.trrb.invalid` : '';
}

function normalizeEmail(value) {
  const email = safeText(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  if (email.endsWith('@accounts.trrb.invalid')) return '';
  return email;
}

function maskEmail(value) {
  const [local = '', domain = ''] = String(value || '').split('@');
  if (!local || !domain) return '';
  return `${local.slice(0, Math.min(2, local.length))}${'*'.repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`;
}

function keyedHash(value) {
  return crypto.createHmac('sha256', SERVICE_KEY).update(String(value || '')).digest('hex');
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = await requestJson(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

async function getAuthUser(userId) {
  return requestJson(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
}

async function resolvePhoneUser(phone, cachedUsers) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw Object.assign(new Error('请输入有效的美国手机号'), { statusCode: 400 });
  const alias = phoneAlias(normalized);
  const mappings = await rest('account_login_identifiers', {
    query: { select: 'user_id', identifier_hash: `eq.${keyedHash(alias)}`, limit: '1' }
  });
  const mappedId = Array.isArray(mappings) ? mappings[0]?.user_id : '';
  if (mappedId) return { phone: normalized, alias, user: await getAuthUser(mappedId) };

  const users = cachedUsers || await listAuthUsers();
  const user = users.find((candidate) => {
    const email = safeText(candidate?.email, 320).toLowerCase();
    const loginLabel = normalizePhone(candidate?.user_metadata?.login_label);
    return email === alias || loginLabel === normalized;
  });
  if (!user?.id) throw Object.assign(new Error('没有找到这个手机号账号'), { statusCode: 404 });
  return { phone: normalized, alias, user };
}

async function accountSummary(phone) {
  const resolved = await resolvePhoneUser(phone);
  const [profiles, channels] = await Promise.all([
    rest('profiles', {
      query: { select: 'display_name,status,created_at,avatar_path,cover_path', id: `eq.${resolved.user.id}`, limit: '1' }
    }),
    rest('account_recovery_channels', {
      query: { select: 'recovery_email,email_status,email_verified_at', user_id: `eq.${resolved.user.id}`, limit: '1' }
    })
  ]);
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  const channel = Array.isArray(channels) ? channels[0] : null;
  return {
    user_id: resolved.user.id,
    phone: resolved.phone,
    display_name: safeText(profile?.display_name || resolved.user?.user_metadata?.display_name || '未设置', 80),
    account_status: safeText(profile?.status || 'active', 30),
    created_at: profile?.created_at || resolved.user?.created_at || null,
    last_sign_in_at: resolved.user?.last_sign_in_at || null,
    has_profile_photo: Boolean(profile?.avatar_path),
    has_cover_photo: Boolean(profile?.cover_path),
    recovery_email_masked: maskEmail(channel?.recovery_email),
    recovery_email_status: channel?.email_status || 'missing'
  };
}

async function recentActions() {
  const rows = await rest('account_recovery_admin_actions', {
    query: {
      select: 'id,login_identifier,recovery_email,verification_method,status,error_message,created_at,reset_sent_at',
      order: 'created_at.desc',
      limit: '50'
    }
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    recovery_email: undefined,
    recovery_email_masked: maskEmail(row.recovery_email)
  }));
}

async function createAudit({ userId, actorId, phone, email, code, method }) {
  const rows = await rest('account_recovery_admin_actions', {
    method: 'POST',
    query: { select: 'id' },
    body: {
      user_id: userId,
      actor_user_id: actorId,
      login_identifier: phone,
      recovery_email: email,
      verification_method: method,
      verification_code_hash: keyedHash(`${phone}:${email}:${code}`),
      status: 'processing'
    },
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0]?.id : '';
}

async function patchAudit(id, body) {
  if (!id) return;
  await rest('account_recovery_admin_actions', {
    method: 'PATCH',
    query: { id: `eq.${id}` },
    body,
    prefer: 'return=minimal'
  });
}

async function approveRecovery(actor, input) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.recovery_email);
  const code = safeText(input.verification_code, 12);
  const method = input.verification_method === 'manual_support' ? 'manual_support' : 'manual_sms';
  if (!phone) throw Object.assign(new Error('请输入有效的美国手机号'), { statusCode: 400 });
  if (!email) throw Object.assign(new Error('请输入有效的接收邮箱'), { statusCode: 400 });
  if (!/^\d{6}$/.test(code)) throw Object.assign(new Error('请输入用户回复的六位验证码'), { statusCode: 400 });
  if (input.confirmed !== true) throw Object.assign(new Error('请确认已经人工核验账号归属'), { statusCode: 400 });

  const users = await listAuthUsers();
  const resolved = await resolvePhoneUser(phone, users);
  const duplicate = users.find((candidate) => String(candidate?.email || '').toLowerCase() === email && candidate.id !== resolved.user.id);
  if (duplicate) throw Object.assign(new Error('这个邮箱已经绑定其他唐人日报账号'), { statusCode: 409 });

  const auditId = await createAudit({
    userId: resolved.user.id,
    actorId: actor.user.id,
    phone,
    email,
    code,
    method
  });
  const now = new Date().toISOString();
  try {
    await rest('account_login_identifiers', {
      method: 'POST',
      query: { on_conflict: 'identifier_hash' },
      body: {
        identifier_hash: keyedHash(resolved.alias),
        user_id: resolved.user.id,
        identifier_type: 'phone',
        updated_at: now
      },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    if (String(resolved.user.email || '').toLowerCase() !== email) {
      await requestJson(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(resolved.user.id)}`, {
        method: 'PUT',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, email_confirm: true })
      });
    }
    await rest('account_recovery_channels', {
      method: 'POST',
      query: { on_conflict: 'user_id' },
      body: {
        user_id: resolved.user.id,
        recovery_email: email,
        email_status: 'verified',
        email_requested_at: now,
        email_verified_at: now,
        sms_status: 'disabled',
        updated_at: now
      },
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    await requestJson(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, {
      method: 'POST',
      headers: { apikey: AUTH_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    await patchAudit(auditId, { status: 'sent', reset_sent_at: now, error_message: null });
    return {
      ok: true,
      user_id: resolved.user.id,
      phone,
      recovery_email_masked: maskEmail(email),
      reset_sent_at: now
    };
  } catch (error) {
    await patchAudit(auditId, {
      status: 'failed',
      error_message: safeText(error?.message || '发送失败', 500)
    }).catch(() => undefined);
    throw error;
  }
}

exports.handler = async (event) => {
  try {
    const { user, admin } = await authenticateStaff(event, ['owner', 'editor']);
    if (event.httpMethod === 'GET') {
      return json(200, { ok: true, role: admin.role, actions: await recentActions() });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    const body = JSON.parse(event.body || '{}');
    const action = safeText(body.action, 40);
    if (action === 'lookup') return json(200, { ok: true, account: await accountSummary(body.phone) });
    if (action === 'approve') return json(200, await approveRecovery({ user, admin }, body));
    return json(400, { error: '不支持的操作' });
  } catch (error) {
    const status = [400, 401, 403, 404, 409, 429].includes(error?.statusCode) ? error.statusCode : 500;
    console.error('Admin account recovery error:', error);
    return json(status, { error: error?.message || '账号找回处理失败' });
  }
};

exports._test = { normalizePhone, phoneAlias, normalizeEmail, maskEmail };

export const ACCOUNT_SECURITY_ENDPOINT = 'https://trrb.net/.netlify/functions/unified-account-security';

export type AccountSecurityStatus = {
  loginType: 'email' | 'phone';
  loginLabel: string;
  recoveryEmailMasked: string;
  emailStatus: 'missing' | 'pending' | 'verified';
  smsStatus: 'disabled' | 'pending' | 'verified';
  canBindEmail: boolean;
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function parseStatus(payload: Record<string, unknown>): AccountSecurityStatus {
  const loginType = payload.login_type === 'phone' ? 'phone' : 'email';
  const emailStatus = payload.email_status === 'verified' ? 'verified' : payload.email_status === 'pending' ? 'pending' : 'missing';
  const smsStatus = payload.sms_status === 'verified' ? 'verified' : payload.sms_status === 'pending' ? 'pending' : 'disabled';
  return {
    loginType,
    loginLabel: typeof payload.login_label === 'string' ? payload.login_label : '',
    recoveryEmailMasked: typeof payload.recovery_email_masked === 'string' ? payload.recovery_email_masked : '',
    emailStatus,
    smsStatus,
    canBindEmail: payload.can_bind_email === true,
  };
}

async function callAccountSecurity(
  body: Record<string, string>,
  options: { fetchImpl?: FetchLike; accessToken?: string; timeoutMs?: number } = {},
) {
  const accessToken = options.accessToken || '';
  if (!accessToken) throw new Error('sign_in_required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(ACCOUNT_SECURITY_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; }
    catch { throw new Error('invalid_response'); }
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'request_failed');
    return parseStatus(payload);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('timeout');
    if (error instanceof TypeError) throw new Error('network');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function getAccountSecurityStatus(options: { fetchImpl?: FetchLike; accessToken?: string; timeoutMs?: number } = {}) {
  return callAccountSecurity({ action: 'status' }, options);
}

export function bindRecoveryEmail(recoveryEmail: string, currentPassword: string, options: { fetchImpl?: FetchLike; accessToken?: string; timeoutMs?: number } = {}) {
  return callAccountSecurity({ action: 'bind_email', recovery_email: recoveryEmail.trim().toLowerCase(), current_password: currentPassword }, options);
}

export const _test = { parseStatus };

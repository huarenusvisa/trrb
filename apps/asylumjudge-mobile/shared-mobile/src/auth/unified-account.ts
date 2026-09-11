export const UNIFIED_ACCOUNT_ENDPOINT = 'https://trrb.net/.netlify/functions/unified-account-login';

export type UnifiedAccountResult = {
  created: boolean;
  account: { type: 'email' | 'phone'; label: string } | null;
  session: { access_token: string; refresh_token: string };
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type CredentialValidationCode = 'required' | 'identifier' | 'password' | null;

export function normalizeIdentifierInput(value: string) {
  const identifier = value.trim();
  return identifier.includes('@') ? identifier.toLowerCase() : identifier;
}

export function validateCredentialCode(identifierValue: string, password: string): CredentialValidationCode {
  const identifier = normalizeIdentifierInput(identifierValue);
  if (!identifier || !password) return 'required';
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const phoneDigits = identifier.replace(/\D/g, '');
  if (!isEmail && (phoneDigits.length < 10 || phoneDigits.length > 15)) return 'identifier';
  if (password.length < 8 || password.length > 128) return 'password';
  return null;
}

export function validateCredentials(identifierValue: string, password: string) {
  const code = validateCredentialCode(identifierValue, password);
  if (code === 'required') return '请输入邮箱或手机号和密码。';
  if (code === 'identifier') return '请输入有效的邮箱或手机号。';
  if (code === 'password') return '密码需要 8–128 位。';
  return '';
}

function isSession(value: unknown): value is UnifiedAccountResult['session'] {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.access_token === 'string' && session.access_token.length > 0
    && typeof session.refresh_token === 'string' && session.refresh_token.length > 0;
}

export async function loginOrRegister(
  identifierValue: string,
  password: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<UnifiedAccountResult> {
  const validationError = validateCredentials(identifierValue, password);
  if (validationError) throw new Error(validationError);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(UNIFIED_ACCOUNT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifier: normalizeIdentifierInput(identifierValue), password }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error('账号服务返回异常，请稍后重试。');
    }
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `登录失败（${response.status}）`);
    if (!isSession(payload.session)) throw new Error('登录状态无效，请重新登录。');
    const account = payload.account && typeof payload.account === 'object'
      ? payload.account as UnifiedAccountResult['account']
      : null;
    return { created: Boolean(payload.created), account, session: payload.session };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接账号服务超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new Error('无法连接账号服务，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function accountLabel(user: { email?: string | null; phone?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) {
  const loginLabel = user?.user_metadata?.login_label;
  if (typeof loginLabel === 'string' && loginLabel.trim()) return loginLabel;
  return user?.email || user?.phone || 'TRRB用户';
}

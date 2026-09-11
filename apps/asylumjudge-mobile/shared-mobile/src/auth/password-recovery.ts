export const PASSWORD_RECOVERY_ENDPOINT = 'https://trrb.net/.netlify/functions/unified-account-recovery';
export type PasswordRecoveryResult = { method: 'email' | 'support'; supportEmail?: string };
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function normalizeIdentifierInput(value: string) {
  const identifier = value.trim();
  return identifier.includes('@') ? identifier.toLowerCase() : identifier;
}

export function validateRecoveryIdentifier(value: string) {
  const identifier = normalizeIdentifierInput(value);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const phoneDigits = identifier.replace(/\D/g, '');
  return isEmail || (phoneDigits.length >= 10 && phoneDigits.length <= 15);
}

export async function requestPasswordRecovery(identifierValue: string, options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}): Promise<PasswordRecoveryResult> {
  const identifier = normalizeIdentifierInput(identifierValue);
  if (!validateRecoveryIdentifier(identifier)) throw new Error('invalid_identifier');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(PASSWORD_RECOVERY_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'request', identifier }), signal: controller.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try { payload = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { throw new Error('invalid_response'); }
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'request_failed');
    if (payload.method === 'email') return { method: 'email' };
    if (payload.method === 'support') return { method: 'support', supportEmail: typeof payload.support_email === 'string' ? payload.support_email : 'tangrenribao@gmail.com' };
    throw new Error('invalid_response');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('timeout');
    if (error instanceof TypeError) throw new Error('network');
    throw error;
  } finally { clearTimeout(timeout); }
}

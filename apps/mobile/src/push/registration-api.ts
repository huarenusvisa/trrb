export const PUSH_TOKEN_REGISTRATION_ENDPOINT = 'https://trrb.net/.netlify/functions/push-token-registration';
export const MAX_PUSH_REGISTRATION_RETRY_AFTER_MS = 15 * 60 * 1_000;

export function parsePushRegistrationRetryAfter(value: string | null, now = Date.now()) {
  if (!value || !Number.isFinite(now)) return null;
  const normalized = value.trim();
  let delayMs: number;
  if (/^\d+$/.test(normalized)) {
    delayMs = Number(normalized) * 1_000;
  } else {
    if (!/^[A-Za-z]{3},\s/.test(normalized)) return null;
    const retryAt = Date.parse(normalized);
    if (!Number.isFinite(retryAt)) return null;
    delayMs = Math.max(0, retryAt - now);
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) return null;
  return Math.min(MAX_PUSH_REGISTRATION_RETRY_AFTER_MS, delayMs);
}

export class PushRegistrationError extends Error {
  readonly pushRegistrationErrorKind: 'network' | 'server';
  readonly pushRegistrationRetryAfterMs: number | null;

  constructor(kind: 'network' | 'server', message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'PushRegistrationError';
    this.pushRegistrationErrorKind = kind;
    this.pushRegistrationRetryAfterMs = retryAfterMs;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function claimPushToken(options: {
  platform: 'ios' | 'android';
  expoPushToken: string;
  accessToken: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(PUSH_TOKEN_REGISTRATION_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        platform: options.platform,
        expo_push_token: options.expoPushToken
      }),
      signal: controller.signal
    });
    const retryAfterMs = parsePushRegistrationRetryAfter(response.headers.get('Retry-After'));
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new PushRegistrationError('server', '推送服务返回异常，请稍后重试。', retryAfterMs);
    }
    if (!response.ok || payload.ok !== true || typeof payload.user_id !== 'string') {
      throw new PushRegistrationError('server', typeof payload.error === 'string' ? payload.error : `推送令牌登记失败（${response.status}）`, retryAfterMs);
    }
    return { userId: payload.user_id, replacedOwnerCount: Number(payload.replaced_owner_count || 0) };
  } catch (error) {
    if (controller.signal.aborted) throw new PushRegistrationError('network', '连接推送服务超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new PushRegistrationError('network', '无法连接推送服务，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

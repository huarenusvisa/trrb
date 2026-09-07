export const PUSH_TOKEN_REGISTRATION_ENDPOINT = 'https://trrb.net/.netlify/functions/push-token-registration';

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
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error('推送服务返回异常，请稍后重试。');
    }
    if (!response.ok || payload.ok !== true || typeof payload.user_id !== 'string') {
      throw new Error(typeof payload.error === 'string' ? payload.error : `推送令牌登记失败（${response.status}）`);
    }
    return { userId: payload.user_id, replacedOwnerCount: Number(payload.replaced_owner_count || 0) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接推送服务超时，请检查网络后重试。');
    if (error instanceof TypeError) throw new Error('无法连接推送服务，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

import { supabase } from './supabase';

export const CHANGE_PASSWORD_ENDPOINT = 'https://trrb.net/.netlify/functions/unified-account-change-password';

export async function changeAccountPassword(currentPassword: string, newPassword: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('登录状态已失效，请重新登录。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(CHANGE_PASSWORD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : '修改密码失败，请重试。');
    const session = payload.session as { access_token?: string; refresh_token?: string } | undefined;
    if (!session?.access_token || !session.refresh_token) throw new Error('新登录状态无效，请重新登录。');
    const { error } = await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接账号服务超时，请检查网络后重试。');
    throw error;
  } finally { clearTimeout(timeout); }
}

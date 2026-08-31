(() => {
  const endpoint = '/.netlify/functions/unified-account-login';

  async function loginOrRegister(client, identifier, password) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifier: String(identifier || '').trim(), password: String(password || '') })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '登录失败，请稍后重试');
    if (payload.verification_required) {
      const error = new Error('验证邮件已发送。请点击邮件中的链接完成验证，然后回到这里登录。');
      error.verificationRequired = true;
      throw error;
    }
    const session = payload.session;
    if (!session?.access_token || !session?.refresh_token) throw new Error('登录状态无效，请重新登录');
    const { data, error } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    return { user: data.user, created: Boolean(payload.created), verificationRequired: false, account: payload.account || null };
  }

  function accountLabel(user) {
    return user?.user_metadata?.login_label || user?.email || user?.phone || user?.id || '';
  }

  async function loadProfile(client, userId) {
    if (!userId) return null;
    const { data } = await client.from('profiles').select('id,display_name,avatar_key,is_custom_avatar').eq('id', userId).maybeSingle();
    return data || null;
  }

  function avatarInitial(profile, fallback = '用') {
    const key = String(profile?.avatar_key || '');
    if (key.startsWith('initial:')) return Array.from(key.slice(8))[0] || fallback;
    return Array.from(String(profile?.display_name || fallback).trim())[0]?.toUpperCase() || fallback;
  }

  window.TRUnifiedAccount = { loginOrRegister, accountLabel, loadProfile, avatarInitial };
})();

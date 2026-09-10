(() => {
  const state = { account: null, loading: false };
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function setMessage(text, kind = '') {
    const target = byId('account-recovery-message');
    if (!target) return;
    target.textContent = text;
    target.dataset.kind = kind;
  }

  async function token() {
    const client = window.supabaseClient;
    if (!client?.auth) throw new Error('后台认证组件未就绪，请刷新页面后重试。');
    const { data } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('后台登录已失效，请重新登录。');
    return accessToken;
  }

  async function api(method, payload) {
    const response = await fetch('/.netlify/functions/admin-account-recovery', {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
  }

  function renderAccount(account) {
    const summary = byId('account-recovery-summary');
    const form = byId('account-recovery-approve-form');
    if (!summary || !form) return;
    state.account = account;
    summary.innerHTML = `
      <div class="account-recovery-summary-head"><div><span>已找到账号</span><h3>${esc(account.display_name)}</h3></div><b>${esc(account.account_status)}</b></div>
      <dl>
        <div><dt>手机号</dt><dd>${esc(account.phone)}</dd></div>
        <div><dt>注册时间</dt><dd>${esc(formatDate(account.created_at))}</dd></div>
        <div><dt>最近登录</dt><dd>${esc(formatDate(account.last_sign_in_at))}</dd></div>
        <div><dt>恢复邮箱</dt><dd>${esc(account.recovery_email_masked || '尚未绑定')} · ${esc(account.recovery_email_status)}</dd></div>
        <div><dt>主页资料</dt><dd>${account.has_profile_photo ? '有头像' : '无头像'} / ${account.has_cover_photo ? '有背景图' : '无背景图'}</dd></div>
      </dl>`;
    summary.classList.remove('hidden');
    form.classList.remove('hidden');
  }

  async function lookupAccount(event) {
    event?.preventDefault();
    const phone = byId('account-recovery-phone')?.value.trim();
    if (!phone || state.loading) return;
    state.loading = true;
    byId('account-recovery-lookup').disabled = true;
    setMessage('正在查询手机号账号…');
    try {
      const data = await api('POST', { action: 'lookup', phone });
      renderAccount(data.account);
      setMessage('账号已找到。请核对资料、填写来信邮箱和验证码。', 'success');
    } catch (error) {
      state.account = null;
      byId('account-recovery-summary')?.classList.add('hidden');
      byId('account-recovery-approve-form')?.classList.add('hidden');
      setMessage(`查询失败：${error.message}`, 'error');
    } finally {
      state.loading = false;
      byId('account-recovery-lookup').disabled = false;
    }
  }

  async function approveRecovery(event) {
    event.preventDefault();
    if (!state.account || state.loading) return;
    const email = byId('account-recovery-email').value.trim().toLowerCase();
    const code = byId('account-recovery-code').value.trim();
    const method = byId('account-recovery-method').value;
    const confirmed = byId('account-recovery-confirmed').checked;
    if (!/^\d{6}$/.test(code)) return setMessage('请输入用户回复的六位验证码。', 'error');
    if (!confirmed) return setMessage('请先勾选人工核验确认。', 'error');
    if (!window.confirm(`确认将 ${email} 绑定到手机号 ${state.account.phone}，并立即发送一次性重置链接？`)) return;

    state.loading = true;
    const button = byId('account-recovery-approve');
    button.disabled = true;
    setMessage('正在绑定恢复邮箱并发送重置链接…');
    try {
      const data = await api('POST', {
        action: 'approve',
        phone: state.account.phone,
        recovery_email: email,
        verification_code: code,
        verification_method: method,
        confirmed: true
      });
      setMessage(`处理成功：重置链接已发送至 ${data.recovery_email_masked}。请通知用户检查收件箱和垃圾邮件。`, 'success');
      byId('account-recovery-code').value = '';
      byId('account-recovery-confirmed').checked = false;
      await loadActions();
    } catch (error) {
      setMessage(`处理失败：${error.message}`, 'error');
    } finally {
      state.loading = false;
      button.disabled = false;
    }
  }

  function statusLabel(value) {
    return ({ processing: '处理中', sent: '已发送', failed: '失败' })[value] || value || '—';
  }

  async function loadActions() {
    const body = byId('account-recovery-history-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5">正在读取…</td></tr>';
    try {
      const data = await api('GET');
      const actions = data.actions || [];
      body.innerHTML = actions.length ? actions.map((item) => `
        <tr>
          <td>${esc(item.login_identifier)}</td>
          <td>${esc(item.recovery_email_masked || '—')}</td>
          <td>${item.verification_method === 'manual_sms' ? '人工短信验证码' : '客服人工核验'}</td>
          <td><span class="status-pill recovery-status-${esc(item.status)}">${esc(statusLabel(item.status))}</span>${item.error_message ? `<br><small>${esc(item.error_message)}</small>` : ''}</td>
          <td>${esc(formatDate(item.reset_sent_at || item.created_at))}</td>
        </tr>`).join('') : '<tr><td colspan="5">暂无处理记录。</td></tr>';
    } catch (error) {
      body.innerHTML = `<tr><td colspan="5">读取失败：${esc(error.message)}</td></tr>`;
    }
  }

  function bind() {
    byId('account-recovery-lookup-form')?.addEventListener('submit', lookupAccount);
    byId('account-recovery-approve-form')?.addEventListener('submit', approveRecovery);
    byId('account-recovery-refresh')?.addEventListener('click', loadActions);
    document.addEventListener('trrb:admin-page-shown', (event) => {
      if (event.detail?.page === 'account-recovery') loadActions();
    });
  }

  window.loadAccountRecoveryActions = loadActions;
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bind) : bind();
})();

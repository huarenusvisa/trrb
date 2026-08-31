(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

  async function request(options = {}) {
    const token = await window.getAdminAccessToken?.();
    if (!token) throw new Error('后台登录已失效，请重新登录');
    const response = await fetch('/.netlify/functions/automation-control', {
      method: options.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `请求失败（${response.status}）`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function renderNotifications(notifications = [], dispatchReady = true) {
    const panel = $('automation-notification-panel');
    const list = $('automation-notification-list');
    if (!panel || !list) return;
    const items = [...notifications];
    if (!dispatchReady) {
      items.unshift({
        id: 'missing-token',
        severity: 'error',
        title: '机器人即时执行尚未接通',
        message: 'Netlify 缺少 GITHUB_AUTOMATION_TOKEN。开关可以保存，但点击“启用”无法立即启动工作流，点击“关闭”也无法取消已在运行的任务。',
        created_at: new Date().toISOString()
      });
    }
    panel.classList.toggle('hidden', items.length === 0);
    list.innerHTML = items.length ? items.map((item) => `
      <article class="automation-notification ${escapeHtml(item.severity || 'error')}">
        <div>
          <strong>${escapeHtml(item.title || '机器人运行通知')}</strong>
          <p>${escapeHtml(item.message || '')}</p>
        </div>
        <time>${escapeHtml(item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) : '')}</time>
      </article>
    `).join('') : '';
  }

  function render(controls) {
    const root = $('automation-control-list');
    const global = controls.find((item) => item.control_key === 'global');
    const globalEnabled = global?.enabled === true;
    $('automation-global-state').textContent = globalEnabled ? '已启用' : '全部关闭';
    $('automation-global-state').className = globalEnabled ? 'automation-state running' : 'automation-state paused';
    root.innerHTML = controls.map((item) => {
      const configuredEnabled = item.enabled === true;
      const effectiveEnabled = item.control_key === 'global'
        ? configuredEnabled
        : globalEnabled && configuredEnabled;
      const effectiveLabel = effectiveEnabled
        ? '已启用'
        : configuredEnabled
          ? '待启用（总开关已关闭）'
          : '已关闭';
      const effectiveClass = effectiveEnabled
        ? 'running'
        : configuredEnabled
          ? 'standby'
          : 'paused';
      return `
        <article class="automation-row ${item.control_key === 'global' ? 'automation-global' : ''}">
          <div class="automation-row-copy">
            <div class="automation-row-title">
              <strong>${escapeHtml(item.display_name)}</strong>
              <span class="automation-effective-state ${effectiveClass}">${effectiveLabel}</span>
            </div>
            <p>${escapeHtml(item.description)}</p>
            <small>最后更新：${escapeHtml(item.updated_at || '—')}</small>
          </div>
          <div class="automation-actions" role="group" aria-label="${escapeHtml(item.display_name)}开关">
            <button
              type="button"
              class="automation-toggle-button enable ${configuredEnabled ? 'active' : ''}"
              data-automation-key="${escapeHtml(item.control_key)}"
              data-automation-enabled="true"
              aria-pressed="${configuredEnabled}"
            >${item.control_key === 'global' ? '全部启用' : '启用'}</button>
            <button
              type="button"
              class="automation-toggle-button disable ${configuredEnabled ? '' : 'active'}"
              data-automation-key="${escapeHtml(item.control_key)}"
              data-automation-enabled="false"
              aria-pressed="${!configuredEnabled}"
            >${item.control_key === 'global' ? '全部关闭' : '关闭'}</button>
          </div>
        </article>`;
    }).join('');
    root.querySelectorAll('[data-automation-key]').forEach((button) => {
      button.addEventListener('click', () => update(button));
    });
  }

  async function update(button) {
    const enabled = button.dataset.automationEnabled === 'true';
    const key = button.dataset.automationKey;
    if (!enabled && button.getAttribute('aria-pressed') === 'true') {
      $('automation-control-message').textContent = `${key === 'global' ? '总开关' : '该流程'}当前已经关闭。`;
      return;
    }

    const groupButtons = [...button.closest('.automation-actions').querySelectorAll('button')];
    groupButtons.forEach((item) => { item.disabled = true; });
    $('automation-control-message').textContent = enabled
      ? `正在启用并立即执行${key === 'global' ? '全部机器人' : '该流程'}…`
      : `正在关闭并停止${key === 'global' ? '全部机器人' : '该流程'}…`;
    try {
      const result = await request({ method: 'PATCH', body: { control_key: key, enabled } });
      await load({ quiet: true });
      if (enabled) {
        $('automation-control-message').textContent = result.mode === 'single'
          ? '已单独启用并立即派发该任务；总控已自动恢复，其他任务保持关闭。'
          : `已启用并立即派发执行（${(result.workflows || []).join('、') || '工作流'}）。`;
      } else {
        $('automation-control-message').textContent = `已关闭；新的执行入口已被拦截，并取消 ${result.cancelled_runs || 0} 个排队或运行中的任务。共享控制面如被中断，其他仍启用机器人会在下一次心跳恢复。`;
      }
    } catch (error) {
      if (error.payload?.saved) await load({ quiet: true });
      $('automation-control-message').textContent = `操作失败：${error.message}${error.payload?.saved ? '（开关状态已保存，错误已发送到本页通知）' : ''}`;
    } finally {
      groupButtons.forEach((item) => { item.disabled = false; });
    }
  }

  async function load(options = {}) {
    if (!options.quiet) $('automation-control-message').textContent = '正在读取机器人状态…';
    try {
      const payload = await request();
      render(payload.controls || []);
      renderNotifications(payload.notifications || [], payload.dispatch_ready !== false);
      if (!options.quiet) {
        $('automation-control-message').textContent = payload.dispatch_ready
          ? '开关状态来自正式数据库。点击“启用”会立即执行；点击“关闭”会阻止并停止执行。'
          : '开关状态已读取，但即时执行密钥尚未配置，请先处理上方红色通知。';
      }
    } catch (error) {
      $('automation-control-message').textContent = `读取失败：${error.message}`;
    }
  }

  window.loadAutomationControls = load;
  document.addEventListener('trrb:admin-page-shown', (event) => {
    if (event.detail?.page === 'automation-control') load();
  });
})();

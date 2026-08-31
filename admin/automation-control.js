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
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    return payload;
  }

  function render(controls) {
    const root = $('automation-control-list');
    const global = controls.find((item) => item.control_key === 'global');
    const globalEnabled = global?.enabled === true;
    $('automation-global-state').textContent = globalEnabled ? '运行中' : '全部暂停';
    $('automation-global-state').className = globalEnabled ? 'automation-state running' : 'automation-state paused';
    root.innerHTML = controls.map((item) => {
      const configuredEnabled = item.enabled === true;
      const effectiveEnabled = item.control_key === 'global'
        ? configuredEnabled
        : globalEnabled && configuredEnabled;
      const effectiveLabel = effectiveEnabled
        ? '运行中'
        : configuredEnabled
          ? '待命（总开关已关闭）'
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
            >${item.control_key === 'global' ? '全部开启' : '开启'}</button>
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
      button.addEventListener('click', () => update(button, globalEnabled));
    });
  }

  async function update(button, globalEnabled) {
    const enabled = button.dataset.automationEnabled === 'true';
    const key = button.dataset.automationKey;
    if (button.getAttribute('aria-pressed') === 'true') {
      $('automation-control-message').textContent = `${key === 'global' ? '总开关' : '该流程'}当前已经${enabled ? '开启' : '关闭'}。`;
      return;
    }

    const groupButtons = [...button.closest('.automation-actions').querySelectorAll('button')];
    groupButtons.forEach((item) => { item.disabled = true; });
    $('automation-control-message').textContent = `正在${enabled ? '开启' : '关闭'}${key === 'global' ? '总开关' : '流程'}…`;
    try {
      const result = await request({ method: 'PATCH', body: { control_key: key, enabled } });
      if (result.mode === 'single') {
        $('automation-control-message').textContent = '已单独开启该任务；总控已自动恢复，其他任务保持关闭。';
      } else if (key === 'global') {
        $('automation-control-message').textContent = enabled
          ? '全部任务已开启。GitHub Actions 下一次启动时会读取最新状态。'
          : '总控和所有单项任务均已关闭。';
      } else {
        $('automation-control-message').textContent = `该任务已${enabled ? '开启' : '关闭'}。GitHub Actions 下一次启动时会读取最新状态。`;
      }
      await load();
    } catch (error) {
      $('automation-control-message').textContent = `保存失败：${error.message}`;
    } finally {
      groupButtons.forEach((item) => { item.disabled = false; });
    }
  }

  async function load() {
    $('automation-control-message').textContent = '正在读取机器人状态…';
    try {
      const payload = await request();
      render(payload.controls || []);
      $('automation-control-message').textContent = '开关状态来自正式数据库；数据库不可读时，工作流会自动按暂停处理。';
    } catch (error) {
      $('automation-control-message').textContent = `读取失败：${error.message}`;
    }
  }

  window.loadAutomationControls = load;
  document.addEventListener('trrb:admin-page-shown', (event) => {
    if (event.detail?.page === 'automation-control') load();
  });
})();

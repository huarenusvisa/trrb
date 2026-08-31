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
    $('automation-global-state').textContent = global?.enabled ? '运行中' : '全部暂停';
    $('automation-global-state').className = global?.enabled ? 'automation-state running' : 'automation-state paused';
    root.innerHTML = controls.map((item) => `
      <article class="automation-row ${item.control_key === 'global' ? 'automation-global' : ''}">
        <div><strong>${escapeHtml(item.display_name)}</strong><p>${escapeHtml(item.description)}</p><small>最后更新：${escapeHtml(item.updated_at || '—')}</small></div>
        <label class="automation-switch"><input type="checkbox" data-automation-key="${escapeHtml(item.control_key)}" ${item.enabled ? 'checked' : ''}><span>${item.enabled ? '开启' : '关闭'}</span></label>
      </article>`).join('');
    root.querySelectorAll('[data-automation-key]').forEach((input) => input.addEventListener('change', () => update(input)));
  }

  async function update(input) {
    const enabled = input.checked;
    const key = input.dataset.automationKey;
    input.disabled = true;
    $('automation-control-message').textContent = '正在保存开关…';
    try {
      await request({ method: 'PATCH', body: { control_key: key, enabled } });
      $('automation-control-message').textContent = `${key === 'global' ? '总开关' : '流程'}已${enabled ? '开启' : '暂停'}。GitHub Actions 下一次启动时会先读取此状态。`;
      await load();
    } catch (error) {
      input.checked = !enabled;
      $('automation-control-message').textContent = `保存失败：${error.message}`;
    } finally { input.disabled = false; }
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

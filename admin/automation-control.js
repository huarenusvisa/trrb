(() => {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const MERGED_KEYS = new Set(['seo_indexnow','seo_search_engine','monitor','maintenance','legacy_404','seo_metadata','legacy_recovery']);

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

  function newestUpdate(items) {
    return items.map((item) => item?.updated_at || '').filter(Boolean).sort().at(-1) || '—';
  }

  function stateFor(items, globalEnabled) {
    const enabledCount = items.filter((item) => item?.enabled === true).length;
    const configuredEnabled = items.length > 0 && enabledCount === items.length;
    const partial = enabledCount > 0 && !configuredEnabled;
    const effectiveEnabled = globalEnabled && configuredEnabled;
    return {
      configuredEnabled,
      effectiveLabel: effectiveEnabled ? '已启用' : partial ? '部分启用' : configuredEnabled ? '待启用（总开关已关闭）' : '已关闭',
      effectiveClass: effectiveEnabled ? 'running' : (partial || configuredEnabled) ? 'standby' : 'paused'
    };
  }

  function toggleButtons(key, configuredEnabled, label = '') {
    return `
      <div class="automation-actions" role="group" aria-label="${escapeHtml(label)}开关">
        <button type="button" class="automation-toggle-button enable ${configuredEnabled ? 'active' : ''}"
          data-automation-key="${escapeHtml(key)}" data-automation-enabled="true" aria-pressed="${configuredEnabled}">启用</button>
        <button type="button" class="automation-toggle-button disable ${configuredEnabled ? '' : 'active'}"
          data-automation-key="${escapeHtml(key)}" data-automation-enabled="false" aria-pressed="${!configuredEnabled}">关闭</button>
      </div>`;
  }

  function manualButtons(item, startLabel, stopLabel) {
    const active = item?.enabled === true;
    return `
      <div class="automation-manual-action">
        <span>${escapeHtml(active ? '任务已开启' : '按需人工执行')}</span>
        <div class="automation-actions compact" role="group">
          <button type="button" class="automation-toggle-button enable ${active ? 'active' : ''}"
            data-automation-key="${escapeHtml(item.control_key)}" data-automation-enabled="true" aria-pressed="${active}">${escapeHtml(startLabel)}</button>
          <button type="button" class="automation-toggle-button disable ${active ? '' : 'active'}"
            data-automation-key="${escapeHtml(item.control_key)}" data-automation-enabled="false" aria-pressed="${!active}">${escapeHtml(stopLabel)}</button>
        </div>
      </div>`;
  }

  function renderRegular(item, globalEnabled) {
    const state = stateFor([item], globalEnabled);
    return {
      sort: Number(item.sort_order || 0),
      html: `
        <article class="automation-row ${item.control_key === 'global' ? 'automation-global' : ''}">
          <div class="automation-row-copy">
            <div class="automation-row-title">
              <strong>${escapeHtml(item.display_name)}</strong>
              <span class="automation-effective-state ${state.effectiveClass}">${state.effectiveLabel}</span>
            </div>
            <p>${escapeHtml(item.description)}</p>
            <small>最后更新：${escapeHtml(item.updated_at || '—')}</small>
          </div>
          ${item.control_key === 'global'
            ? toggleButtons('global', state.configuredEnabled, item.display_name).replace('>启用</button>', '>全部启用</button>').replace('>关闭</button>', '>全部关闭</button>')
            : toggleButtons(item.control_key, state.configuredEnabled, item.display_name)}
        </article>`
    };
  }

  function renderMergedCard({ key, name, description, controls, sort, manualHtml = '', note = '' }, globalEnabled) {
    const state = stateFor(controls, globalEnabled);
    return {
      sort,
      html: `
        <article class="automation-row automation-merged">
          <div class="automation-row-copy">
            <div class="automation-row-title">
              <strong>${escapeHtml(name)}</strong>
              <span class="automation-effective-state ${state.effectiveClass}">${state.effectiveLabel}</span>
            </div>
            <p>${escapeHtml(description)}</p>
            ${note ? `<small class="automation-merged-note">${escapeHtml(note)}</small>` : ''}
            <small>最后更新：${escapeHtml(newestUpdate(controls))}</small>
            ${manualHtml}
          </div>
          ${toggleButtons(key, state.configuredEnabled, name)}
        </article>`
    };
  }

  function render(controls) {
    const root = $('automation-control-list');
    const byKey = new Map(controls.map((item) => [item.control_key, item]));
    const global = byKey.get('global');
    const globalEnabled = global?.enabled === true;
    $('automation-global-state').textContent = globalEnabled ? '已启用' : '全部关闭';
    $('automation-global-state').className = globalEnabled ? 'automation-state running' : 'automation-state paused';

    const cards = controls
      .filter((item) => !MERGED_KEYS.has(item.control_key))
      .map((item) => renderRegular(item, globalEnabled));

    const seoControls = ['seo_indexnow','seo_search_engine','monitor'].map((key) => byKey.get(key)).filter(Boolean);
    cards.push(renderMergedCard({
      key: 'seo_suite',
      name: 'SEO收录与监控',
      description: '统一管理IndexNow、Google/Bing提交和线上SEO健康检查。',
      controls: seoControls,
      sort: 60,
      manualHtml: byKey.get('seo_metadata') ? manualButtons(byKey.get('seo_metadata'), '立即同步元数据', '停止同步') : '',
      note: '自动任务使用一个组合开关；SEO元数据仍按需人工执行。'
    }, globalEnabled));

    const maintenance = byKey.get('maintenance');
    if (maintenance) cards.push(renderMergedCard({
      key: 'maintenance',
      name: 'ICE维护清理',
      description: 'ICE夜间维护、孤立媒体整理及候选数据清理。',
      controls: [maintenance],
      sort: 90,
      note: '已拒绝或处理失败且未关联文章的候选稿，满1小时后由独立安全清理任务删除。'
    }, globalEnabled));

    const legacyAudit = byKey.get('legacy_404');
    if (legacyAudit) cards.push(renderMergedCard({
      key: 'legacy_404',
      name: '旧站迁移工具',
      description: '统一管理旧站404只读盘点和人工恢复。',
      controls: [legacyAudit],
      sort: 100,
      manualHtml: byKey.get('legacy_recovery') ? manualButtons(byKey.get('legacy_recovery'), '立即执行恢复', '停止恢复') : '',
      note: '主开关只控制只读盘点；写入恢复必须点击人工按钮。'
    }, globalEnabled));

    root.innerHTML = cards.sort((a, b) => a.sort - b.sort).map((card) => card.html).join('');
    root.querySelectorAll('[data-automation-key]').forEach((button) => button.addEventListener('click', () => update(button)));
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
        $('automation-control-message').textContent = `已关闭；新的执行入口已被拦截，并取消 ${result.cancelled_runs || 0} 个排队或运行中的任务。`;
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
          ? '组合开关状态来自正式数据库。点击“启用”会立即执行；人工任务必须单独点击。'
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

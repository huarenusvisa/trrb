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

  async function downloadLegacy404Report(button) {
    const status = button.closest('.automation-report-download')?.querySelector('[data-legacy-report-status]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '正在准备TXT…';
    if (status) {
      status.textContent = '正在读取最新报告，请稍候…';
      status.className = 'automation-report-status loading';
    }
    try {
      const token = await window.getAdminAccessToken?.();
      if (!token) throw new Error('后台登录已失效，请重新登录');
      const response = await fetch('/.netlify/functions/automation-control?action=download_legacy_404_report', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `下载失败（${response.status}）`);
      }
      if (!payload.download_url) throw new Error('下载地址生成失败');
      const link = document.createElement('a');
      link.href = payload.download_url;
      link.download = payload.filename || 'trrb-旧站404与301处理报告.txt';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      $('automation-control-message').textContent = 'TXT报告已下载。请优先处理“建议301”，其余记录逐条人工核对。';
      if (status) {
        status.textContent = '下载已开始；请查看浏览器下载记录。';
        status.className = 'automation-report-status success';
      }
    } catch (error) {
      if (status) {
        status.textContent = `下载失败：${error.message}`;
        status.className = 'automation-report-status error';
      }
      throw error;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
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

  function toggleButtons(key, configuredEnabled, label = '', enableLabel = '开启自动任务', disableLabel = '关闭自动任务') {
    return `
      <div class="automation-actions" role="group" aria-label="${escapeHtml(label)}开关">
        <button type="button" class="automation-toggle-button enable ${configuredEnabled ? 'active' : ''}"
          data-automation-key="${escapeHtml(key)}" data-automation-enabled="true" aria-pressed="${configuredEnabled}">${escapeHtml(enableLabel)}</button>
        <button type="button" class="automation-toggle-button disable ${configuredEnabled ? '' : 'active'}"
          data-automation-key="${escapeHtml(key)}" data-automation-enabled="false" aria-pressed="${!configuredEnabled}">${escapeHtml(disableLabel)}</button>
      </div>`;
  }

  function manualTool(item, summary, startLabel, stopLabel, warning = '') {
    const active = item?.enabled === true;
    const actionLabel = active ? stopLabel : startLabel;
    return `
      <details class="automation-advanced">
        <summary>${escapeHtml(summary)}</summary>
        <div class="automation-manual-action">
          <div>
            <strong>${escapeHtml(active ? '该手动任务已启动' : '该操作不会随主开关自动执行')}</strong>
            ${warning ? `<p>${escapeHtml(warning)}</p>` : ''}
          </div>
          <div class="automation-actions compact" role="group">
            <button type="button" class="automation-toggle-button ${active ? 'disable active' : 'enable'}"
              data-automation-key="${escapeHtml(item.control_key)}" data-automation-enabled="${!active}" aria-pressed="false">${escapeHtml(actionLabel)}</button>
          </div>
        </div>
      </details>`;
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
            ? toggleButtons('global', state.configuredEnabled, item.display_name, '全部启用', '全部关闭')
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
      name: 'SEO自动收录',
      description: '打开后，系统自动向IndexNow、Google和Bing提交新内容，并检查网站SEO是否正常。',
      controls: seoControls,
      sort: 60,
      manualHtml: byKey.get('seo_metadata') ? manualTool(byKey.get('seo_metadata'), '手动工具：同步SEO元数据', '立即同步一次', '停止同步') : '',
      note: '平时只需要选择“开启自动任务”或“关闭自动任务”。'
    }, globalEnabled));

    const maintenance = byKey.get('maintenance');
    if (maintenance) cards.push(renderMergedCard({
      key: 'maintenance',
      name: 'ICE自动维护',
      description: '打开后，系统在夜间自动修复、去重并清理孤立媒体。',
      controls: [maintenance],
      sort: 90,
      note: '拒绝稿满1小时自动删除是固定安全规则，不需要打开本开关。'
    }, globalEnabled));

    const legacyAudit = byKey.get('legacy_404');
    if (legacyAudit) cards.push(renderMergedCard({
      key: 'legacy_404',
      name: '旧站404自动检查',
      description: '打开后，系统每6小时检查旧链接和404问题；只生成报告，不修改文章。',
      controls: [legacyAudit],
      sort: 100,
      manualHtml: `
        <div class="automation-report-download">
          <div>
            <strong>最新检查报告</strong>
            <p>下载TXT后，可按“建议301、待人工处理、保留404/410”逐条修复。</p>
            <small class="automation-report-status" data-legacy-report-status>点击按钮后，下载状态会显示在这里。</small>
          </div>
          <button type="button" class="automation-toggle-button enable" data-download-legacy-report>下载404报告（TXT）</button>
        </div>
      ` + (byKey.get('legacy_recovery') ? manualTool(
        byKey.get('legacy_recovery'),
        '高级操作：恢复旧文章',
        '开始恢复旧文章',
        '停止恢复',
        '这会向数据库写入文章；只有确定需要恢复旧内容时才执行。'
      ) : ''),
      note: '正常情况下只使用上方自动检查开关。'
    }, globalEnabled));

    root.innerHTML = cards.sort((a, b) => a.sort - b.sort).map((card) => card.html).join('');
    root.querySelectorAll('[data-automation-key]').forEach((button) => button.addEventListener('click', () => update(button)));
    root.querySelectorAll('[data-download-legacy-report]').forEach((button) => button.addEventListener('click', async () => {
      try {
        await downloadLegacy404Report(button);
      } catch (error) {
        $('automation-control-message').textContent = `报告下载失败：${error.message}`;
      }
    }));
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

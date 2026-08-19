(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state = { users: [], comments: [], reports: [], role: '' };

  const canModerate = () => ['owner','editor'].includes(state.role);
  const canManageUsers = () => ['owner','editor'].includes(state.role);

  async function authToken() {
    const { data } = await window.supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('后台登录已失效，请重新登录。');
    return token;
  }

  async function api(method = 'GET', payload) {
    const token = await authToken();
    const response = await fetch('/.netlify/functions/community-admin', {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  async function loadCommunity() {
    const msg = document.getElementById('community-message');
    if (msg) msg.textContent = '正在读取社区数据…';
    try {
      const data = await api('GET');
      state = {
        users: data.users || [],
        comments: data.comments || [],
        reports: data.reports || [],
        role: String(data.role || '').toLowerCase()
      };
      renderUsers();
      renderComments();
      renderReports();
      if (msg) msg.textContent = `用户 ${state.users.length} · 评论 ${state.comments.length} · 举报 ${state.reports.length} · 当前权限 ${state.role}`;
    } catch (e) {
      if (msg) msg.textContent = '读取失败：' + (e?.message || e);
    }
  }

  function renderUsers() {
    const body = document.getElementById('community-users-body');
    if (!body) return;
    body.innerHTML = state.users.map(u => `<tr><td>${esc(u.display_name)}</td><td>${esc(u.role)}</td><td>${esc(u.status)}</td><td>${new Date(u.created_at).toLocaleString('zh-CN')}</td><td>${canManageUsers()?`<button class="small-btn" data-user-status="active" data-user-id="${esc(u.id)}">恢复</button> <button class="small-btn" data-user-status="restricted" data-user-id="${esc(u.id)}">限制</button> <button class="small-btn" data-user-status="suspended" data-user-id="${esc(u.id)}">封禁</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无用户</td></tr>';
  }

  function renderComments() {
    const body = document.getElementById('community-comments-body');
    if (!body) return;
    body.innerHTML = state.comments.map(c => `<tr><td>${esc(c.user_id)}</td><td>${esc(c.content).slice(0,140)}</td><td>${esc(c.status)}</td><td>${new Date(c.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-comment-status="published" data-comment-id="${esc(c.id)}">发布</button> <button class="small-btn" data-comment-status="hidden" data-comment-id="${esc(c.id)}">隐藏</button> <button class="small-btn" data-comment-status="deleted" data-comment-id="${esc(c.id)}">删除</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无评论</td></tr>';
  }

  function renderReports() {
    const body = document.getElementById('community-reports-body');
    if (!body) return;
    body.innerHTML = state.reports.map(r => `<tr><td>${esc(r.comment_id)}</td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td><td>${new Date(r.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-report-status="reviewed" data-report-id="${esc(r.id)}">已审</button> <button class="small-btn" data-report-status="dismissed" data-report-id="${esc(r.id)}">驳回</button> <button class="small-btn" data-report-status="actioned" data-report-id="${esc(r.id)}">已处置</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无举报</td></tr>';
  }

  async function mutate(action, id, value) {
    try {
      await api('POST', { action, id, value });
      await loadCommunity();
    } catch (error) {
      alert(error?.message || String(error));
    }
  }

  function bindCommunityEvents() {
    document.getElementById('refresh-community')?.addEventListener('click', loadCommunity);
    document.getElementById('community-page')?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.dataset.userStatus) mutate('set_user_status', t.dataset.userId, t.dataset.userStatus);
      if (t.dataset.commentStatus) mutate('set_comment_status', t.dataset.commentId, t.dataset.commentStatus);
      if (t.dataset.reportStatus) mutate('set_report_status', t.dataset.reportId, t.dataset.reportStatus);
    });
  }

  window.loadCommunity = loadCommunity;
  window.bindCommunityEvents = bindCommunityEvents;
})();

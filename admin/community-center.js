(() => {
  const role = () => String(window.currentAdmin?.role || window.currentAdminRole || '').toLowerCase();
  const canModerate = () => ['owner','admin','moderator'].includes(role());
  const canManageUsers = () => ['owner','admin'].includes(role());
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sb = () => window.supabaseClient;
  let state = { users: [], comments: [], reports: [] };

  async function loadUsers() {
    const { data, error } = await sb().from('profiles').select('id,display_name,avatar_key,role,status,created_at,updated_at').order('created_at',{ascending:false}).limit(200);
    if (error) throw error;
    state.users = data || [];
    renderUsers();
  }

  async function loadComments() {
    const { data, error } = await sb().from('comments').select('id,article_id,user_id,parent_id,content,status,is_pinned,created_at,profiles(display_name)').order('created_at',{ascending:false}).limit(200);
    if (error) throw error;
    state.comments = data || [];
    renderComments();
  }

  async function loadReports() {
    const { data, error } = await sb().from('comment_reports').select('id,comment_id,reporter_user_id,reason,status,created_at').order('created_at',{ascending:false}).limit(200);
    if (error) throw error;
    state.reports = data || [];
    renderReports();
  }

  async function loadCommunity() {
    const msg = document.getElementById('community-message');
    if (msg) msg.textContent = '正在读取社区数据…';
    try {
      await Promise.all([loadUsers(), loadComments(), loadReports()]);
      if (msg) msg.textContent = `用户 ${state.users.length} · 评论 ${state.comments.length} · 举报 ${state.reports.length}`;
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
    body.innerHTML = state.comments.map(c => `<tr><td>${esc(c.profiles?.display_name || c.user_id)}</td><td>${esc(c.content).slice(0,140)}</td><td>${esc(c.status)}</td><td>${new Date(c.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-comment-status="published" data-comment-id="${esc(c.id)}">发布</button> <button class="small-btn" data-comment-status="hidden" data-comment-id="${esc(c.id)}">隐藏</button> <button class="small-btn" data-comment-status="deleted" data-comment-id="${esc(c.id)}">删除</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无评论</td></tr>';
  }

  function renderReports() {
    const body = document.getElementById('community-reports-body');
    if (!body) return;
    body.innerHTML = state.reports.map(r => `<tr><td>${esc(r.comment_id)}</td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td><td>${new Date(r.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-report-status="reviewed" data-report-id="${esc(r.id)}">已审</button> <button class="small-btn" data-report-status="dismissed" data-report-id="${esc(r.id)}">驳回</button> <button class="small-btn" data-report-status="actioned" data-report-id="${esc(r.id)}">已处置</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无举报</td></tr>';
  }

  async function setUserStatus(id, status) {
    if (!canManageUsers()) return alert('当前角色没有用户状态管理权限。');
    const { error } = await sb().from('profiles').update({ status }).eq('id', id);
    if (error) return alert(error.message);
    await loadUsers();
  }

  async function setCommentStatus(id, status) {
    if (!canModerate()) return alert('当前角色没有评论审核权限。');
    const { error } = await sb().from('comments').update({ status }).eq('id', id);
    if (error) return alert(error.message);
    await loadComments();
  }

  async function setReportStatus(id, status) {
    if (!canModerate()) return alert('当前角色没有举报处理权限。');
    const { error } = await sb().from('comment_reports').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id);
    if (error) return alert(error.message);
    await loadReports();
  }

  function bindCommunityEvents() {
    document.getElementById('refresh-community')?.addEventListener('click', loadCommunity);
    document.getElementById('community-page')?.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.dataset.userStatus) setUserStatus(t.dataset.userId, t.dataset.userStatus);
      if (t.dataset.commentStatus) setCommentStatus(t.dataset.commentId, t.dataset.commentStatus);
      if (t.dataset.reportStatus) setReportStatus(t.dataset.reportId, t.dataset.reportStatus);
    });
  }

  window.loadCommunity = loadCommunity;
  window.bindCommunityEvents = bindCommunityEvents;
})();

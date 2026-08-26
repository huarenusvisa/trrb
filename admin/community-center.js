(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state = { users: [], comments: [], reports: [], posts: [], postComments: [], postReports: [], role: '' };

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
        posts: data.posts || [],
        postComments: data.postComments || [],
        postReports: data.postReports || [],
        role: String(data.role || '').toLowerCase()
      };
      renderUsers();
      renderPosts();
      renderPostComments();
      renderPostReports();
      renderComments();
      renderReports();
      if (msg) msg.textContent = `用户 ${state.users.length} · 社区帖 ${state.posts.length} · 社区评论 ${state.postComments.length} · 社区举报 ${state.postReports.length} · 新闻评论 ${state.comments.length} · 当前权限 ${state.role}`;
    } catch (e) {
      if (msg) msg.textContent = '读取失败：' + (e?.message || e);
    }
  }

  function renderPosts() {
    const body = document.getElementById('community-posts-body');
    if (!body) return;
    body.innerHTML = state.posts.map(p => `<tr><td>${esc(p.category)}</td><td><b>${esc(p.title)}</b><br><small>${esc(p.content).slice(0,120)}</small></td><td>${esc(p.status)} / ${esc(p.risk_level)}</td><td>${new Date(p.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-post-status="published" data-post-id="${esc(p.id)}">发布</button> <button class="small-btn" data-post-status="pending" data-post-id="${esc(p.id)}">待审</button> <button class="small-btn" data-post-status="hidden" data-post-id="${esc(p.id)}">隐藏</button> <button class="small-btn" data-post-status="deleted" data-post-id="${esc(p.id)}">删除</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无社区帖子</td></tr>';
  }

  function renderPostComments() {
    const body = document.getElementById('community-post-comments-body');
    if (!body) return;
    body.innerHTML = state.postComments.map(c => `<tr><td>${esc(c.post_id)}</td><td>${esc(c.content).slice(0,140)}</td><td>${esc(c.status)} / ${esc(c.risk_level)}</td><td>${new Date(c.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-community-comment-status="published" data-community-comment-id="${esc(c.id)}">发布</button> <button class="small-btn" data-community-comment-status="hidden" data-community-comment-id="${esc(c.id)}">隐藏</button> <button class="small-btn" data-community-comment-status="deleted" data-community-comment-id="${esc(c.id)}">删除</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无社区评论</td></tr>';
  }

  function renderPostReports() {
    const body = document.getElementById('community-post-reports-body');
    if (!body) return;
    body.innerHTML = state.postReports.map(r => `<tr><td>${esc(r.post_id)}</td><td>${esc(r.reason)}</td><td>${esc(r.status)}</td><td>${new Date(r.created_at).toLocaleString('zh-CN')}</td><td>${canModerate()?`<button class="small-btn" data-post-report-status="reviewed" data-post-report-id="${esc(r.id)}">已审</button> <button class="small-btn" data-post-report-status="dismissed" data-post-report-id="${esc(r.id)}">驳回</button> <button class="small-btn" data-post-report-status="actioned" data-post-report-id="${esc(r.id)}">已处置</button>`:'无权限'}</td></tr>`).join('') || '<tr><td colspan="5">暂无社区举报</td></tr>';
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
      if (t.dataset.postStatus) mutate('set_post_status', t.dataset.postId, t.dataset.postStatus);
      if (t.dataset.communityCommentStatus) mutate('set_community_comment_status', t.dataset.communityCommentId, t.dataset.communityCommentStatus);
      if (t.dataset.postReportStatus) mutate('set_post_report_status', t.dataset.postReportId, t.dataset.postReportStatus);
      if (t.dataset.commentStatus) mutate('set_comment_status', t.dataset.commentId, t.dataset.commentStatus);
      if (t.dataset.reportStatus) mutate('set_report_status', t.dataset.reportId, t.dataset.reportStatus);
    });
  }

  window.loadCommunity = loadCommunity;
  window.bindCommunityEvents = bindCommunityEvents;
})();

(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const labels = {
    categories: { hot_discussion:'热门讨论', immigration_help:'移民互助', court_experience:'上庭交流', uscis_interview:'USCIS 面谈', ice_experience:'ICE 经历', lawyer_review:'律师点评', tipoff:'投稿爆料' },
    status: { published:'已发布', pending:'待审核', hidden:'已隐藏', deleted:'已删除', active:'正常', restricted:'受限', suspended:'已封禁', reviewed:'已审核', dismissed:'已驳回', actioned:'已处置' },
    risk: { low:'低风险', medium:'需留意', high:'高风险' },
    role: { owner:'所有者', editor:'编辑', viewer:'只读', user:'用户' }
  };
  const state = { users:[], comments:[], reports:[], posts:[], postComments:[], postReports:[], role:'', view:'posts', query:'', bound:false };

  const byId = (id) => document.getElementById(id);
  const canModerate = () => ['owner','editor'].includes(state.role);
  const canManageUsers = canModerate;
  const dateText = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : '—';
  const text = (value) => String(value ?? '').toLowerCase();
  const matches = (...values) => !state.query || values.some((value) => text(value).includes(state.query));
  const label = (group, value) => labels[group]?.[value] || value || '—';
  const pill = (value, kind = 'status') => `<span class="community-pill ${kind}-${esc(value || 'unknown')}">${esc(label(kind, value))}</span>`;
  const empty = (colspan, message) => `<tr><td colspan="${colspan}"><div class="community-empty"><b>没有匹配内容</b><span>${esc(message)}</span></div></td></tr>`;
  const actions = (items) => canModerate() ? `<div class="community-actions">${items.join('')}</div>` : '<span class="community-readonly">只读权限</span>';
  const button = (labelText, data, tone = '') => `<button type="button" class="community-action ${tone}" ${Object.entries(data).map(([key,value]) => `data-${key}="${esc(value)}"`).join(' ')}>${labelText}</button>`;

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
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      body: payload ? JSON.stringify(payload) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function setCount(id, value, suffix = '') {
    const node = byId(id);
    if (node) node.textContent = `${value}${suffix}`;
  }

  function renderStats() {
    const pending = state.posts.filter((row) => row.status === 'pending').length + state.postComments.filter((row) => row.status === 'pending').length;
    const openReports = state.postReports.filter((row) => !['dismissed','actioned'].includes(row.status)).length;
    setCount('community-stat-posts', state.posts.length);
    setCount('community-stat-published', state.posts.filter((row) => row.status === 'published').length);
    setCount('community-stat-pending', pending);
    setCount('community-stat-reports', openReports);
    setCount('community-stat-users', state.users.length);
    const counts = {
      posts:state.posts.length, 'post-comments':state.postComments.length, 'post-reports':state.postReports.length,
      users:state.users.length, 'news-comments':state.comments.length, 'news-reports':state.reports.length
    };
    for (const [key,value] of Object.entries(counts)) {
      setCount(`community-tab-${key}`, value);
      setCount(`community-count-${key}`, value, key === 'users' ? ' 位' : ' 条');
    }
  }

  function renderPosts() {
    const body = byId('community-posts-body');
    if (!body) return;
    const rows = state.posts.filter((row) => matches(row.category,row.title,row.content,row.status,row.risk_level,row.user_id,row.profiles?.display_name));
    body.innerHTML = rows.map((row) => {
      const author = row.profiles?.display_name || row.user_id?.slice(0,8) || '未知用户';
      const controls = [
        row.status !== 'published' ? button('发布', { 'post-status':'published', 'post-id':row.id }, 'success') : '',
        row.status !== 'pending' ? button('待审', { 'post-status':'pending', 'post-id':row.id }, 'warning') : '',
        row.status !== 'hidden' ? button('隐藏', { 'post-status':'hidden', 'post-id':row.id }) : '',
        row.status !== 'deleted' ? button('删除', { 'post-status':'deleted', 'post-id':row.id }, 'danger') : ''
      ].filter(Boolean);
      return `<tr><td><b>${esc(label('categories',row.category))}</b><small class="community-subtext">${esc(author)}</small></td><td><strong class="community-row-title">${esc(row.title)}</strong><p>${esc(row.content).slice(0,180)}${String(row.content||'').length>180?'…':''}</p></td><td><div class="community-pill-stack">${pill(row.status)} ${pill(row.risk_level,'risk')}</div>${Array.isArray(row.risk_flags)&&row.risk_flags.length?`<small class="community-flags">${esc(row.risk_flags.join(' · '))}</small>`:''}</td><td>${esc(dateText(row.created_at))}</td><td>${actions(controls)}</td></tr>`;
    }).join('') || empty(5,'当前筛选下没有社区帖子。');
  }

  function renderPostComments() {
    const body = byId('community-post-comments-body');
    if (!body) return;
    const rows = state.postComments.filter((row) => matches(row.content,row.status,row.risk_level,row.post_id,row.user_id,row.profiles?.display_name));
    body.innerHTML = rows.map((row) => {
      const author = row.profiles?.display_name || row.user_id?.slice(0,8) || '未知用户';
      const controls = [
        row.status !== 'published' ? button('发布', { 'community-comment-status':'published', 'community-comment-id':row.id }, 'success') : '',
        row.status !== 'hidden' ? button('隐藏', { 'community-comment-status':'hidden', 'community-comment-id':row.id }) : '',
        row.status !== 'deleted' ? button('删除', { 'community-comment-status':'deleted', 'community-comment-id':row.id }, 'danger') : ''
      ].filter(Boolean);
      return `<tr><td><b>${esc(author)}</b><small class="community-subtext">帖子 ${esc(row.post_id)}</small></td><td><p>${esc(row.content).slice(0,220)}</p></td><td>${pill(row.status)} ${pill(row.risk_level,'risk')}</td><td>${esc(dateText(row.created_at))}</td><td>${actions(controls)}</td></tr>`;
    }).join('') || empty(5,'当前筛选下没有社区评论。');
  }

  function renderPostReports() {
    const body = byId('community-post-reports-body');
    if (!body) return;
    const rows = state.postReports.filter((row) => matches(row.reason,row.status,row.post_id,row.comment_id,row.reporter_user_id));
    body.innerHTML = rows.map((r) => {
      const target = r.comment_id ? `评论 ${esc(r.comment_id)}` : `帖子 ${esc(r.post_id)}`;
      const controls = [
        r.status !== 'reviewed' ? button('标记已审', { 'post-report-status':'reviewed', 'post-report-id':r.id }) : '',
        r.status !== 'dismissed' ? button('驳回', { 'post-report-status':'dismissed', 'post-report-id':r.id }) : '',
        r.status !== 'actioned' ? button('已处置', { 'post-report-status':'actioned', 'post-report-id':r.id }, 'success') : ''
      ].filter(Boolean);
      return `<tr><td><b>${target}</b><small class="community-subtext">举报人 ${esc(r.reporter_user_id?.slice(0,8)||'—')}</small></td><td><p>${esc(r.reason)}</p></td><td>${pill(r.status)}</td><td>${esc(dateText(r.created_at))}</td><td>${actions(controls)}</td></tr>`;
    }).join('') || empty(5,'当前没有社区举报。');
  }

  function renderUsers() {
    const body = byId('community-users-body');
    if (!body) return;
    const rows = state.users.filter((row) => matches(row.display_name,row.role,row.status,row.id));
    body.innerHTML = rows.map((row) => {
      const controls = canManageUsers() ? actions([
        row.status !== 'active' ? button('恢复', { 'user-status':'active', 'user-id':row.id }, 'success') : '',
        row.status !== 'restricted' ? button('限制', { 'user-status':'restricted', 'user-id':row.id }, 'warning') : '',
        row.status !== 'suspended' ? button('封禁', { 'user-status':'suspended', 'user-id':row.id }, 'danger') : ''
      ].filter(Boolean)) : '<span class="community-readonly">只读权限</span>';
      return `<tr><td><b>${esc(row.display_name||'未设置昵称')}</b><small class="community-subtext">${esc(row.id)}</small></td><td>${pill(row.role,'role')}</td><td>${pill(row.status)}</td><td>${esc(dateText(row.created_at))}</td><td>${controls}</td></tr>`;
    }).join('') || empty(5,'当前筛选下没有用户。');
  }

  function renderLegacy(rows, bodyId, reportMode = false) {
    const body = byId(bodyId);
    if (!body) return;
    const filtered = rows.filter((row) => matches(row.content,row.reason,row.status,row.user_id,row.comment_id,row.article_id));
    body.innerHTML = filtered.map((row) => {
      const isReport = reportMode;
      const controls = isReport
        ? [button('标记已审', { 'report-status':'reviewed', 'report-id':row.id }), button('驳回', { 'report-status':'dismissed', 'report-id':row.id }), button('已处置', { 'report-status':'actioned', 'report-id':row.id }, 'success')]
        : [button('发布', { 'comment-status':'published', 'comment-id':row.id }, 'success'), button('隐藏', { 'comment-status':'hidden', 'comment-id':row.id }), button('删除', { 'comment-status':'deleted', 'comment-id':row.id }, 'danger')];
      return `<tr><td><b>${esc(isReport?row.comment_id:row.user_id)}</b>${!isReport?`<small class="community-subtext">文章 ${esc(row.article_id||'—')}</small>`:''}</td><td><p>${esc(isReport?row.reason:row.content).slice(0,220)}</p></td><td>${pill(row.status)}</td><td>${esc(dateText(row.created_at))}</td><td>${actions(controls)}</td></tr>`;
    }).join('') || empty(5, reportMode?'当前没有新闻评论举报。':'当前没有新闻评论。');
  }

  function renderAll() {
    renderStats();
    renderPosts();
    renderPostComments();
    renderPostReports();
    renderUsers();
    renderLegacy(state.comments,'community-comments-body');
    renderLegacy(state.reports,'community-reports-body',true);
  }

  function showView(view) {
    state.view = view;
    document.querySelectorAll('[data-community-view]').forEach((node) => node.classList.toggle('active',node.dataset.communityView===view));
    document.querySelectorAll('[data-community-section]').forEach((node) => node.classList.toggle('hidden',node.dataset.communitySection!==view));
  }

  async function loadCommunity() {
    const message = byId('community-message');
    const refresh = byId('refresh-community');
    if (message) { message.className='community-message is-loading'; message.textContent='正在同步用户和社区数据…'; }
    if (refresh) refresh.disabled=true;
    try {
      const data = await api('GET');
      Object.assign(state, {
        users:data.users||[], comments:data.comments||[], reports:data.reports||[], posts:data.posts||[],
        postComments:data.postComments||[], postReports:data.postReports||[], role:String(data.role||'').toLowerCase()
      });
      renderAll();
      const now = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
      if (byId('community-last-sync')) byId('community-last-sync').textContent=`最近同步 ${now}`;
      if (message) { message.className='community-message is-success'; message.textContent=`数据已同步：${state.posts.length} 篇社区帖、${state.postComments.length} 条社区评论、${state.users.length} 位用户。当前权限：${label('role',state.role)}。`; }
    } catch (error) {
      if (message) { message.className='community-message is-error'; message.textContent=`读取失败：${error?.message||error}`; }
    } finally {
      if (refresh) refresh.disabled=false;
    }
  }

  async function mutate(action,id,value) {
    try { await api('POST',{action,id,value}); await loadCommunity(); }
    catch (error) { alert(error?.message||String(error)); }
  }

  function bindCommunityEvents() {
    if (state.bound) return;
    state.bound=true;
    byId('refresh-community')?.addEventListener('click',loadCommunity);
    byId('community-search')?.addEventListener('input',(event)=>{ state.query=event.target.value.trim().toLowerCase(); renderAll(); });
    byId('community-page')?.addEventListener('click',(event)=>{
      const target=event.target.closest('button');
      if (!target) return;
      if (target.dataset.communityView) showView(target.dataset.communityView);
      if (target.dataset.userStatus) mutate('set_user_status',target.dataset.userId,target.dataset.userStatus);
      if (target.dataset.postStatus) mutate('set_post_status',target.dataset.postId,target.dataset.postStatus);
      if (target.dataset.communityCommentStatus) mutate('set_community_comment_status',target.dataset.communityCommentId,target.dataset.communityCommentStatus);
      if (target.dataset.postReportStatus) mutate('set_post_report_status',target.dataset.postReportId,target.dataset.postReportStatus);
      if (target.dataset.commentStatus) mutate('set_comment_status',target.dataset.commentId,target.dataset.commentStatus);
      if (target.dataset.reportStatus) mutate('set_report_status',target.dataset.reportId,target.dataset.reportStatus);
    });
    document.addEventListener('trrb:admin-page-shown',(event)=>{ if(event.detail?.page==='community') loadCommunity(); });
  }

  function init() { bindCommunityEvents(); showView('posts'); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
  window.loadCommunity=loadCommunity;
  window.bindCommunityEvents=bindCommunityEvents;
})();
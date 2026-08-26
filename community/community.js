(() => {
  const sharedOrigin = /^(?:www\.)?asylumjudge\.com$/i.test(window.location.hostname) ? 'https://trrb.net' : '';
  const apiUrl = `${sharedOrigin}/.netlify/functions/community-api`;
  const accountUrl = `${sharedOrigin}/.netlify/functions/unified-account-login`;
  const categoryNames = {
    hot_discussion: '热门讨论', immigration_help: '移民互助', court_experience: '上庭交流',
    uscis_interview: 'USCIS 面谈', ice_experience: 'ICE 经历', lawyer_review: '律师点评', tipoff: '投稿爆料'
  };
  const labelNames = { official_policy: '官方政策', personal_experience: '个人经历', community_summary: '社区整理', question: '问题求助' };
  const state = { session: null, profile: null, category: '', posts: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const initial = (post) => String(post?.profiles?.display_name || '唐').trim().slice(0, 1).toUpperCase();
  const dateText = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '';

  async function token() {
    const { data } = await window.supabaseClient.auth.getSession();
    state.session = data.session || null;
    return state.session?.access_token || '';
  }

  async function api(method = 'GET', body, query = '') {
    const accessToken = await token();
    const response = await fetch(`${apiUrl}${query}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function syncAccountUi() {
    $('login-open').classList.toggle('hidden', Boolean(state.session));
    $('logout-button').classList.toggle('hidden', !state.session);
    $('account-label').textContent = state.profile?.display_name || (state.session ? '已登录' : '');
  }

  function requireLogin(next) {
    if (state.session) return next();
    $('auth-message').textContent = '登录后即可发布和互动。';
    $('auth-dialog').showModal();
  }

  function openComposer(category = 'uscis_interview') {
    requireLogin(() => {
      $('post-category').value = categoryNames[category] ? category : 'uscis_interview';
      renderStructuredFields();
      $('composer-dialog').showModal();
    });
  }

  function renderStructuredFields() {
    const category = $('post-category').value;
    const box = $('structured-fields');
    const field = (label, id, placeholder = '', type = 'text') => `<label>${label}<input id="${id}" type="${type}" placeholder="${esc(placeholder)}" /></label>`;
    if (category === 'uscis_interview') {
      box.innerHTML = `${field('州/地区','field-state','例如 NY')}${field('面谈办公室','field-office','例如 New York Asylum Office')}${field('申请类型','field-case','庇护、婚姻绿卡、入籍等')}${field('面谈日期','field-date','', 'date')}<label>目前结果<select id="field-outcome"><option value="">尚未公布</option><option>通过</option><option>等待决定</option><option>补件/RFE</option><option>二次面谈</option><option>转移民法庭</option><option>其他</option></select></label>${field('城市','field-city','可选')}`;
    } else if (category === 'court_experience') {
      box.innerHTML = `${field('州/地区','field-state','例如 CA')}${field('移民法庭','field-office','例如 San Francisco Immigration Court')}${field('法官姓名','field-judge','可选')}${field('案件类型','field-case','庇护个案听证等')}${field('上庭日期','field-date','', 'date')}<label>结果<select id="field-outcome"><option value="">请选择</option><option>批准</option><option>拒绝</option><option>延期</option><option>保留决定</option><option>其他</option></select></label>`;
    } else if (category === 'lawyer_review') {
      box.innerHTML = `${field('律师或律所','field-lawyer','请填写公开执业名称')}${field('州/地区','field-state','例如 NY')}${field('城市','field-city','可选')}${field('服务类型','field-case','庇护、上庭、绿卡等')}`;
    } else if (category === 'ice_experience') {
      box.innerHTML = `${field('州/地区','field-state','例如 TX')}${field('城市','field-city','可选')}${field('ICE办公室','field-office','可选')}${field('发生日期','field-date','', 'date')}`;
    } else {
      box.innerHTML = `${field('州/地区','field-state','可选')}${field('城市','field-city','可选')}`;
    }
    $('review-note').textContent = ['lawyer_review','tipoff'].includes(category)
      ? '这个板块默认进入人工审核。涉及指控时，平台可能联系双方核对；请不要公开隐私或未经核实的身份信息。'
      : '普通低风险内容通过基础规则检查后可发布；敏感指控或隐私信息会进入人工审核。';
  }

  function fieldValue(id) { return $(id)?.value?.trim() || null; }

  function postMeta(post) {
    const bits = [];
    if (post.location_state) bits.push(post.location_state);
    if (post.location_city) bits.push(post.location_city);
    if (post.agency_office) bits.push(post.agency_office);
    if (post.case_type) bits.push(post.case_type);
    if (post.outcome) bits.push(`结果：${post.outcome}`);
    if (post.event_date) bits.push(post.event_date);
    if (post.judge_name) bits.push(`法官：${post.judge_name}`);
    if (post.lawyer_or_firm) bits.push(post.lawyer_or_firm);
    return bits;
  }

  function card(post) {
    const author = post.profiles?.display_name || '唐人用户';
    const own = state.session?.user?.id === post.user_id;
    const pending = post.status !== 'published';
    return `<article class="post-card" data-post-id="${esc(post.id)}">
      <header><div class="author-line"><span class="avatar">${esc(initial(post))}</span><div><b>${esc(author)}</b><small>${esc(dateText(post.created_at))}</small></div></div><div><span class="badge category">${esc(categoryNames[post.category] || post.category)}</span> ${pending ? '<span class="badge pending">审核中</span>' : ''}</div></header>
      <h3><button type="button" data-open-post="${esc(post.id)}">${esc(post.title)}</button></h3>
      <p class="excerpt">${esc(post.content.slice(0, 260))}${post.content.length > 260 ? '…' : ''}</p>
      <div class="post-meta"><span class="badge">${esc(labelNames[post.content_label] || '个人经历')}</span>${postMeta(post).map((item) => `<span>${esc(item)}</span>`).join('')}</div>
      <div class="post-actions"><button type="button" data-like-post="${esc(post.id)}">赞 ${Number(post.like_count || 0)}</button><button type="button" data-open-post="${esc(post.id)}">评论 ${Number(post.comment_count || 0)}</button><button type="button" data-report-post="${esc(post.id)}">举报</button>${own ? `<button type="button" data-delete-post="${esc(post.id)}">下架</button>` : ''}</div>
    </article>`;
  }

  function renderFeed() {
    $('post-feed').innerHTML = state.posts.length ? state.posts.map(card).join('') : '<div class="empty">这个板块还没有公开帖子。你可以成为第一个分享经历的人。</div>';
  }

  async function loadFeed() {
    $('feed-message').className = 'notice';
    $('feed-message').textContent = '正在读取社区内容…';
    try {
      const query = state.category ? `?category=${encodeURIComponent(state.category)}` : '';
      const data = await api('GET', null, query);
      state.posts = data.posts || [];
      $('feed-message').classList.add('hidden');
      renderFeed();
    } catch (error) {
      $('feed-message').className = 'notice error';
      $('feed-message').textContent = `暂时无法读取：${error.message}`;
    }
  }

  async function openPost(postId) {
    try {
      const data = await api('GET', null, `?post_id=${encodeURIComponent(postId)}`);
      const post = data.posts?.[0];
      if (!post) throw new Error('帖子不存在或仍在审核');
      const comments = data.comments || [];
      $('post-detail').innerHTML = `<p class="eyebrow">${esc(categoryNames[post.category] || '')}</p><h2>${esc(post.title)}</h2><div class="author-line"><span class="avatar">${esc(initial(post))}</span><div><b>${esc(post.profiles?.display_name || '唐人用户')}</b><small>${esc(dateText(post.created_at))}</small></div></div><div class="post-meta">${postMeta(post).map((item) => `<span>${esc(item)}</span>`).join('')}</div><p class="detail-body">${esc(post.content)}</p><div class="comment-list"><h3>评论</h3>${comments.length ? comments.map((comment) => `<article class="comment"><b>${esc(comment.profiles?.display_name || '唐人用户')}</b><p>${esc(comment.content)}</p><small>${esc(dateText(comment.created_at))}${comment.status !== 'published' ? ' · 审核中' : ''}</small></article>`).join('') : '<p>暂无评论</p>'}</div><form class="comment-form" data-comment-form="${esc(post.id)}"><textarea name="content" maxlength="3000" placeholder="写下你的回复（需要登录）" required></textarea><button type="submit">发表评论</button><div class="form-message"></div></form>`;
      if (!$('post-dialog').open) $('post-dialog').showModal();
    } catch (error) { alert(error.message); }
  }

  async function handleAuth(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    $('auth-message').textContent = '正在验证账号…';
    try {
      const response = await fetch(accountUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ identifier:$('auth-identifier').value, password:$('auth-password').value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '登录失败');
      const session = data.session;
      const result = await window.supabaseClient.auth.setSession({ access_token:session.access_token, refresh_token:session.refresh_token });
      if (result.error) throw result.error;
      state.session = result.data.session;
      state.profile = null;
      syncAccountUi();
      $('auth-dialog').close();
      $('auth-form').reset();
      await loadFeed();
    } catch (error) { $('auth-message').textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function handleCompose(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    $('composer-message').textContent = '正在检查并提交…';
    try {
      const data = await api('POST', {
        action:'create_post', category:$('post-category').value, content_label:$('post-label').value,
        title:$('post-title').value, content:$('post-content').value,
        location_state:fieldValue('field-state'), location_city:fieldValue('field-city'), agency_office:fieldValue('field-office'),
        case_type:fieldValue('field-case'), event_date:fieldValue('field-date'), outcome:fieldValue('field-outcome'),
        judge_name:fieldValue('field-judge'), lawyer_or_firm:fieldValue('field-lawyer')
      });
      state.profile = data.profile || state.profile;
      syncAccountUi();
      alert(data.message);
      $('composer-dialog').close();
      $('composer-form').reset();
      renderStructuredFields();
      await loadFeed();
    } catch (error) { $('composer-message').textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function mutatePost(action, postId, extra = {}) {
    return api('POST', { action, post_id:postId, ...extra });
  }

  function bind() {
    $('login-open').addEventListener('click', () => $('auth-dialog').showModal());
    $('publish-open').addEventListener('click', () => openComposer(state.category || 'uscis_interview'));
    $('hero-publish').addEventListener('click', () => openComposer('uscis_interview'));
    $('auth-form').addEventListener('submit', handleAuth);
    $('composer-form').addEventListener('submit', handleCompose);
    $('post-category').addEventListener('change', renderStructuredFields);
    $('feed-refresh').addEventListener('click', loadFeed);
    $('show-all').addEventListener('click', () => { state.category=''; $('feed-title').textContent='最新帖子'; document.querySelectorAll('[data-category]').forEach((item)=>item.classList.remove('active')); loadFeed(); });
    $('category-grid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]'); if (!button) return;
      state.category = button.dataset.category;
      $('feed-title').textContent = categoryNames[state.category];
      document.querySelectorAll('[data-category]').forEach((item)=>item.classList.toggle('active', item === button));
      document.querySelector('.community-layout').scrollIntoView({behavior:'smooth'}); loadFeed();
    });
    document.addEventListener('click', async (event) => {
      const close = event.target.closest('[data-close]'); if (close) $(close.dataset.close)?.close();
      const open = event.target.closest('[data-open-post]'); if (open) openPost(open.dataset.openPost);
      const like = event.target.closest('[data-like-post]'); if (like) requireLogin(async () => { try { await mutatePost('toggle_like', like.dataset.likePost); await loadFeed(); } catch (error) { alert(error.message); } });
      const report = event.target.closest('[data-report-post]'); if (report) requireLogin(async () => { const reason=prompt('请简要填写举报理由'); if (!reason) return; try { await mutatePost('report_post', report.dataset.reportPost, {reason}); alert('举报已提交'); } catch (error) { alert(error.message); } });
      const remove = event.target.closest('[data-delete-post]'); if (remove && confirm('确定下架这篇帖子吗？')) { try { await mutatePost('unpublish_post', remove.dataset.deletePost); await loadFeed(); } catch (error) { alert(error.message); } }
    });
    $('post-detail').addEventListener('submit', (event) => {
      const form = event.target.closest('[data-comment-form]'); if (!form) return;
      event.preventDefault(); requireLogin(async () => { const message=form.querySelector('.form-message'); try { const data=await mutatePost('create_comment', form.dataset.commentForm, {content:form.elements.content.value}); message.textContent=data.pending?'评论已提交审核':'评论成功'; form.reset(); await openPost(form.dataset.commentForm); } catch (error) { message.textContent=error.message; } });
    });
    $('logout-button').addEventListener('click', async () => { await window.supabaseClient.auth.signOut(); state.session=null; state.profile=null; syncAccountUi(); loadFeed(); });
  }

  async function init() {
    const requestedCategory = new URLSearchParams(window.location.search).get('category');
    if (requestedCategory && categoryNames[requestedCategory]) {
      state.category = requestedCategory;
      $('feed-title').textContent = categoryNames[requestedCategory];
      document.querySelector(`[data-category="${requestedCategory}"]`)?.classList.add('active');
    }
    renderStructuredFields(); bind(); await token(); syncAccountUi(); await loadFeed();
    window.supabaseClient.auth.onAuthStateChange((_event, session) => { state.session=session; syncAccountUi(); });
  }
  init().catch((error) => { $('feed-message').textContent = error.message; });
})();

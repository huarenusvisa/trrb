(() => {
  const accountUrl = '/.netlify/functions/unified-account-login';
  const state = { session:null, profile:null, posts:[], filter:'all', relation:'none', userId:'' };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateText = (value) => value ? new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '';

  async function auth() {
    const { data } = await window.supabaseClient.auth.getSession();
    state.session = data.session || null;
    syncAccountUi();
    return state.session;
  }

  function syncAccountUi() {
    $('login-open').classList.toggle('hidden', Boolean(state.session));
    $('logout-button').classList.toggle('hidden', !state.session);
    $('account-label').textContent = state.session ? '已登录' : '';
  }

  function publicMedia(bucket, path) {
    if (!path) return '';
    const { data } = window.supabaseClient.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || '';
  }

  async function signedPostMedia(path) {
    if (!path) return '';
    const { data, error } = await window.supabaseClient.storage.from('profile-post-media').createSignedUrl(path, 3600);
    return error ? '' : (data?.signedUrl || '');
  }

  async function loadRelation() {
    if (!state.session || state.session.user.id === state.userId) { state.relation='none'; return; }
    const { data, error } = await window.supabaseClient.from('user_follows').select('status').eq('follower_user_id',state.session.user.id).eq('followed_user_id',state.userId).maybeSingle();
    if (!error) state.relation = data?.status || 'none';
  }

  async function followCounts() {
    const [followers,following] = await Promise.all([
      window.supabaseClient.from('user_follows').select('*',{count:'exact',head:true}).eq('followed_user_id',state.userId).eq('status','accepted'),
      window.supabaseClient.from('user_follows').select('*',{count:'exact',head:true}).eq('follower_user_id',state.userId).eq('status','accepted')
    ]);
    return { followers:followers.count||0, following:following.count||0 };
  }

  async function loadProfile() {
    const { data, error } = await window.supabaseClient.from('profiles').select('id,display_name,avatar_key,avatar_path,cover_path,bio,status,is_private').eq('id',state.userId).maybeSingle();
    if (error) throw error;
    if (!data || (data.status !== 'active' && state.session?.user?.id !== state.userId)) throw new Error('该用户当前不可访问');
    state.profile = data;
  }

  async function loadPosts() {
    const { data, error } = await window.supabaseClient.from('profile_posts')
      .select('id,user_id,caption,tags,status,created_at,updated_at,profile_post_media(id,post_id,owner_user_id,media_type,storage_path,mime_type,width,height,duration_ms,sort_order)')
      .eq('user_id',state.userId).eq('status','published').order('created_at',{ascending:false}).limit(60);
    if (error) throw error;
    state.posts = data || [];
    for (const post of state.posts) {
      post.profile_post_media = (post.profile_post_media || []).sort((a,b)=>a.sort_order-b.sort_order);
      for (const media of post.profile_post_media) media.signed_url = await signedPostMedia(media.storage_path);
    }
  }

  function renderHero(counts) {
    const p=state.profile;
    $('profile-name').textContent=p.display_name||'唐人用户';
    $('profile-bio').textContent=p.bio||'这个人还没有填写简介。';
    $('privacy-badge').classList.toggle('hidden',!p.is_private);
    $('followers-count').innerHTML=`${counts.followers} <span>粉丝</span>`;
    $('following-count').innerHTML=`${counts.following} <span>关注</span>`;
    $('post-count').innerHTML=`${state.posts.length} <span>动态</span>`;
    const avatar=publicMedia('profile-media',p.avatar_path);
    const cover=publicMedia('profile-media',p.cover_path);
    const av=$('profile-avatar');
    av.textContent=avatar?'':String(p.display_name||'唐').trim().slice(0,1).toUpperCase();
    av.style.backgroundImage=avatar?`url("${avatar.replaceAll('"','%22')}")`:'';
    $('profile-cover').style.backgroundImage=cover?`url("${cover.replaceAll('"','%22')}")`:'';
    const own=state.session?.user?.id===state.userId;
    $('follow-button').classList.toggle('hidden',own);
    $('follow-button').textContent=state.relation==='accepted'?'已关注':state.relation==='pending'?'已申请':p.is_private?'申请关注':'关注';
    $('profile-hero').classList.remove('hidden');
  }

  function renderPosts() {
    const rows=state.posts.filter((post)=>{
      if(state.filter==='all')return true;
      return (post.profile_post_media||[]).some((media)=>media.media_type===state.filter);
    });
    $('profile-posts').innerHTML=rows.length?rows.map((post)=>{
      const media=post.profile_post_media||[], first=media[0];
      const mediaHtml=!first?'':first.media_type==='video'
        ?`<div class="video-wrap"><video class="post-media" controls preload="metadata" src="${esc(first.signed_url)}"></video><span class="video-badge">视频</span></div>`
        :`<img class="post-media" loading="lazy" src="${esc(first.signed_url)}" alt="" />`;
      return `<article class="post-card">${mediaHtml}<div class="post-body">${post.caption?`<p class="post-caption">${esc(post.caption)}</p>`:''}${post.tags?.length?`<div class="tags">${post.tags.slice(0,5).map(tag=>`<span class="tag">#${esc(tag)}</span>`).join('')}</div>`:''}<div class="post-time">${esc(dateText(post.created_at))}${media.length>1?` · ${media.length} 个媒体`:''}</div></div></article>`;
    }).join(''):'<div class="empty">暂无符合条件的主页动态。</div>';
  }

  async function refresh() {
    $('page-message').className='notice'; $('page-message').textContent='正在读取用户主页…';
    try {
      await auth();
      await loadProfile();
      await loadRelation();
      const [counts] = await Promise.all([followCounts(),loadPosts()]);
      renderHero(counts);
      const locked=state.profile.is_private && state.session?.user?.id!==state.userId && state.relation!=='accepted';
      $('private-panel').classList.toggle('hidden',!locked);
      $('content-section').classList.toggle('hidden',locked);
      if(!locked) renderPosts();
      $('page-message').classList.add('hidden');
    } catch(error) {
      $('page-message').className='notice error'; $('page-message').textContent=error.message||'暂时无法读取用户主页';
    }
  }

  async function toggleFollow() {
    if(!state.session){$('auth-dialog').showModal();return;}
    if(state.session.user.id===state.userId)return;
    const button=$('follow-button'); button.disabled=true;
    try {
      if(state.relation==='none'){
        const {data,error}=await window.supabaseClient.from('user_follows').insert({follower_user_id:state.session.user.id,followed_user_id:state.userId}).select('status').single();
        if(error && error.code!=='23505')throw error;
        state.relation=data?.status||state.relation;
        if(!data)await loadRelation();
      }else{
        const {error}=await window.supabaseClient.from('user_follows').delete().eq('follower_user_id',state.session.user.id).eq('followed_user_id',state.userId);
        if(error)throw error; state.relation='none';
      }
      await refresh();
    } catch(error){alert(error.message||'操作失败');}
    finally{button.disabled=false;}
  }

  async function handleAuth(event){
    event.preventDefault();
    const button=event.submitter||event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
    $('auth-message').textContent='正在验证账号…';
    try{
      const response=await fetch(accountUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:$('auth-identifier').value,password:$('auth-password').value})});
      const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.error||'登录失败');
      const result=await window.supabaseClient.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token}); if(result.error)throw result.error;
      $('auth-dialog').close();$('auth-form').reset();await refresh();
    }catch(error){$('auth-message').textContent=error.message;}finally{button.disabled=false;}
  }

  function bind(){
    $('login-open').addEventListener('click',()=>$('auth-dialog').showModal());
    $('logout-button').addEventListener('click',async()=>{await window.supabaseClient.auth.signOut();await refresh();});
    $('auth-form').addEventListener('submit',handleAuth);
    $('follow-button').addEventListener('click',()=>void toggleFollow());
    document.querySelectorAll('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach((x)=>x.classList.toggle('active',x===button));renderPosts();}));
    document.addEventListener('click',(event)=>{const close=event.target.closest('[data-close]');if(close)$(close.dataset.close)?.close();});
  }

  const params=new URLSearchParams(location.search);
  state.userId=params.get('id')||'';
  if(!state.userId){$('page-message').className='notice error';$('page-message').textContent='缺少用户编号。';return;}
  bind(); refresh();
})();
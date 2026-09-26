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
    $('publish-dynamic').classList.toggle('hidden',!own);
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


  function parseTags(value) {
    return Array.from(new Set(String(value || '').split(/[，,\s#]+/).map((tag)=>tag.trim()).filter(Boolean))).slice(0,5);
  }

  function safeFileName(name) {
    return String(name || 'upload').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-80) || 'upload';
  }

  function mediaKind(file) {
    return file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : '';
  }

  async function videoDurationMs(file) {
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const video=document.createElement('video');
      video.preload='metadata';
      video.onloadedmetadata=()=>{const value=Number.isFinite(video.duration)?Math.round(video.duration*1000):0;URL.revokeObjectURL(url);resolve(value);};
      video.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('无法读取视频时长'));};
      video.src=url;
    });
  }

  async function validateDynamicFiles(files) {
    const list=Array.from(files || []);
    if(!list.length) throw new Error('请至少选择一张图片或一个视频。');
    if(list.length>4) throw new Error('每条动态最多选择 4 张图片。');
    const kinds=list.map(mediaKind);
    if(kinds.some((kind)=>!kind)) throw new Error('存在不支持的媒体格式。');
    const videos=kinds.filter((kind)=>kind==='video').length;
    if(videos && (videos>1 || list.length>1)) throw new Error('视频需要单独发布，每条动态最多 1 个视频。');
    for(const file of list){
      const kind=mediaKind(file);
      const limit=kind==='video'?80*1024*1024:12*1024*1024;
      if(file.size>limit) throw new Error(kind==='video'?'视频不能超过 80MB。':'单张图片不能超过 12MB。');
      if(kind==='video'){
        const duration=await videoDurationMs(file);
        if(duration>120000) throw new Error('视频最长 2 分钟。');
      }
    }
    return list;
  }

  async function imageDimensions(file) {
    if(!file.type.startsWith('image/')) return { width:null, height:null };
    return new Promise((resolve)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{const result={width:img.naturalWidth||null,height:img.naturalHeight||null};URL.revokeObjectURL(url);resolve(result);};
      img.onerror=()=>{URL.revokeObjectURL(url);resolve({width:null,height:null});};
      img.src=url;
    });
  }

  function updateDynamicMediaSummary() {
    const files=Array.from($('dynamic-media').files || []);
    if(!files.length){$('dynamic-media-summary').textContent='尚未选择媒体';return;}
    $('dynamic-media-summary').textContent=files.map((file)=>`${mediaKind(file)==='video'?'视频':'图片'} · ${file.name} · ${(file.size/1024/1024).toFixed(1)}MB`).join('；');
  }

  async function publishDynamic(event) {
    event.preventDefault();
    if(!state.session || state.session.user.id!==state.userId){$('auth-dialog').showModal();return;}
    const button=$('dynamic-submit');
    button.disabled=true;
    $('dynamic-message').textContent='正在检查媒体…';
    let postId='';
    const uploaded=[];
    try{
      const files=await validateDynamicFiles($('dynamic-media').files);
      const tags=parseTags($('dynamic-tags').value);
      if(tags.some((tag)=>tag.length>24)) throw new Error('单个标签不能超过 24 个字符。');
      const caption=$('dynamic-caption').value.trim();
      $('dynamic-message').textContent='正在创建动态…';
      const {data:post,error:postError}=await window.supabaseClient.from('profile_posts').insert({
        user_id:state.session.user.id,caption,tags,status:'published'
      }).select('id').single();
      if(postError) throw postError;
      postId=post.id;

      for(let index=0;index<files.length;index+=1){
        const file=files[index];
        $('dynamic-message').textContent=`正在上传第 ${index+1}/${files.length} 个文件…`;
        const path=`${state.session.user.id}/${postId}/${Date.now()}-${index}-${safeFileName(file.name)}`;
        const {error:uploadError}=await window.supabaseClient.storage.from('profile-post-media').upload(path,file,{contentType:file.type||undefined,upsert:false,cacheControl:'31536000'});
        if(uploadError) throw uploadError;
        uploaded.push(path);
        const kind=mediaKind(file);
        const dims=await imageDimensions(file);
        const durationMs=kind==='video'?await videoDurationMs(file):null;
        const {error:mediaError}=await window.supabaseClient.from('profile_post_media').insert({
          post_id:postId,
          owner_user_id:state.session.user.id,
          media_type:kind,
          storage_path:path,
          mime_type:file.type || (kind==='video'?'video/mp4':'image/jpeg'),
          width:dims.width,
          height:dims.height,
          duration_ms:durationMs,
          sort_order:index
        });
        if(mediaError) throw mediaError;
      }

      $('dynamic-message').textContent='发布成功。';
      $('dynamic-form').reset();
      $('dynamic-media-summary').textContent='尚未选择媒体';
      $('dynamic-counter').textContent='0/2000';
      $('dynamic-dialog').close();
      await refresh();
      document.querySelector('.content-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      if(uploaded.length) await window.supabaseClient.storage.from('profile-post-media').remove(uploaded).catch(()=>undefined);
      if(postId){
        await window.supabaseClient.from('profile_post_media').delete().eq('post_id',postId).catch(()=>undefined);
        await window.supabaseClient.from('profile_posts').update({status:'deleted'}).eq('id',postId).catch(()=>undefined);
      }
      $('dynamic-message').textContent=error.message||'发布失败，请重试。';
    }finally{
      button.disabled=false;
    }
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
    $('publish-dynamic').addEventListener('click',()=>{$('dynamic-message').textContent='';$('dynamic-dialog').showModal();});
    $('dynamic-form').addEventListener('submit',publishDynamic);
    $('dynamic-media').addEventListener('change',updateDynamicMediaSummary);
    $('dynamic-caption').addEventListener('input',()=>{$('dynamic-counter').textContent=`${$('dynamic-caption').value.length}/2000`;});
    document.querySelectorAll('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach((x)=>x.classList.toggle('active',x===button));renderPosts();}));
    document.addEventListener('click',(event)=>{const close=event.target.closest('[data-close]');if(close)$(close.dataset.close)?.close();});
  }

  const params=new URLSearchParams(location.search);
  state.userId=params.get('id')||'';
  if(!state.userId){$('page-message').className='notice error';$('page-message').textContent='缺少用户编号。';return;}
  bind(); refresh();
})();
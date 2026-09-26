(() => {
  const accountUrl = '/.netlify/functions/unified-account-login';
  const state = { session:null, profile:null, posts:[], communityPosts:[], filter:'all', relation:'none', userId:'', draftId:null, ownerView:document.body.dataset.profileView==='owner', communityTotal:0, dynamicTotal:0, loadWarning:'', detailVersion:0 };
  const social=window.TrrbSocial;
  const canManage=()=>state.ownerView && Boolean(state.session?.user?.id) && state.session.user.id===state.userId;
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

  async function loadPosts(append=false) {
    if(!append){state.posts=[];state.communityPosts=[];state.communityTotal=0;state.dynamicTotal=0;}
    state.loadWarning='';
    const dynamicOffset=state.posts.length, communityOffset=state.communityPosts.length;
    async function dynamics(){
      if(append&&dynamicOffset>=state.dynamicTotal)return;
      let q=window.supabaseClient.from('profile_posts').select('id,user_id,caption,tags,status,created_at,updated_at,profile_post_media(id,post_id,owner_user_id,media_type,storage_path,mime_type,width,height,duration_ms,sort_order)',{count:'exact'}).eq('user_id',state.userId);
      q=canManage()?q.neq('status','deleted'):q.eq('status','published');
      const {data,error,count}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(dynamicOffset,dynamicOffset+29);
      if(error)throw error;
      const rows=data||[];
      await Promise.all(rows.map(async post=>{
        post.profiles=state.profile;
        post.profile_post_media=(post.profile_post_media||[]).sort((a,b)=>a.sort_order-b.sort_order);
        const first=post.profile_post_media[0];if(first)first.signed_url=await signedPostMedia(first.storage_path);
      }));
      state.posts.push(...rows);state.dynamicTotal=count??state.posts.length;
    }
    async function community(){
      if(append&&communityOffset>=state.communityTotal)return;
      const result=await social.authorCommunityPosts(window.supabaseClient,state.userId,{offset:communityOffset,owner:canManage()});
      state.communityPosts.push(...result.posts);state.communityTotal=result.count;
    }
    const results=await Promise.allSettled([dynamics(),community()]);
    if(results.every(r=>r.status==='rejected'))throw new Error('作品读取失败，请刷新重试');
    const failed=results.map((r,i)=>r.status==='rejected'?(i?'社区帖子':'主页动态'):'').filter(Boolean);
    if(failed.length)state.loadWarning=failed.join('、')+'暂时读取失败，已展示其他可用内容，请刷新重试。';
  }

  function renderHero(counts) {
    const p=state.profile;
    $('profile-name').textContent=p.display_name||'唐人用户';
    $('profile-bio').textContent=p.bio||'这个人还没有填写简介。';
    $('privacy-badge').classList.toggle('hidden',!p.is_private);
    $('followers-count').innerHTML=`${counts.followers} <span>粉丝</span>`;
    $('following-count').innerHTML=`${counts.following} <span>关注</span>`;
    $('post-count').innerHTML=`${state.dynamicTotal+state.communityTotal} <span>作品</span>`;
    const cover=publicMedia('profile-media',p.cover_path);
    const av=$('profile-avatar');av.style.backgroundImage='';av.innerHTML=social.avatar(p,window.supabaseClient,true);
    $('profile-cover').style.backgroundImage=cover?`url("${cover.replaceAll('"','%22')}")`:'';

    const own=state.session?.user?.id===state.userId;
    $('follow-button').classList.toggle('hidden',own);
    $('publish-dynamic').classList.toggle('hidden',!canManage());
    $('owner-panel')?.classList.toggle('hidden',!canManage());
    if($('preview-public-profile'))$('preview-public-profile').href=social.profileHref(state.userId);
    if($('manage-my-account'))$('manage-my-account').classList.toggle('hidden',!own||state.ownerView);
    $('follow-button').textContent=state.relation==='accepted'?'已关注':state.relation==='pending'?'已申请':p.is_private?'申请关注':'关注';
    $('profile-hero').classList.remove('hidden');
    window.TrrbDetail.syncFollow($('post-detail-dialog'));
  }

  function renderPosts() {
    const rows=social.merge(state.communityPosts,state.posts).filter(item=>{
      if(state.filter==='all')return true;
      if(state.filter==='community')return item.type==='community';
      if(state.filter==='dynamic')return item.type==='profile';
      return item.type==='profile'&&(item.post.profile_post_media||[]).some(m=>m.media_type===state.filter);
    });
    $('profile-posts').innerHTML=rows.length?rows.map(item=>social.card(item.post,item.type,{client:window.supabaseClient,owner:canManage()})).join(''):'<div class="empty">当前分类暂无作品。可切换“全部”查看公开动态和社区帖子。</div>';
    $('profile-load-more')?.classList.toggle('hidden',state.posts.length>=state.dynamicTotal&&state.communityPosts.length>=state.communityTotal);
  }

  async function loadPcPostComments(postId) {
    const { data, error } = await window.supabaseClient
      .from('profile_post_comments')
      .select('id,post_id,user_id,content,status,created_at,profiles!profile_post_comments_user_id_fkey(display_name,avatar_key,avatar_path)')
      .eq('post_id',postId)
      .eq('status','published')
      .order('created_at',{ascending:true})
      .limit(300);
    if(error) throw error;
    return data || [];
  }

  async function openPcPost(postId) {
    if(!social.uuid(postId))return;
    const version=++state.detailVersion;
    window.TrrbDetail.prepare($('post-detail-dialog'),postId);
    $('post-detail-content').innerHTML='<div class="notice">正在打开内容…</div>';
    if(!$('post-detail-dialog').open)$('post-detail-dialog').showModal();
    try{
      let post=state.posts.find(p=>p.id===postId);
      if(!post){
        const {data,error}=await window.supabaseClient.from('profile_posts').select('id,user_id,caption,tags,status,created_at,profile_post_media(*)').eq('id',postId).eq('user_id',state.userId).eq('status','published').maybeSingle();
        if(error)throw error;post=data;
      }
      if(!post)throw new Error('这条内容已下架、未公开或你暂无查看权限。');
      const media=(post.profile_post_media||[]).slice().sort((a,b)=>a.sort_order-b.sort_order);
      await Promise.all(media.map(async item=>{item.signed_url=await signedPostMedia(item.storage_path);}));
      if(version!==state.detailVersion)return;
      const mediaHtml=media.map(item=>!item.signed_url?'<p class="notice detail-media-error">媒体暂时不可用，正文仍可阅读。</p>':item.media_type==='video'
        ?`<video class="detail-media" controls playsinline preload="metadata" src="${esc(item.signed_url)}"></video>`
        :`<img class="detail-media" src="${esc(item.signed_url)}" alt="动态图片" />`).join('');
      $('post-detail-content').innerHTML=`<div class="author-line"><a class="note-author" href="${social.profileHref(state.userId)}">${social.avatar(state.profile,window.supabaseClient)}<span>${esc(state.profile?.display_name||'唐人用户')}</span></a></div>${mediaHtml}${post.caption?`<div class="detail-copy">${social.linkify(post.caption)}</div>`:''}${post.tags?.length?`<div class="detail-tags">${post.tags.slice(0,5).map(tag=>`<span class="tag">#${esc(tag)}</span>`).join('')}</div>`:''}<div class="detail-comment-head"><h3>评论</h3></div>${state.session?`<form class="detail-comment-form" data-pc-comment-form="${esc(post.id)}"><textarea name="content" maxlength="3000" placeholder="写下你的评论…" required></textarea><button type="submit">发表评论</button><div class="form-message"></div></form>`:'<p>登录后可以发表评论。<button type="button" data-detail-login>登录</button></p>'}<div id="dynamic-comment-results" aria-live="polite">正在读取评论…</div>`;
      window.TrrbDetail.enhance($('post-detail-dialog'),{
        postId,followSource:$('follow-button'),onFollow:toggleFollow,publishedAt:post.created_at
      });
      // The article opens independently; a comment-service error cannot blank it.
      try{
        const comments=await loadPcPostComments(postId);if(version!==state.detailVersion)return;
        $('dynamic-comment-results').innerHTML=comments.length?comments.map(comment=>`<article class="detail-comment"><div class="detail-comment-top"><a class="note-author" href="${social.profileHref(comment.user_id)}">${social.avatar(comment.profiles,window.supabaseClient)}<strong>${esc(comment.profiles?.display_name||'唐人用户')}</strong></a><small>${esc(dateText(comment.created_at))}</small></div><p>${social.linkify(comment.content)}</p></article>`).join(''):'<p>暂无评论。</p>';
        window.TrrbDetail.restoreScroll($('post-detail-dialog'));
      }catch(error){if(version===state.detailVersion&&$('dynamic-comment-results'))$('dynamic-comment-results').innerHTML=`<p class="notice">评论暂时无法读取，正文不受影响。<button type="button" data-retry-dynamic="${esc(postId)}">重试</button></p>`;}
    }catch(error){if(version===state.detailVersion)$('post-detail-content').innerHTML=`<div class="notice error">${esc(error.message||'内容读取失败')}</div>`;}
  }

  async function submitPcComment(form) {
    if(!state.session){$('auth-dialog').showModal();return;}
    const content=form.elements.content.value.trim();
    if(!content) return;
    const message=form.querySelector('.form-message');
    const activeDetailVersion=state.detailVersion;
    try{
      const {error}=await window.supabaseClient.rpc('create_profile_post_comment',{p_post_id:form.dataset.pcCommentForm,p_content:content});
      if(error) throw error;
      form.reset();
      if($('post-detail-dialog').open&&state.detailVersion===activeDetailVersion)await openPcPost(form.dataset.pcCommentForm);
    }catch(error){message.textContent=error.message||'评论失败';}
  }

  async function refresh() {
    $('profile-hero').classList.add('hidden');$('content-section').classList.add('hidden');$('private-panel').classList.add('hidden');$('owner-panel')?.classList.add('hidden');
    $('page-message').className='notice';$('page-message').textContent='正在读取作品…';
    try {
      await auth();
      if(state.ownerView){
        state.userId=state.session?.user?.id||'';
        if(!state.userId){state.posts=[];state.communityPosts=[];$('profile-posts').innerHTML='';$('post-detail-dialog').close();$('dynamic-dialog').close();$('page-message').textContent='请先登录，个人中心只展示你自己的作品和本地草稿。';return;}
      }
      await loadProfile();await loadRelation();
      const locked=state.profile.is_private && state.session?.user?.id!==state.userId && state.relation!=='accepted';
      state.loadWarning='';
      const counts=await followCounts();
      if(!locked)await loadPosts();else{state.posts=[];state.communityPosts=[];state.dynamicTotal=0;state.communityTotal=0;$('profile-posts').innerHTML='';}
      renderHero(counts);
      $('private-panel').classList.toggle('hidden',!locked);$('content-section').classList.toggle('hidden',locked);
      if(!locked)renderPosts();
      if(state.loadWarning){$('page-message').className='notice error';$('page-message').textContent=state.loadWarning;}else $('page-message').classList.add('hidden');
    }catch(error){$('page-message').className='notice error';$('page-message').textContent=error.message||'暂时无法读取用户主页';}
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



  const PC_DRAFT_MAX = 5;
  const pcDraftKey = () => `trrb:pc-profile-drafts:${state.userId || 'guest'}`;

  function loadLocalDrafts() {
    try {
      const raw = localStorage.getItem(pcDraftKey());
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows.filter((row)=>row && typeof row.id==='string').slice(0,PC_DRAFT_MAX) : [];
    } catch { return []; }
  }

  function writeLocalDrafts(rows) {
    localStorage.setItem(pcDraftKey(), JSON.stringify(rows.slice(0,PC_DRAFT_MAX)));
  }

  function renderLocalDrafts() {
    const rows=loadLocalDrafts();
    const box=$('pc-draft-list');
    if(!box) return;
    box.innerHTML=rows.length?rows.map((draft)=>`
      <div class="pc-draft-item">
        <button type="button" class="pc-draft-main" data-load-pc-draft="${esc(draft.id)}">
          <strong>${esc((draft.caption||draft.tags||'未命名草稿').slice(0,60))}</strong>
          <small>${esc(dateText(draft.savedAt))}</small>
        </button>
        <button type="button" class="pc-draft-delete" data-delete-pc-draft="${esc(draft.id)}">删除</button>
      </div>`).join(''):'<div class="media-summary">暂无本地草稿。</div>';
  }

  function saveLocalDraft() {
    const caption=$('dynamic-caption').value.slice(0,2000);
    const tags=$('dynamic-tags').value.slice(0,220);
    if(!caption.trim() && !tags.trim()) { $('dynamic-message').textContent='没有可保存的文字或标签。'; return; }
    const rows=loadLocalDrafts();
    const id=state.draftId || `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const next=[{id,caption,tags,savedAt:Date.now()},...rows.filter((row)=>row.id!==id)].slice(0,PC_DRAFT_MAX);
    writeLocalDrafts(next);
    state.draftId=id;
    $('dynamic-message').textContent='已保存到当前浏览器草稿箱。';
    renderLocalDrafts();
  }

  function loadLocalDraft(id) {
    const draft=loadLocalDrafts().find((row)=>row.id===id);
    if(!draft) return;
    state.draftId=draft.id;
    $('dynamic-caption').value=draft.caption||'';
    $('dynamic-tags').value=draft.tags||'';
    $('dynamic-counter').textContent=`${$('dynamic-caption').value.length}/2000`;
    $('dynamic-message').textContent='已载入本地草稿。图片和视频需要重新选择。';
  }

  function deleteLocalDraft(id) {
    writeLocalDrafts(loadLocalDrafts().filter((row)=>row.id!==id));
    if(state.draftId===id) state.draftId=null;
    renderLocalDrafts();
  }

  function newLocalDraft() {
    state.draftId=null;
    $('dynamic-caption').value='';
    $('dynamic-tags').value='';
    $('dynamic-media').value='';
    $('dynamic-counter').textContent='0/2000';
    $('dynamic-media-summary').textContent='尚未选择媒体';
    $('dynamic-message').textContent='已新建空白草稿。';
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
    if(!canManage()){$('auth-dialog').showModal();return;}
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
      if(state.draftId) deleteLocalDraft(state.draftId);
      state.draftId=null;
      $('dynamic-form').reset();
      $('dynamic-media-summary').textContent='尚未选择媒体';
      $('dynamic-counter').textContent='0/2000';
      $('dynamic-dialog').close();
      await refresh();
      document.querySelector('.content-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      if(uploaded.length){ try{ await window.supabaseClient.storage.from('profile-post-media').remove(uploaded); }catch{} }
      if(postId){
        try{ await window.supabaseClient.from('profile_post_media').delete().eq('post_id',postId); }catch{}
        try{ await window.supabaseClient.from('profile_posts').update({status:'deleted'}).eq('id',postId); }catch{}
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
    window.TrrbDetail.bind($('post-detail-dialog'),()=>{state.detailVersion++;});
    $('login-open').addEventListener('click',()=>$('auth-dialog').showModal());
    $('logout-button').addEventListener('click',async()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());state.detailVersion++;state.posts=[];state.communityPosts=[];$('post-detail-content').innerHTML='';await window.supabaseClient.auth.signOut();await refresh();});
    $('auth-form').addEventListener('submit',handleAuth);
    $('follow-button').addEventListener('click',()=>void toggleFollow());
    $('publish-dynamic').addEventListener('click',()=>{if(!canManage())return;$('dynamic-message').textContent='';renderLocalDrafts();$('dynamic-dialog').showModal();});
    $('dynamic-form').addEventListener('submit',publishDynamic);
    $('dynamic-media').addEventListener('change',updateDynamicMediaSummary);
    $('save-local-draft').addEventListener('click',saveLocalDraft);
    $('new-local-draft').addEventListener('click',newLocalDraft);
    $('dynamic-caption').addEventListener('input',()=>{$('dynamic-counter').textContent=`${$('dynamic-caption').value.length}/2000`;});
    document.querySelectorAll('[data-filter]').forEach((button)=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach((x)=>x.classList.toggle('active',x===button));renderPosts();}));
    document.addEventListener('click',(event)=>{const close=event.target.closest('[data-close]');if(close)$(close.dataset.close)?.close();const load=event.target.closest('[data-load-pc-draft]');if(load)loadLocalDraft(load.dataset.loadPcDraft);const del=event.target.closest('[data-delete-pc-draft]');if(del)deleteLocalDraft(del.dataset.deletePcDraft);const post=event.target.closest('[data-open-profile-post]');if(post){event.preventDefault();void openPcPost(post.dataset.openProfilePost);}});
    $('post-detail-content').addEventListener('submit',(event)=>{const form=event.target.closest('[data-pc-comment-form]');if(!form)return;event.preventDefault();void submitPcComment(form);});
  }

  function bindOwnerCenter(){
    $('profile-load-more')?.addEventListener('click',async()=>{const b=$('profile-load-more');b.disabled=true;try{await loadPosts(true);renderPosts();if(state.loadWarning)throw new Error(state.loadWarning);}catch(e){$('page-message').className='notice error';$('page-message').textContent=e.message;}finally{b.disabled=false;}});
    document.addEventListener('click',async event=>{
      const retry=event.target.closest('[data-retry-dynamic]');if(retry){void openPcPost(retry.dataset.retryDynamic);return;}
      if(event.target.closest('[data-detail-login]')){$('auth-dialog').showModal();return;}
      if(!canManage())return;
      const edit=event.target.closest('[data-edit-own-dynamic]');
      if(edit){const post=state.posts.find(p=>p.id===edit.dataset.editOwnDynamic);if(!post||post.user_id!==state.session.user.id)return;state.editPostId=post.id;$('edit-dynamic-caption').value=post.caption||'';$('edit-dynamic-tags').value=(post.tags||[]).join(' ');$('edit-dynamic-message').textContent='';$('edit-dynamic-dialog').showModal();}
      const remove=event.target.closest('[data-remove-own-content]');
      if(remove&&confirm('确定下架这条内容吗？')){
        try{if(remove.dataset.kind==='profile'){const {error}=await window.supabaseClient.from('profile_posts').update({status:'deleted'}).eq('id',remove.dataset.removeOwnContent).eq('user_id',state.session.user.id);if(error)throw error;}
        else{const r=await fetch('/.netlify/functions/community-api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.session.access_token},body:JSON.stringify({action:'unpublish_post',post_id:remove.dataset.removeOwnContent})});if(!r.ok)throw new Error('下架失败');}await refresh();}catch(e){alert(e.message);}
      }
    });
    $('owner-drafts')?.addEventListener('click',()=>{if(canManage())$('publish-dynamic').click();});
    $('edit-dynamic-form')?.addEventListener('submit',async event=>{
      event.preventDefault();if(!canManage())return;const b=event.submitter;b.disabled=true;
      try{const {error}=await window.supabaseClient.rpc('update_my_profile_post',{p_post_id:state.editPostId,p_caption:$('edit-dynamic-caption').value,p_tags:parseTags($('edit-dynamic-tags').value)});if(error)throw error;$('edit-dynamic-dialog').close();await refresh();}catch(e){$('edit-dynamic-message').textContent=e.message;}finally{b.disabled=false;}
    });
  }

  const params=new URLSearchParams(location.search);
  state.userId=state.ownerView?'':params.get('id')||'';
  if(!state.ownerView&&!social.uuid(state.userId)){$('page-message').className='notice error';$('page-message').textContent='缺少或无效的用户编号。';return;}
  bind();bindOwnerCenter();
  refresh().then(async()=>{
    if(params.get('post')&&!$('content-section').classList.contains('hidden'))await openPcPost(params.get('post'));
    if(state.ownerView&&canManage()&&params.get('drafts')==='1')$('publish-dynamic').click();
  });
})();
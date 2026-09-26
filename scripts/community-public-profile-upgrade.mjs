import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const changes=new Map();
const read=p=>changes.has(p)?changes.get(p):readFileSync(p,'utf8');
function once(p,a,b){const s=read(p);if(s.split(a).length!==2)throw new Error(`Expected one anchor in ${p}: ${a.slice(0,90)}`);changes.set(p,s.replace(a,b));}
function all(p,a,b){const s=read(p);if(!s.includes(a))throw new Error('Missing anchor '+p);changes.set(p,s.split(a).join(b));}
function section(p,start,end,text){const s=read(p),i=s.indexOf(start),j=s.indexOf(end,i+start.length);if(i<0||j<0||s.indexOf(start,i+start.length)>=0)throw new Error('Ambiguous section '+p);changes.set(p,s.slice(0,i)+text+'\n\n'+s.slice(j));}
const c='community/community.js',u='user/profile.js',ch='community/index.html',uh='user/index.html';
const hashes={ [c]:'fbb9b51c8f707f2d895543f0f6324d40b483d08c',[u]:'fc3d83c2b4118f96f4038b610f12373f0ce4876e',[ch]:'3c0b95f272bc12890a2516bfc21e5889355bdf7c',[uh]:'6ade5729f8f5e4a2adddd0c214f31f63649363af','netlify/functions/community-api.js':'9989697dda00882853342de190f894eeb2f6f40f'};
for(const [p,h] of Object.entries(hashes))if(execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()!==h)throw new Error('Concurrent source modification; reconcile '+p);
once('assets/social-cards.js',"const safeUrl = value => {try", "const safeUrl = value => {if(!value)return '';try");
all(c,'display_name,avatar_key)','display_name,avatar_key,avatar_path)');
all('netlify/functions/community-api.js','display_name,avatar_key)','display_name,avatar_key,avatar_path)');
section(c,'  function card(post) {','  const topicKeywords =',"  function card(post) { return window.TrrbSocial.card(post,'community',{client:window.supabaseClient}); }");
section(c,'  function profileCard(post) {','  function mergedFeedItems()',"  function profileCard(post) { return window.TrrbSocial.card(post,'profile',{client:window.supabaseClient}); }");
once(c,'  async function openPost(postId) {\n    try {',`  async function openPost(postId) {
    if (!window.TrrbSocial.uuid(postId)) return;
    $('post-detail').innerHTML='<div class="notice">正在打开内容…</div>';
    if (!$('post-dialog').open) $('post-dialog').showModal();
    try {`);
once(c,'${esc(post.content)}</p><div class="comment-list">','${window.TrrbSocial.linkify(post.content)}</p><div class="comment-list">');
once(c,'<span class="avatar">${esc(initial(post))}</span>','${window.TrrbSocial.avatar(post.profiles,window.supabaseClient)}');
once(c,'    } catch (error) { alert(error.message); }\n  }\n\n  async function handleAuth','    } catch (error) { $(\'post-detail\').innerHTML=`<div class="notice error">${esc(error.message || \'内容暂不可用\')}</div>`; }\n  }\n\n  async function handleAuth');
once(c,"if (open) openPost(open.dataset.openPost);","if (open) { event.preventDefault(); void openPost(open.dataset.openPost); }");
once(c,"    $('app-drafts-info')?.addEventListener('click', () => alert('APP 草稿箱最多保留 5 个草稿。草稿目前保存在发布设备本地，图片和视频不会跨会话保存。'));",'');
once(c,"    $('account-label').textContent = state.profile?.display_name || (state.session ? '已登录' : '');",`    $('account-label').textContent = state.profile?.display_name || (state.session ? '已登录' : '');
    const mine=$('my-public-profile');
    if(mine){mine.classList.toggle('hidden',!state.session);mine.href=window.TrrbSocial.profileHref(state.session?.user?.id);}`);
once(c,'    renderStructuredFields(); bind(); await token(); syncAccountUi(); await loadFeed();',`    renderStructuredFields(); bind(); await token(); syncAccountUi(); await loadFeed();
    const requestedPost=new URLSearchParams(location.search).get('post');
    if(requestedPost) await openPost(requestedPost);`);

all(u,'display_name,avatar_key)','display_name,avatar_key,avatar_path)');
once(u,"  const state = { session:null, profile:null, posts:[], filter:'all', relation:'none', userId:'', draftId:null };",`  const state = { session:null, profile:null, posts:[], communityPosts:[], filter:'all', relation:'none', userId:'', draftId:null, ownerView:document.body.dataset.profileView==='owner', communityTotal:0, dynamicTotal:0, loadWarning:'', detailVersion:0 };
  const social=window.TrrbSocial;
  const canManage=()=>state.ownerView && Boolean(state.session?.user?.id) && state.session.user.id===state.userId;`);
section(u,'  async function loadPosts() {','  function renderHero(counts)',`  async function loadPosts(append=false) {
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
  }`);
once(u,"    $('post-count').innerHTML=`${state.posts.length} <span>动态</span>`;","    $('post-count').innerHTML=`${state.dynamicTotal+state.communityTotal} <span>作品</span>`;");
section(u,"    const avatar=publicMedia('profile-media',p.avatar_path);","    const own=state.session?.user?.id===state.userId;",`    const cover=publicMedia('profile-media',p.cover_path);
    const av=$('profile-avatar');av.style.backgroundImage='';av.innerHTML=social.avatar(p,window.supabaseClient,true);
    $('profile-cover').style.backgroundImage=cover?\`url("\${cover.replaceAll('"','%22')}")\`:'';`);
once(u,"    $('publish-dynamic').classList.toggle('hidden',!own);",`    $('publish-dynamic').classList.toggle('hidden',!canManage());
    $('owner-panel')?.classList.toggle('hidden',!canManage());
    if($('preview-public-profile'))$('preview-public-profile').href=social.profileHref(state.userId);
    if($('manage-my-account'))$('manage-my-account').classList.toggle('hidden',!own||state.ownerView);`);
section(u,'  function renderPosts() {','  async function loadPcPostComments(postId)',`  function renderPosts() {
    const rows=social.merge(state.communityPosts,state.posts).filter(item=>{
      if(state.filter==='all')return true;
      if(state.filter==='community')return item.type==='community';
      if(state.filter==='dynamic')return item.type==='profile';
      return item.type==='profile'&&(item.post.profile_post_media||[]).some(m=>m.media_type===state.filter);
    });
    $('profile-posts').innerHTML=rows.length?rows.map(item=>social.card(item.post,item.type,{client:window.supabaseClient,owner:canManage()})).join(''):'<div class="empty">当前分类暂无作品。可切换“全部”查看公开动态和社区帖子。</div>';
    $('profile-load-more')?.classList.toggle('hidden',state.posts.length>=state.dynamicTotal&&state.communityPosts.length>=state.communityTotal);
  }`);
section(u,'  async function openPcPost(postId) {','  async function submitPcComment(form)',`  async function openPcPost(postId) {
    if(!social.uuid(postId))return;
    const version=++state.detailVersion;
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
      const mediaHtml=media.map(item=>!item.signed_url?'<p class="notice">媒体暂时不可用，正文仍可阅读。</p>':item.media_type==='video'
        ?\`<video class="detail-media" controls playsinline preload="metadata" src="\${esc(item.signed_url)}"></video>\`
        :\`<img class="detail-media" src="\${esc(item.signed_url)}" alt="动态图片" />\`).join('');
      $('post-detail-content').innerHTML=\`<div class="author-line"><a class="note-author" href="\${social.profileHref(state.userId)}">\${social.avatar(state.profile,window.supabaseClient)}<span>\${esc(state.profile?.display_name||'唐人用户')}</span></a></div>\${mediaHtml}\${post.caption?\`<div class="detail-copy">\${social.linkify(post.caption)}</div>\`:''}\${post.tags?.length?\`<div class="detail-tags">\${post.tags.slice(0,5).map(tag=>\`<span class="tag">#\${esc(tag)}</span>\`).join('')}</div>\`:''}<div class="detail-comment-head"><h3>评论</h3></div>\${state.session?\`<form class="detail-comment-form" data-pc-comment-form="\${esc(post.id)}"><textarea name="content" maxlength="3000" placeholder="写下你的评论…" required></textarea><button type="submit">发表评论</button><div class="form-message"></div></form>\`:'<p>登录后可以发表评论。<button type="button" data-detail-login>登录</button></p>'}<div id="dynamic-comment-results" aria-live="polite">正在读取评论…</div>\`;
      // The article opens independently; a comment-service error cannot blank it.
      try{
        const comments=await loadPcPostComments(postId);if(version!==state.detailVersion)return;
        $('dynamic-comment-results').innerHTML=comments.length?comments.map(comment=>\`<article class="detail-comment"><div class="detail-comment-top"><a class="note-author" href="\${social.profileHref(comment.user_id)}">\${social.avatar(comment.profiles,window.supabaseClient)}<strong>\${esc(comment.profiles?.display_name||'唐人用户')}</strong></a><small>\${esc(dateText(comment.created_at))}</small></div><p>\${social.linkify(comment.content)}</p></article>\`).join(''):'<p>暂无评论。</p>';
      }catch(error){if(version===state.detailVersion&&$('dynamic-comment-results'))$('dynamic-comment-results').innerHTML=\`<p class="notice">评论暂时无法读取，正文不受影响。<button type="button" data-retry-dynamic="\${esc(postId)}">重试</button></p>\`;}
    }catch(error){if(version===state.detailVersion)$('post-detail-content').innerHTML=\`<div class="notice error">\${esc(error.message||'内容读取失败')}</div>\`;}
  }`);
section(u,'  async function refresh() {','  async function toggleFollow()',`  async function refresh() {
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
  }`);
once(u,"if(!state.session || state.session.user.id!==state.userId){$('auth-dialog').showModal();return;}","if(!canManage()){$('auth-dialog').showModal();return;}");
once(u,"    $('publish-dynamic').addEventListener('click',()=>{$('dynamic-message').textContent='';renderLocalDrafts();$('dynamic-dialog').showModal();});","    $('publish-dynamic').addEventListener('click',()=>{if(!canManage())return;$('dynamic-message').textContent='';renderLocalDrafts();$('dynamic-dialog').showModal();});");
once(u,"if(post)void openPcPost(post.dataset.openProfilePost);","if(post){event.preventDefault();void openPcPost(post.dataset.openProfilePost);}");
once(u,"  state.userId=params.get('id')||'';\n  if(!state.userId){$('page-message').className='notice error';$('page-message').textContent='缺少用户编号。';return;}\n  bind(); refresh();",`  state.userId=state.ownerView?'':params.get('id')||'';
  if(!state.ownerView&&!social.uuid(state.userId)){$('page-message').className='notice error';$('page-message').textContent='缺少或无效的用户编号。';return;}
  bind();bindOwnerCenter();
  refresh().then(async()=>{
    if(params.get('post')&&!$('content-section').classList.contains('hidden'))await openPcPost(params.get('post'));
    if(state.ownerView&&canManage()&&params.get('drafts')==='1')$('publish-dynamic').click();
  });`);
// Small owner tools reuse authenticated mutations; the public page does not render them.
once(u,'  const params=new URLSearchParams(location.search);',`  function bindOwnerCenter(){
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

  const params=new URLSearchParams(location.search);`);

for(const p of [ch,uh]){
  once(p,'</head>','  <link rel="stylesheet" href="/assets/social-discovery.css?v=20260926-social-2" />\n</head>');
  const script=p===ch?'/community/community.js?v=20260926-discovery-1':'/user/profile.js?v=20260926-4';
  once(p,`  <script src="${script}"></script>`,`  <script src="/assets/social-cards.js?v=20260926-social-2"></script>\n  <script src="${script.split('?')[0]}?v=20260926-social-2"></script>`);
}
once(ch,'<body>','<body class="social-discovery">');
once(ch,'<button class="discovery-nav-item" data-mode="mine">◎ <span>我的主页</span></button>','<a class="discovery-nav-link" href="/user/center/">◎ <span>个人中心</span></a><a class="discovery-nav-link hidden" id="my-public-profile" href="/user/">◉ <span>我的公开主页</span></a>');
once(ch,'<button class="discovery-nav-item" id="app-drafts-info" type="button">▱ <span>草稿箱</span></button>','<a class="discovery-nav-link" href="/user/center/?drafts=1">▱ <span>本地草稿箱</span></a>');
once(ch,'<div id="post-feed" class="post-feed mixed-feed"></div>','<div id="post-feed" class="post-feed mixed-feed"></div><details class="discovery-notes"><summary>社区发布与隐私说明</summary><p>推荐、最新和关注展示公开动态与社区帖子。请勿发布证件号码、电话、详细住址或未成年人隐私；争议指控需审核。草稿只保存在当前设备。</p></details>');
once(uh,'<body>','<body class="social-discovery user-public" data-profile-view="public">');
once(uh,'<button id="publish-dynamic" class="hidden" type="button">＋ 发布动态</button>','<button id="publish-dynamic" class="hidden" type="button">＋ 发布动态</button><a id="manage-my-account" class="secondary action-link hidden" href="/user/center/">进入个人中心</a>');
once(uh,'<h2>主页动态</h2>','<h2>作品</h2>');
once(uh,'<button class="active" data-filter="all">全部</button>','<button class="active" data-filter="all">全部</button><button data-filter="dynamic">动态</button><button data-filter="community">社区帖子</button>');
once(uh,'<div id="profile-posts" class="profile-posts"></div>','<div id="profile-posts" class="profile-posts"></div><button id="profile-load-more" class="profile-load-more hidden" type="button">加载更多作品</button>');
const ownerPanel='<section id="owner-panel" class="owner-panel hidden"><h2>个人中心</h2><p>这里用于管理你自己的内容；别人访问你的公开主页时不会看到这些管理入口。</p><nav><a id="preview-public-profile" href="/user/">预览公开主页</a><a href="/community/">社区与帖子</a><button id="owner-drafts" type="button" class="secondary">本地草稿箱</button></nav></section>';
const editDialog='<dialog id="edit-dynamic-dialog" class="modal wide"><form id="edit-dynamic-form" class="modal-card"><button class="modal-close" type="button" data-close="edit-dynamic-dialog" aria-label="关闭">×</button><h2>编辑我的动态</h2><p>图片和视频保持不变。</p><label>文字<textarea id="edit-dynamic-caption" maxlength="2000" rows="8"></textarea></label><label>标签<input id="edit-dynamic-tags" maxlength="220" /></label><button type="submit">保存修改</button><div id="edit-dynamic-message" class="form-message"></div></form></dialog>';
let center=read(uh).replace('data-profile-view="public"','data-profile-view="owner"').replace('social-discovery user-public','social-discovery user-owner').replace('<title>用户主页｜唐人日报</title>','<title>个人中心｜唐人日报</title>').replace('name="robots" content="noindex,follow"','name="robots" content="noindex,nofollow"').replace('<div id="page-message"',ownerPanel+'\n    <div id="page-message"').replace('<footer>',editDialog+'\n  <footer>');
changes.set('user/center/index.html',center);
// Every write is local to this checked-out branch; production activation happens after tests.
for(const [p,s] of changes){mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});writeFileSync(p,s);if(p.endsWith('.js'))execFileSync('node',['--check',p],{stdio:'inherit'});}
writeFileSync('.community-public-fix.json',JSON.stringify({changed_files:[...changes.keys()],version:'20260926-social-2',historical_content_mutations:false},null,2));
console.log('Applied community/public-profile UI changes; no database writes');

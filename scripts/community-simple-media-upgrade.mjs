// One-shot integration of reviewed anchors. No database writes; stops on concurrent edits.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const out=new Map();const read=p=>out.has(p)?out.get(p):readFileSync(p,'utf8');
function once(p,a,b){const s=read(p);if(s.split(a).length!==2)throw new Error('Missing/ambiguous anchor '+p+' '+a.slice(0,90));out.set(p,s.replace(a,b));}
function section(p,a,b,replacement){const s=read(p),i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw new Error('Missing section '+p);out.set(p,s.slice(0,i)+replacement+s.slice(j));}
const api='netlify/functions/community-api.js',c='community/community.js',cards='assets/social-cards.js',html='community/index.html';
for(const [p,sha] of Object.entries({[api]:'a527911d67ee9a09e2e305803fdb80727ff60538',[c]:'5caa5a0ffb8fb4cf37728dcc67beb6eb4af8f09f',[cards]:'d23831aa08584dbb3815b6a741e1ed1ed603760d',[html]:'09e402e3518afea6dbfd05d92fc10b73610396e3'}))if(execFileSync('git',['hash-object',p],{encoding:'utf8'}).trim()!==sha)throw new Error('Source changed since review: '+p);

out.set(api,"const simpleMedia = require('../../assets/community-media-policy.js');\n"+read(api));
// Functions directory is netlify/functions; the shared pure policy lives in root/assets.
once(api,"const simpleMedia = require('../../assets/community-media-policy.js');","const simpleMedia = require('../../assets/community-media-policy.js');");
once(api,"select: 'id,user_id,category,title,content,content_label,","select: 'id,user_id,category,title,content,media,content_label,");
once(api,'next_offset: nextOffset });','next_offset: nextOffset, media_policy: {version:\'simple-media-v1\',video_max_bytes:simpleMedia.MAX_BYTES,image_max_bytes:simpleMedia.MAX_BYTES,max_images:simpleMedia.MAX_IMAGES,max_videos:1} });');
section(api,'  const title = clean(body.title, 120);','  const recent = await rest(\'community_posts\', {',`  const simple=body.composer_version==='simple-media-v1';
  const normalized=simple?simpleMedia.normalizeSimplePost(body,user.id):null;
  const title=normalized?.title||clean(body.title,120);
  const content=normalized?normalized.content:clean(body.content,12000);
  const media=normalized?.media||[];
  const contentLabel=simple?'personal_experience':(LABELS.has(body.content_label)?body.content_label:'personal_experience');
  if (!CATEGORIES.has(category)) return json(400,{error:'请选择有效板块'});
  if (!simple && title.length<4) return json(400,{error:'标题至少需要 4 个字'});
  if (!simple && content.length<20) return json(400,{error:'正文至少需要 20 个字'});
  if (!simple && body.media?.length) return json(400,{error:'请使用新版发布框上传附件'});
  async function previousAttempt(){
    if(!normalized)return null;
    const prior=await rest('community_posts',{query:{select:'*',id:'eq.'+normalized.id,user_id:'eq.'+user.id,limit:'1'}});
    return Array.isArray(prior)?prior[0]:null;
  }
  const previous=await previousAttempt();
  if(previous)return json(200,{ok:true,post:previous,profile,replayed:true,message:previous.status==='published'?'发布成功':'已提交，进入人工审核'});

`);
once(api,'  const payload = {\n    user_id: user.id,','  const payload = {\n    ...(normalized?{id:normalized.id}:{}),\n    media,\n    user_id: user.id,');
once(api,"  const rows = await rest('community_posts', { method: 'POST', body: payload, prefer: 'return=representation' });",`  let rows;
  try{rows=await rest('community_posts',{method:'POST',body:payload,prefer:'return=representation'});}
  catch(error){
    const previous=await previousAttempt();
    if(previous)return json(200,{ok:true,post:previous,profile,replayed:true,message:previous.status==='published'?'发布成功':'已提交，进入人工审核'});
    if(/媒体|12 MB|文件尚未上传|文件大小|媒体格式|仅可发布1个视频/.test(error.message||''))error.statusCode=422;
    throw error;
  }`);
once(api,"if (action === 'create_post') return createPost(event, user, profile, body);","if (action === 'create_post') return await createPost(event, user, profile, body);");
once(api,'exports._test = { moderation,','exports._test = { createPost, simpleMedia, moderation,');

const form=`  <dialog id="composer-dialog" class="modal wide simple-community-composer">
    <form id="composer-form" class="modal-card">
      <button class="modal-close" type="button" data-close="composer-dialog" aria-label="关闭">×</button>
      <h2>发布帖子</h2>
      <label>板块<select id="post-category" required>
        <option value="uscis_interview">USCIS 面谈</option><option value="court_experience">上庭交流</option><option value="immigration_help">移民互助</option><option value="hot_discussion">热门讨论</option><option value="ice_experience">ICE 经历</option><option value="lawyer_review">律师点评</option><option value="tipoff">投稿爆料</option>
      </select></label>
      <label class="compose-body-label" for="post-content">正文</label>
      <textarea id="post-content" maxlength="12000" rows="5" placeholder="分享你的经历，或者问个问题……也可以只发图片／视频。"></textarea>
      <div class="compose-media-tools" id="post-media-picker">
        <button id="community-add-images" class="secondary" type="button">＋ 图片</button>
        <button id="community-add-video" class="secondary" type="button">＋ 视频</button>
        <span id="community-media-count">可不上传附件</span>
        <input id="community-images" class="hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple />
        <input id="community-video" class="hidden" type="file" accept="video/mp4,video/quicktime,video/webm" />
      </div>
      <p class="compose-media-help">最多 9 张图片，或 1 个视频；每个文件不超过 <strong>12 MB</strong>。</p>
      <div id="community-media-previews" class="compose-media-previews"></div>
      <p class="review-note" id="review-note">请勿泄露他人隐私；敏感内容保留审核。</p>
      <button id="community-publish-submit" type="submit">发布</button>
      <div id="composer-message" class="form-message" role="status" aria-live="polite"></div>
    </form>
  </dialog>

`;
section(html,'  <dialog id="composer-dialog"','  <dialog id="post-dialog"',form);
once(html,'</head>','  <link rel="stylesheet" href="/assets/community-composer.css?v=20260926-simple-media-1" />\n</head>');
once(html,'  <script src="/community/community.js?v=20260926-social-2-detail-1"></script>','  <script src="/assets/community-media-policy.js?v=20260926-simple-media-1"></script>\n  <script src="/assets/community-composer.js?v=20260926-simple-media-1"></script>\n  <script src="/community/community.js?v=20260926-social-2-detail-1-media-1"></script>');

once(c,"      renderStructuredFields();\n      $('composer-dialog').showModal();","      renderStructuredFields();\n      state.composer?.prepareForAccount();\n      $('composer-dialog').showModal();");
once(c,"    const box = $('structured-fields');","    const box = $('structured-fields');\n    if(!box){$('review-note').textContent=['lawyer_review','tipoff'].includes(category)?'请勿泄露他人隐私；本板块保留人工审核。':'请勿泄露他人隐私；敏感内容保留审核。';return;}");
once(c,"      state.posts = communityPosts;","      await window.TrrbSocial.hydrateCommunityMedia(communityPosts,window.supabaseClient);\n      state.posts = communityPosts;");
once(c,'      const comments = data.comments || [];',"      const comments = data.comments || [];\n      await window.TrrbSocial.hydrateCommunityMedia([post],window.supabaseClient,{all:true});\n      if(version!==communityDetailVersion||!$('post-dialog').open)return;");
once(c,'<div class="post-meta">${postMeta(post)', '${window.TrrbSocial.communityMediaHtml(post)}<div class="post-meta">${postMeta(post)');
once(c,"      const data = await api('POST', {\n        action:'create_post'","      const data = state.composer ? await state.composer.submit(api) : await api('POST', {\n        action:'create_post'");
once(c,"      $('composer-form').reset();","      state.composer?.reset();\n      $('composer-form').reset();");
once(c,'  function bind() {','  function bind() {\n    if($(\'post-media-picker\')&&window.TrrbCommunityComposer)state.composer=window.TrrbCommunityComposer.create({client:window.supabaseClient,getSession:()=>state.session});');
once(c,"    $('logout-button').addEventListener('click', async () => { await window.supabaseClient.auth.signOut();","    $('logout-button').addEventListener('click', async () => { if(state.composer?.isBusy())return;state.composer?.clearForLogout();await window.supabaseClient.auth.signOut();");
once(c,"      renderStructuredFields();\n      await loadFeed();",`      renderStructuredFields();
      if(data.post?.status==='published'&&state.composer){state.category=data.post.category;state.mode='community';document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='community'));$('feed-title').textContent=categoryNames[state.category]||'社区帖子';}
      await loadFeed();`);

once(cards,'const media=(post.profile_post_media || [])','const media=(type===\'community\'?(post.media||[]):(post.profile_post_media || []))');
once(cards,"select('id,user_id,title,content,category,status,created_at","select('id,user_id,title,content,media,category,status,created_at");
once(cards,'if(error)throw error;return {posts:data||[],count:count??(data||[]).length};','if(error)throw error;await hydrateCommunityMedia(data||[],client);return {posts:data||[],count:count??(data||[]).length};');
once(cards,'  // Capture handles cached failures',`  async function hydrateCommunityMedia(posts,client,{all=false}={}){
    await Promise.all((posts||[]).map(async post=>{
      if(!Array.isArray(post.media))post.media=[];
      const wanted=all?post.media:post.media.slice(0,1);
      await Promise.all(wanted.map(async item=>{
        item.signed_url='';
        if(!item.storage_path||!client?.storage)return;
        try{const {data,error}=await client.storage.from('community-post-media').createSignedUrl(item.storage_path,600);if(!error)item.signed_url=safeUrl(data?.signedUrl||'');}catch{}
      }));
    }));return posts;
  }
  function communityMediaHtml(post){
    return (post.media||[]).map(item=>{
      const src=safeUrl(item.signed_url);if(!src)return '<p class="notice detail-media-error">附件暂时无法读取，正文仍可查看。</p>';
      return item.media_type==='video'?\`<video class="detail-media" controls playsinline preload="metadata" src="\${esc(src)}"></video>\`:\`<img class="detail-media" src="\${esc(src)}" alt="帖子图片" />\`;
    }).join('');
  }
  // Capture handles cached failures`);
once(cards,'card,merge,linkify,authorCommunityPosts};','card,merge,linkify,authorCommunityPosts,hydrateCommunityMedia,communityMediaHtml};');
once('user/profile.js',"return item.type==='profile'&&(item.post.profile_post_media||[]).some(m=>m.media_type===state.filter);","return (item.type==='profile'?(item.post.profile_post_media||[]):(item.post.media||[])).some(m=>m.media_type===state.filter);");
for(const p of ['community/index.html','user/index.html','user/center/index.html'])once(p,'/assets/social-cards.js?v=20260926-social-2"','/assets/social-cards.js?v=20260926-social-2-media-1"');
for(const p of ['user/index.html','user/center/index.html'])once(p,'/user/profile.js?v=20260926-social-2-detail-1"','/user/profile.js?v=20260926-social-2-detail-1-media-1"');
once('scripts/validate-site.mjs','community\\.js\\?v=20260926-social-2-detail-1[','community\\.js\\?v=20260926-social-2-detail-1-media-1[');

for(const [p,s]of out){writeFileSync(p,s);if(p.endsWith('.js')||p.endsWith('.mjs'))execFileSync('node',['--check',p],{stdio:'inherit'});}
writeFileSync('.community-simple-media.json',JSON.stringify({version:'simple-media-v1',changed_files:[...out.keys()],video_max_bytes:12582912,old_posts_deleted:false},null,2));
console.log(JSON.stringify({event:'simple-community-media-integration',changed_files:[...out.keys()]}));

/* Shared presentation only. Access decisions remain with Supabase RLS / community API. */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories = {hot_discussion:'热门讨论',immigration_help:'移民互助',court_experience:'上庭交流',uscis_interview:'USCIS 面谈',ice_experience:'ICE 经历',lawyer_review:'律师点评',tipoff:'投稿爆料'};
  const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value || ''));
  const profileHref = id => `/user/?id=${encodeURIComponent(id || '')}`;
  const detailHref = (post, type) => type === 'community' ? `/community/?post=${encodeURIComponent(post.id)}` : `${profileHref(post.user_id)}&post=${encodeURIComponent(post.id)}`;
  const safeUrl = value => {try {const u=new URL(String(value || ''), 'https://trrb.net');return u.protocol==='https:' || u.protocol==='http:' ? u.href : '';}catch{return '';}};
  function dateText(value) {const d=new Date(value);return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('zh-CN',{month:'short',day:'numeric'}).format(d) : '';}
  function avatarUrl(profile, client) {
    if (!profile?.avatar_path || !client?.storage) return '';
    const path=String(profile.avatar_path);
    if (/^https?:\/\//i.test(path)) return safeUrl(path);
    return safeUrl(client.storage.from('profile-media').getPublicUrl(path).data?.publicUrl || '');
  }
  function avatar(profile, client, large=false) {
    const name=profile?.display_name || '唐人用户', first=Array.from(name.trim())[0] || '唐', src=avatarUrl(profile,client);
    return `<span class="social-avatar${large?' social-avatar-large':''}" aria-hidden="true"><span>${esc(first.toUpperCase())}</span>${src?`<img src="${esc(src)}" alt="" loading="lazy" decoding="async" />`:''}</span>`;
  }
  function card(post, type, {client,owner=false}={}) {
    const profile=post.profiles || {}, name=profile.display_name || '唐人用户';
    const text=String(type==='community'?post.content||'':post.caption||'');
    const title=String(type==='community'?post.title||'社区帖子':text.split(/\n/).find(x=>x.trim()) || '图片与视频动态').trim();
    const media=(post.profile_post_media || []).slice().sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)), first=media[0];
    const href=detailHref(post,type), attr=type==='community'?'data-open-post':'data-open-profile-post';
    const src=first?.signed_url ? safeUrl(first.signed_url) : '';
    const ratio=first?.width>0 && first?.height>0 ? Math.max(.7,Math.min(1.5,first.width/first.height)) : .8;
    const cover=src ? (first.media_type==='video'
      ? `<video src="${esc(src)}" preload="metadata" muted playsinline tabindex="-1" aria-hidden="true"></video><span class="note-media-badge" aria-label="视频">▶</span>`
      : `<img src="${esc(src)}" alt="${esc(title.slice(0,100))}" loading="lazy" decoding="async" />${media.length>1?`<span class="note-media-badge">${media.length} 图</span>`:''}`)
      : `<div class="note-text-cover"><span>${esc(type==='community'?categories[post.category]||'社区帖子':'文字动态')}</span><strong>${esc(title)}</strong>${type==='community'?`<p>${esc(text.slice(0,100))}</p>`:''}</div>`;
    const like=type==='community'?`<span class="note-metric" aria-label="${Number(post.like_count)||0} 个赞">♡ ${Number(post.like_count)||0}</span>`:`<small>${esc(dateText(post.created_at))}</small>`;
    return `<article class="note-card" ${type==='community'?'data-post-id':'data-profile-post-id'}="${esc(post.id)}" data-content-type="${type}">
      <a class="note-cover${src?'':' note-cover-text'}" style="--note-ratio:${ratio}" href="${esc(href)}" ${attr}="${esc(post.id)}" aria-label="打开：${esc(title.slice(0,120))}">${cover}<span class="note-media-error" hidden>媒体暂时不可用，点击查看内容</span></a>
      <a class="note-title" href="${esc(href)}" ${attr}="${esc(post.id)}">${esc(title)}</a>
      <div class="note-footer"><a class="note-author" href="${esc(profileHref(post.user_id))}" aria-label="查看 ${esc(name)} 的公开主页">${avatar(profile,client)}<span>${esc(name)}</span></a>${like}</div>
      ${owner?`<div class="note-owner-actions"><span>${post.status==='published'?'已发布':post.status==='pending'?'审核中':'未公开'}</span>${type==='profile'?`<button type="button" data-edit-own-dynamic="${esc(post.id)}">编辑</button>`:''}<button type="button" data-remove-own-content="${esc(post.id)}" data-kind="${type}">下架</button></div>`:''}
    </article>`;
  }
  function merge(community=[], dynamics=[]) {
    return [...community.map(post=>({type:'community',post})),...dynamics.map(post=>({type:'profile',post}))]
      .sort((a,b)=>Date.parse(b.post.created_at)-Date.parse(a.post.created_at)||String(a.post.id).localeCompare(String(b.post.id)));
  }
  function linkify(value) {
    return String(value || '').split(/(https?:\/\/[^\s<>"']+)/g).map((part,i)=>{
      if(i%2===0)return esc(part);
      const match=part.match(/^(.*?)([。，；！？、）\])]+)?$/u), raw=match?.[1] || part, suffix=match?.[2] || '';
      const url=safeUrl(raw);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(raw)}</a>${esc(suffix)}`:esc(part);
    }).join('');
  }
  async function authorCommunityPosts(client,userId,{limit=30,offset=0,owner=false}={}) {
    if(!uuid(userId)) throw new Error('无效的用户编号');
    let query=client.from('community_posts').select('id,user_id,title,content,category,status,created_at,updated_at,like_count,comment_count,profiles!community_posts_user_id_fkey(display_name,avatar_key,avatar_path)',{count:'exact'}).eq('user_id',userId);
    query=owner ? query.neq('status','deleted') : query.eq('status','published');
    const {data,error,count}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit-1);
    if(error)throw error;return {posts:data||[],count:count??(data||[]).length};
  }
  // Capture handles cached failures as well as errors that occur after rendering.
  if(root.document)root.document.addEventListener('error',event=>{
    const el=event.target;if(!el?.closest)return;
    if(el.closest('.social-avatar')){el.hidden=true;return;}
    const cover=el.closest('.note-cover');if(cover){el.hidden=true;const fallback=cover.querySelector('.note-media-error');if(fallback)fallback.hidden=false;}
  },true);
  const api={esc,uuid,safeUrl,dateText,profileHref,detailHref,avatarUrl,avatar,card,merge,linkify,authorCommunityPosts};
  root.TrrbSocial=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

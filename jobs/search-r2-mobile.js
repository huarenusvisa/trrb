(() => {
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const $=(id)=>document.getElementById(id);
  let user=null;
  let saved=new Set();
  let decorateTimer=null;

  function submit(){ $('jobs-search-form')?.requestSubmit(); }
  function isMobile(){ return window.matchMedia('(max-width:860px)').matches; }

  function injectStyles(){
    if($('jobs-r2-mobile-style')) return;
    const style=document.createElement('style'); style.id='jobs-r2-mobile-style';
    style.textContent=`
      .mobile-job-feed-head{display:none}
      @media(max-width:860px){
        .mobile-job-feed-head{display:block;background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:11px;margin:0 0 10px;position:sticky;top:0;z-index:20;box-shadow:0 5px 16px rgba(16,24,40,.07)}
        .mobile-location-btn{width:100%;border:0;background:#fff;padding:2px 0 9px;text-align:left;display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:15px;color:#101828}
        .mobile-category-row,.mobile-sort-row{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding:2px 0}.mobile-category-row::-webkit-scrollbar,.mobile-sort-row::-webkit-scrollbar{display:none}
        .mobile-category-chip,.mobile-sort-chip,.mobile-filter-btn{flex:0 0 auto;border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:8px 11px;font-size:13px;font-weight:700;color:#344054}
        .mobile-category-chip.is-active,.mobile-sort-chip.is-active{background:#101828;color:#fff;border-color:#101828}
        .mobile-sort-row{margin-top:8px;padding-top:8px;border-top:1px solid #f2f4f7}
        .search-card{margin-top:8px}.quick-grid{display:none!important}.discovery{display:none!important}.actions{margin-top:8px}.advanced{margin-top:4px}.advanced:not([open]) .grid{display:none}
        .toolbar{margin:10px 0 8px}.result-card.job-card-compact{padding:13px!important;border-radius:13px}.job-card-compact h2{font-size:17px!important;line-height:1.3;margin:0 0 7px!important}.job-card-compact .meta{font-size:12px!important;gap:6px!important}.job-card-compact .salary{display:block;width:100%;font-size:17px;font-weight:850}.job-card-foot{align-items:flex-end!important}.job-card-actions{display:flex;gap:6px;align-items:center}.job-save-btn{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:7px 9px;font-weight:750;color:#344054}.job-save-btn.is-saved{color:#b42318;border-color:#fda29b;background:#fff5f4}.job-card-cta{padding:8px 11px!important}
        #jobs-map{height:calc(100vh - 190px);min-height:420px}.pagination{padding-bottom:58px}
      }
    `; document.head.appendChild(style);
  }

  function buildCategories(){
    const row=$('mobile-category-row'), select=$('category'); if(!row||!select) return;
    const options=[...select.options].filter(o=>o.value).slice(0,9);
    row.innerHTML=`<button type="button" class="mobile-category-chip ${select.value?'':'is-active'}" data-mobile-category="">全部</button>`+options.map(o=>`<button type="button" class="mobile-category-chip ${select.value===o.value?'is-active':''}" data-mobile-category="${o.value}">${o.textContent}</button>`).join('');
  }

  function syncLocation(){ const source=$('location-summary'), target=$('mobile-location-label'); if(source&&target) target.textContent=source.textContent||'选择找工地点'; }
  function syncSort(){
    const value=$('sort')?.value||'relevance';
    document.querySelectorAll('[data-mobile-sort]').forEach(b=>b.classList.toggle('is-active',b.dataset.mobileSort===value));
  }

  function ensureUI(){
    if($('mobile-job-feed-head')) return;
    const section=document.createElement('section'); section.id='mobile-job-feed-head'; section.className='mobile-job-feed-head'; section.setAttribute('aria-label','手机极简找工作');
    section.innerHTML=`<button type="button" class="mobile-location-btn" id="mobile-location-button"><span>📍 <span id="mobile-location-label">找工地点</span></span><span>更换 ›</span></button><div id="mobile-category-row" class="mobile-category-row"></div><div class="mobile-sort-row"><button type="button" class="mobile-sort-chip" data-mobile-nearby="1">附近</button><button type="button" class="mobile-sort-chip" data-mobile-sort="relevance">推荐</button><button type="button" class="mobile-sort-chip" data-mobile-sort="latest">最新</button><button type="button" class="mobile-sort-chip" data-mobile-sort="distance">最近</button><button type="button" class="mobile-sort-chip" data-mobile-sort="salary">高薪</button><button type="button" class="mobile-filter-btn" id="mobile-filter-button">筛选</button></div>`;
    document.querySelector('.search-card')?.insertAdjacentElement('beforebegin',section);
    syncLocation(); buildCategories(); syncSort();
    $('mobile-location-button')?.addEventListener('click',()=>$('location-trigger')?.click());
    $('mobile-filter-button')?.addEventListener('click',()=>{ const d=$('advanced-filters'); if(d){d.open=true; d.scrollIntoView({behavior:'smooth',block:'start'});} });
    $('mobile-category-row')?.addEventListener('click',(e)=>{ const b=e.target.closest('[data-mobile-category]'); if(!b||!$('category'))return; $('category').value=b.dataset.mobileCategory; buildCategories(); $('category').dispatchEvent(new Event('change',{bubbles:true})); submit(); });
    section.addEventListener('click',(e)=>{
      const near=e.target.closest('[data-mobile-nearby]');
      if(near){ if(!$('radius')?.value){ $('location-trigger')?.click(); $('search-status').textContent='先选择当前位置或一个找工地点，就能看附近工作。'; return;} $('radius').value='10'; $('sort').value='distance'; syncSort(); submit(); return; }
      const b=e.target.closest('[data-mobile-sort]'); if(!b)return;
      if(b.dataset.mobileSort==='distance'&&!$('radius')?.value){ $('location-trigger')?.click(); $('search-status').textContent='“最近”需要一个找工中心；可用当前位置或选择其他地区。'; return; }
      $('sort').value=b.dataset.mobileSort; syncSort(); submit();
    });
    const source=$('location-summary'); if(source) new MutationObserver(syncLocation).observe(source,{childList:true,subtree:true,characterData:true});
    $('sort')?.addEventListener('change',syncSort);
    setTimeout(buildCategories,800);
  }

  async function loadUserAndSaves(ids=[]){
    if(user===null){ const {data}=await client.auth.getUser(); user=data?.user||false; }
    if(!user||!ids.length) return;
    const {data}=await client.from('job_listing_saves').select('listing_id').eq('user_id',user.id).in('listing_id',ids);
    saved=new Set((data||[]).map(r=>r.listing_id));
  }

  async function toggleSave(id,button){
    if(user===null){ const {data}=await client.auth.getUser(); user=data?.user||false; }
    if(!user){ $('search-status').textContent='登录统一账号后即可收藏岗位。'; return; }
    if(saved.has(id)){ const {error}=await client.from('job_listing_saves').delete().eq('user_id',user.id).eq('listing_id',id); if(!error)saved.delete(id); }
    else { const {error}=await client.from('job_listing_saves').upsert({user_id:user.id,listing_id:id},{onConflict:'user_id,listing_id'}); if(!error)saved.add(id); }
    button.classList.toggle('is-saved',saved.has(id)); button.textContent=saved.has(id)?'♥ 已收藏':'♡ 收藏';
  }

  async function decorateCards(){
    if(!isMobile()) return;
    const cards=[...document.querySelectorAll('#jobs-results .result-card[data-job-id]')]; if(!cards.length)return;
    const ids=cards.map(c=>c.dataset.jobId); await loadUserAndSaves(ids);
    for(const card of cards){
      const id=card.dataset.jobId, foot=card.querySelector('.job-card-foot'); if(!foot||foot.dataset.mobileReady==='1')continue; foot.dataset.mobileReady='1';
      const old=foot.querySelector('.job-card-cta'); if(old)old.remove();
      const actions=document.createElement('div'); actions.className='job-card-actions'; actions.innerHTML=`<button type="button" class="job-save-btn ${saved.has(id)?'is-saved':''}" data-save-job="${id}">${saved.has(id)?'♥ 已收藏':'♡ 收藏'}</button><a class="job-card-cta" href="/jobs/contact.html?id=${encodeURIComponent(id)}">聊一聊</a>`; foot.appendChild(actions);
    }
  }

  function scheduleCards(){ clearTimeout(decorateTimer); decorateTimer=setTimeout(decorateCards,140); }

  document.addEventListener('DOMContentLoaded',()=>{
    injectStyles(); ensureUI();
    const root=$('jobs-results'); if(root)new MutationObserver(scheduleCards).observe(root,{childList:true,subtree:true});
    root?.addEventListener('click',(e)=>{ const b=e.target.closest('[data-save-job]'); if(!b)return; e.preventDefault(); toggleSave(b.dataset.saveJob,b); });
    scheduleCards();
  });
})();
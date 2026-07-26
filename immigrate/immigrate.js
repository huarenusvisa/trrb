(function(){
  const cfg=window.TRRB_IMMIGRATION_KNOWLEDGE||{categories:[]};
  const grid=document.querySelector('#pathway-grid');
  const matchedSection=document.querySelector('#matched-section');
  const matchedGrid=document.querySelector('#matched-grid');
  const matchedTitle=document.querySelector('#matched-title');
  const searchForm=document.querySelector('#knowledge-search-form');
  const searchInput=document.querySelector('#knowledge-search');
  const clearButton=document.querySelector('#clear-filter');
  const hotButtons=document.querySelectorAll('[data-search]');
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  let articles=[];

  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function normalize(v){return String(v||'').toLowerCase().replace(/\s+/g,' ');}
  function articleText(a){return normalize([a.title,a.summary,a.content,a.category_name,a.excerpt,a.category].filter(Boolean).join(' '));}
  function matchCategory(article,cat){const text=articleText(article);return cat.keywords.some(k=>text.includes(normalize(k)));}
  function articleUrl(a){return `../article.html?id=${encodeURIComponent(a.id)}`;}
  function categoryUrl(cat){return `./center.html?path=${encodeURIComponent(cat.slug)}`;}
  function topicUrl(cat,item){return `./center.html?path=${encodeURIComponent(cat.slug)}&topic=${encodeURIComponent(item.slug)}`;}

  function renderPathways(){
    grid.innerHTML=cfg.categories.map((cat,i)=>`
      <article class="pathway-card" id="${esc(cat.slug)}" tabindex="0" role="link" data-category-url="${categoryUrl(cat)}" aria-label="进入${esc(cat.nameZh)}知识中心">
        <span class="pathway-number">0${i+1}</span>
        <h3>${esc(cat.nameZh)}</h3>
        <span class="pathway-en">${esc(cat.nameEn)}</span>
        <p>${esc(cat.description)}</p>
        <div class="pathway-tags">
          ${cat.items.slice(0,6).map(item=>`<a href="${topicUrl(cat,item)}" data-topic-link="true">${esc(item.name)}</a>`).join('')}
        </div>
        <a class="pathway-action" href="${categoryUrl(cat)}">进入知识中心 →</a>
      </article>`).join('');

    grid.querySelectorAll('.pathway-card').forEach(card=>{
      const go=()=>{window.location.href=card.dataset.categoryUrl;};
      card.addEventListener('click',event=>{if(event.target.closest('a'))return;go();});
      card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('a')){event.preventDefault();go();}});
    });
  }

  function localArticles(){const pools=[window.TRRB_ARTICLE_INDEX,window.TRRB_ARTICLES,window.TRRB_ARTICLE_CHUNK];return pools.find(Array.isArray)||[];}
  async function fetchArticles(){
    const select=['id','title','summary','content','category_name','status','published_at'].join(',');
    const url=`${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast&limit=500`;
    try{const r=await fetch(url,{cache:'no-store',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json'}});if(!r.ok)throw new Error(r.status);const live=await r.json();const seen=new Set(live.map(x=>String(x.id)));articles=live.concat(localArticles().filter(x=>!seen.has(String(x.id))));}
    catch(e){console.warn('Immigration knowledge articles unavailable',e);articles=localArticles();}
  }
  function renderMatches(items,label){
    matchedSection.hidden=false;matchedTitle.textContent=label;
    if(!items.length){matchedGrid.innerHTML='<div class="empty-knowledge">暂时没有符合该路径的已发布知识内容。新文章发布后会自动归入这里。</div>';return;}
    matchedGrid.innerHTML=items.slice(0,60).map(({article,category})=>`<article class="knowledge-card"><small>${esc(category.nameZh)}</small><h3>${esc(article.title)}</h3><p>${esc(article.summary||article.excerpt||'查看完整内容与办理要点。')}</p><a href="${articleUrl(article)}">阅读全文 →</a></article>`).join('');
    matchedSection.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function search(){
    const q=normalize(searchInput.value);if(!q){matchedSection.hidden=true;return;}
    const direct=[];
    cfg.categories.forEach(cat=>cat.items.forEach(item=>{if(normalize(item.name).includes(q))direct.push({cat,item});}));
    if(direct.length===1){window.location.href=topicUrl(direct[0].cat,direct[0].item);return;}
    const items=[];for(const article of articles){const category=cfg.categories.find(cat=>matchCategory(article,cat));if(category&&articleText(article).includes(q))items.push({article,category});}
    renderMatches(items,`搜索：${searchInput.value.trim()}`);
  }

  clearButton.addEventListener('click',()=>{matchedSection.hidden=true;searchInput.value='';history.replaceState(null,'',location.pathname);document.querySelector('#pathway-title').scrollIntoView({behavior:'smooth'});});
  searchForm.addEventListener('submit',event=>{event.preventDefault();searchInput.blur();search();});
  hotButtons.forEach(button=>button.addEventListener('click',()=>{searchInput.value=button.dataset.search||'';search();}));
  renderPathways();
  fetchArticles();
})();
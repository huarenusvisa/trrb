(function(){
  const cfg=window.TRRB_IMMIGRATION_KNOWLEDGE||{categories:[]};
  const grid=document.querySelector('#pathway-grid');
  const matchedSection=document.querySelector('#matched-section');
  const matchedGrid=document.querySelector('#matched-grid');
  const matchedTitle=document.querySelector('#matched-title');
  const searchInput=document.querySelector('#knowledge-search');
  const searchButton=document.querySelector('#knowledge-search-button');
  const clearButton=document.querySelector('#clear-filter');
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  let articles=[];

  function esc(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function normalize(v){return String(v||'').toLowerCase().replace(/\s+/g,' ');}
  function articleText(a){return normalize([a.title,a.summary,a.content,a.category_name,a.excerpt,a.category].filter(Boolean).join(' '));}
  function matchCategory(article,cat){const text=articleText(article);return cat.keywords.some(k=>text.includes(normalize(k)));}
  function articleUrl(a){return `../article.html?id=${encodeURIComponent(a.id)}`;}

  function renderPathways(){
    grid.innerHTML=cfg.categories.map((cat,i)=>`<article class="pathway-card" id="${esc(cat.slug)}"><span class="pathway-number">0${i+1}</span><h3>${esc(cat.nameZh)}</h3><span class="pathway-en">${esc(cat.nameEn)}</span><p>${esc(cat.description)}</p><div class="pathway-tags">${cat.items.slice(0,6).map(x=>`<span>${esc(x)}</span>`).join('')}</div><button class="pathway-action" type="button" data-pathway="${esc(cat.key)}">进入知识中心 →</button></article>`).join('');
    grid.querySelectorAll('[data-pathway]').forEach(btn=>btn.addEventListener('click',()=>showCategory(btn.dataset.pathway)));
  }

  function localArticles(){
    const pools=[window.TRRB_ARTICLE_INDEX,window.TRRB_ARTICLES,window.TRRB_ARTICLE_CHUNK];
    return pools.find(Array.isArray)||[];
  }

  async function fetchArticles(){
    const select=['id','title','summary','content','category_name','status','published_at'].join(',');
    const url=`${SUPABASE_URL}/rest/v1/articles?select=${encodeURIComponent(select)}&status=eq.published&order=published_at.desc.nullslast&limit=500`;
    try{
      const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Accept:'application/json'}});
      if(!r.ok) throw new Error(r.status);
      const live=await r.json();
      const seen=new Set(live.map(x=>String(x.id)));
      articles=live.concat(localArticles().filter(x=>!seen.has(String(x.id))));
    }catch(e){
      console.warn('Immigration knowledge articles unavailable',e);
      articles=localArticles();
    }
  }

  function renderMatches(items,label){
    matchedSection.hidden=false;
    matchedTitle.textContent=label;
    if(!items.length){matchedGrid.innerHTML='<div class="empty-knowledge">暂时没有符合该路径的已发布知识内容。新文章发布后会自动归入这里。</div>';return;}
    matchedGrid.innerHTML=items.slice(0,60).map(({article,category})=>`<article class="knowledge-card"><small>${esc(category.nameZh)}</small><h3>${esc(article.title)}</h3><p>${esc(article.summary||article.excerpt||'查看完整内容与办理要点。')}</p><a href="${articleUrl(article)}">阅读全文 →</a></article>`).join('');
    matchedSection.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function showCategory(key){
    const cat=cfg.categories.find(x=>x.key===key);
    if(!cat)return;
    const items=articles.filter(a=>matchCategory(a,cat)).map(article=>({article,category:cat}));
    history.replaceState(null,'',`#${cat.slug}`);
    renderMatches(items,`${cat.nameZh}知识`);
  }

  function search(){
    const q=normalize(searchInput.value);
    if(!q){matchedSection.hidden=true;return;}
    const items=[];
    for(const article of articles){
      const category=cfg.categories.find(cat=>matchCategory(article,cat));
      if(category&&articleText(article).includes(q))items.push({article,category});
    }
    renderMatches(items,`搜索：${searchInput.value.trim()}`);
  }

  clearButton.addEventListener('click',()=>{matchedSection.hidden=true;searchInput.value='';history.replaceState(null,'',location.pathname);document.querySelector('#pathway-title').scrollIntoView({behavior:'smooth'});});
  searchButton.addEventListener('click',search);
  searchInput.addEventListener('keydown',e=>{if(e.key==='Enter')search();});

  renderPathways();
  fetchArticles().then(()=>{
    const hash=location.hash.replace('#','');
    const cat=cfg.categories.find(x=>x.slug===hash);
    if(cat)showCategory(cat.key);
  });
})();
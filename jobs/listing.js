(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const labels = { open:'招聘中', filled:'已招满', paused:'已暂停', unlisted:'已下架', deleted:'已删除' };
  function setMeta(name, content) { let node=document.head.querySelector(`meta[name="${name}"]`); if(!node){node=document.createElement('meta');node.name=name;document.head.appendChild(node);} node.content=content; }
  function setCanonical(href) { let node=document.head.querySelector('link[rel="canonical"]'); if(!node){node=document.createElement('link');node.rel='canonical';document.head.appendChild(node);} node.href=href; }
  function applySeo(row) {
    const host=/^(www\.)?huarengongzuo\.com$/i.test(location.hostname)?'https://huarengongzuo.com':'https://trrb.net';
    const canonical=`${host}/jobs/listing.html?id=${encodeURIComponent(row.id)}`;
    const place=[row.city,row.borough||row.county,row.state_code].filter(Boolean).join(' ');
    const summary=String(row.description||'').replace(/\s+/g,' ').trim();
    document.title=`${row.title}｜${host.includes('huarengongzuo')?'华人工作网':'唐人日报招聘'}`;
    setCanonical(canonical);
    setMeta('description',`${row.title}${place?`｜${place}`:''}${summary?`｜${summary.slice(0,120)}`:''}`.slice(0,180));
    setMeta('robots',row.status==='open'?'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1':'noindex,follow,noarchive');
  }
  async function load() {
    const root=document.getElementById('jobs-listing-detail');
    const id=new URLSearchParams(location.search).get('id');
    if(!id){root.innerHTML='<h1>招聘记录不存在</h1>';return;}
    if(typeof supabaseClient==='undefined'){root.innerHTML='<h1>数据服务未初始化</h1>';return;}
    const {data:row,error}=await supabaseClient.from('job_listings').select('id,title,description,category_slug,employment_type,salary_min,salary_max,salary_period,state_code,city,county,borough,neighborhood,status,published_at,closed_at,updated_at').eq('id',id).maybeSingle();
    if(error||!row){root.innerHTML='<h1>该招聘记录当前不可公开访问</h1><p>记录可能处于暂停、下架或删除状态。</p>';return;}
    const ended=row.status!=='open';
    const contact=ended?'':`<p><a class="contact-employer" href="/jobs/contact.html?id=${encodeURIComponent(row.id)}">联系招聘方</a></p>`;
    applySeo(row);
    root.innerHTML=`<h1 data-i18n-skip>${esc(row.title)}</h1><p><strong>${esc(labels[row.status]||row.status)}</strong> · ${esc(row.state_code)} ${esc(row.city)} ${esc(row.borough||row.county||'')} ${esc(row.neighborhood||'')}</p>${ended?'<aside style="padding:12px;border:1px solid #bbb"><b>此招聘已结束。</b> 页面保留用于历史记录与长期稳定链接，不会混入当前招聘搜索。</aside>':''}<p data-i18n-skip>${esc(row.description||'')}</p>${contact}<p>永久记录ID：<code>${esc(row.id)}</code></p><p>最近更新：${esc(row.updated_at||'')}</p>`;
  }
  document.addEventListener('DOMContentLoaded',load);
})();

(() => {
  const cta=document.querySelector('.cta-row');
  if(cta&&!document.querySelector('.library-promo')){
    const section=document.createElement('section');
    section.className='container library-promo';section.setAttribute('aria-labelledby','library-promo-title');
    section.innerHTML='<div class="library-promo-copy"><p>中国文学 · 分章阅读</p><h2 id="library-promo-title">唐人书库</h2><span>完整收录中国现代小说、散文、诗歌、武侠、科幻与儿童文学</span><a href="/library/">进入全部书库 <i aria-hidden="true">›</i></a></div><div class="library-promo-books" id="library-promo-books" aria-label="推荐书目"></div>';
    cta.insertAdjacentElement('beforebegin',section);
  }
  const root=document.querySelector('#library-promo-books');if(!root)return;
  const fallback=[['鲁迅作品集','luxunzuopinji'],['白鹿原','bailuyuan'],['边城','biancheng'],['活着','huozhe'],['流浪地球','liulangdiqiu'],['金粉世家','jinfenshijia']];
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  function render(items){root.innerHTML=items.slice(0,6).map(book=>`<a href="/library/read.html?book=${encodeURIComponent(book.slug)}&source=${encodeURIComponent(book.source_url||'')}"><span>${esc(book.title)}</span><i aria-hidden="true">›</i></a>`).join('')}
  render(fallback.map(([title,slug])=>({title,slug})));
  fetch('/data/library/manifest.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>Array.isArray(data.books)&&data.books.length&&render(data.books)).catch(()=>{});
})();

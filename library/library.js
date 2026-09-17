(() => {
  const grid = document.querySelector('#library-grid');
  const input = document.querySelector('#library-search');
  const clear = document.querySelector('#library-clear');
  const more = document.querySelector('#library-more');
  const count = document.querySelector('#library-count');
  const status = document.querySelector('#library-status');
  let books = [], visible = 30;
  const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  function render(){
    const q=input.value.trim().toLowerCase();
    const filtered=books.filter(book=>`${book.title} ${book.description||''}`.toLowerCase().includes(q));
    const shown=filtered.slice(0,visible);
    count.textContent=q?`找到 ${filtered.length} 部作品`:`共收录 ${books.length} 部作品`;
    grid.innerHTML=shown.map(book=>{
      const href=`/library/read.html?book=${encodeURIComponent(book.slug)}&source=${encodeURIComponent(book.source_url)}`;
      const cover=book.cover?`<img src="${esc(book.cover)}" alt="${esc(book.title)}封面" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.innerHTML='<div class=&quot;book-cover-fallback&quot;>${esc(book.title)}</div>'">`:`<div class="book-cover-fallback">${esc(book.title)}</div>`;
      const meta=Number.isFinite(book.chapter_count)?`${book.chapter_count} 章`:(book.description||'进入阅读');
      return `<a class="book-card" href="${href}"><div class="book-cover">${cover}</div><h2>${esc(book.title)}</h2><p>${esc(meta)}</p></a>`;
    }).join('') || '<p>没有找到相符书目。</p>';
    more.hidden=shown.length>=filtered.length;
    clear.hidden=!q;
  }
  input.addEventListener('input',()=>{visible=30;render()});
  clear.addEventListener('click',()=>{input.value='';visible=30;render();input.focus()});
  more.addEventListener('click',()=>{visible+=30;render()});
  fetch('/data/library/manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('manifest');return r.json()}).then(data=>{books=Array.isArray(data.books)?data.books:[];status.textContent=data.complete?'全文同步完成':'全文正在持续同步';render()}).catch(()=>{count.textContent='书目暂时无法读取';status.textContent='请稍后重试'});
})();

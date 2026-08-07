(function(){
  const $ = (s)=>document.querySelector(s);
  const client = window.supabaseClient || window.supabase?.createClient;

  function injectButtons(){
    document.querySelectorAll('#articles-tbody tr').forEach(row=>{
      if(row.querySelector('.article-edit-btn')) return;
      const idCell=row.querySelector('small');
      const id=idCell?.textContent?.trim();
      const box=row.querySelector('td:last-child');
      if(!id || !box) return;
      const btn=document.createElement('button');
      btn.className='small-btn article-edit-btn';
      btn.textContent='编辑';
      btn.onclick=()=>editArticle(id);
      box.prepend(btn);
      const del=document.createElement('button');
      del.className='small-btn article-delete-btn';
      del.textContent='删除';
      del.onclick=()=>deleteArticle(id);
      box.appendChild(del);
    });
  }

  async function editArticle(id){
    const {data,error}=await supabaseClient.from('articles').select('*').eq('id',id).single();
    if(error){alert(error.message);return;}
    const title=prompt('修改标题',data.title||'');
    if(title===null)return;
    const content=prompt('修改正文',data.content||'');
    if(content===null)return;
    const image=prompt('修改图片地址',data.cover_image||'');
    if(image===null)return;
    const category=prompt('修改分类',data.category_name||'');
    if(category===null)return;
    const tags=prompt('修改标签（逗号分隔）',data.tags||'');
    if(tags===null)return;
    const {error:updateError}=await supabaseClient.from('articles').update({title,content,cover_image:image,category_name:category,tags}).eq('id',id);
    if(updateError){alert(updateError.message);return;}
    alert('修改完成');
    if(window.loadArticles) window.loadArticles();
  }

  async function deleteArticle(id){
    if(!confirm('确定删除这篇文章？')) return;
    const {error}=await supabaseClient.from('articles').delete().eq('id',id);
    if(error){alert(error.message);return;}
    if(window.loadArticles) window.loadArticles();
  }

  window.editArticle=editArticle;
  window.deleteArticle=deleteArticle;
  const timer=setInterval(injectButtons,1000);
  window.addEventListener('beforeunload',()=>clearInterval(timer));
})();

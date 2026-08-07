// 唐人日报后台文章编辑模块
// 功能：编辑标题、正文、图片、分类、标签
(function(){
  const supabaseClient = window.supabase.createClient(
    "https://fwiznbpsqkfgkvyznebz.supabase.co",
    "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak"
  );

  async function editArticle(id){
    const {data,error}=await supabaseClient.from('articles').select('*').eq('id',id).single();
    if(error){alert('读取文章失败：'+error.message);return;}

    const title=prompt('修改标题',data.title||'');
    if(title===null)return;
    const content=prompt('修改正文',data.content||'');
    if(content===null)return;
    const cover=prompt('修改图片地址',data.cover_image||'');
    if(cover===null)return;
    const category=prompt('修改分类',data.category_name||'');
    if(category===null)return;
    const tags=prompt('修改标签（逗号分隔）',data.tags||'');
    if(tags===null)return;

    const {error:updateError}=await supabaseClient.from('articles').update({
      title,
      content,
      cover_image:cover,
      category_name:category,
      tags
    }).eq('id',id);

    if(updateError){alert('保存失败：'+updateError.message);return;}
    alert('修改成功');
    location.reload();
  }

  window.editArticle=editArticle;
})();

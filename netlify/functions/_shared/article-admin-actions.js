'use strict';
const {readArticleList}=require('./article-list-reader');
const {articleCategoryLabel}=require('./article-search');
const {pinState}=require('../../../article-pin-policy');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function fail(message,statusCode){const error=new Error(message);error.statusCode=statusCode;throw error;}

// Called only after authenticateAdmin. Public and admin now share the same
// bounded, all-history search; they differ only in enforced visibility scope.
async function listManagedArticles(input,rest){
  const result=await readArticleList(input,{publicOnly:false},rest);
  return {...result,articles:result.articles.map(row=>({...row,category_label:articleCategoryLabel(row)}))};
}

async function setManagedArticlePin(input,actor,rest){
  if(!actor?.user?.id||!['owner','editor'].includes(actor?.admin?.role))fail('没有所需后台权限',403);
  const id=String(input.article_id||'').trim();
  const mode=String(input.mode||'').trim();
  if(!UUID.test(id)||!['force','auto','exclude'].includes(mode))fail('文章ID或置顶操作无效',400);
  // Serialize changes in the existing DB RPC. The server, not the browser,
  // chooses the action time and exact +48h deadline, preserving other metadata.
  const rows=await rest('rpc/trrb_set_homepage_pin',{
    method:'POST',
    query:{select:'id,title,category_name,status,visibility,published_at,created_at,hidden_at,archived_at,homepage_pinned_at,homepage_pin_expires_at,metadata'},
    body:{p_article_id:id,p_mode:mode,p_actor:actor.user.id}
  });
  const article=Array.isArray(rows)?rows[0]:null;
  if(!article||article.id!==id)fail('未取得设置后的文章，请刷新后确认；不要重复点击',502);
  const pin=pinState(article);
  if(mode==='force'&&!pin.active)fail('置顶未生效，请检查文章公开状态并刷新确认',409);
  return {
    article:{...article,pin},pin,manual_pin_hours:48,
    message:mode==='force'?'已置顶，48小时后自动取消。':mode==='auto'?'已取消置顶，恢复自动推荐；文章不会被删除。':'已取消置顶，并设置为不推荐。'
  };
}
module.exports={listManagedArticles,setManagedArticlePin};

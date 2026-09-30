const {articleListQuery,searchTerms}=require('./article-search');
const {pinState}=require('../../../article-pin-policy');
const {partitionedSearch}=require('./article-partition-search');
const MAINTENANCE_NOTICE='完整正文检索暂时未完成，当前先显示标题和摘要的匹配结果；仅正文命中的文章可能暂未列出。';
const uuid=v=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v||'');

function listRequest(input={}, {publicOnly=false,now=Date.now()}={}){
  const spec=articleListQuery(input,{publicOnly,now});
  const {query,text,pageSize}=spec;
  if(input.offset!==undefined){const offset=Number(input.offset);if(!Number.isInteger(offset)||offset<0||offset>10000000)throw new Error('无效的查询起始位置');query.offset=String(offset);spec.page=Math.floor(offset/pageSize)+1;}
  const pinnedOnly=!publicOnly&&input.status==='pinned';
  const at=new Date(now).toISOString();
  if(!publicOnly)query.select+=',publication_path,homepage_pinned_at,homepage_pin_expires_at,hidden_at,archived_at';
  if(publicOnly||pinnedOnly){query.hidden_at='is.null';query.archived_at='is.null';query.or=`(published_at.lte.${at},and(published_at.is.null,created_at.lte.${at}))`;}
  if(pinnedOnly){
    query.status='eq.published';query.visibility='eq.public';
    query.homepage_pin_expires_at=`gt.${at}`;query.homepage_pinned_at=`lte.${at}`;
    query['metadata->>homepage_focus_override']='eq.force';
    query.order='homepage_pinned_at.desc,published_at.desc.nullslast,id.desc';
    if(!text)delete query.and;
  }
  // This is only the fast degraded query. readArticleList first runs complete
  // primary-key-range matching, including content, without any duplicate store.
  const limited=Boolean(text&&!uuid(text));
  if(limited){
    const filters=searchTerms(text).map(term=>`or(title.ilike.*${term}*,summary.ilike.*${term}*)`);
    query.and=`(${filters.join(',')})`;
  }
  return {...spec,resource:'articles',options:{query},pinnedOnly,search_scope:limited?'title_summary':uuid(text)?'article_id':'list',search_limited:limited,search_notice:limited?MAINTENANCE_NOTICE:null,recent_hours:!publicOnly&&!text&&!pinnedOnly?72:null};
}
async function readArticleList(input,settings={},rest){
  const spec=listRequest(input,settings);
  let rows=[];
  if(!spec.emptySearch&&!(settings.publicOnly&&!spec.text)){
    if(spec.search_limited&&settings.searchFullText!==false){
      try{
        rows=await partitionedSearch(input,spec,settings,rest);
        spec.search_scope='full_text_partitioned';spec.search_limited=false;spec.search_notice=null;
      }catch(error){
        console.warn(JSON.stringify({event:'article-fulltext-fallback',reason:String(error.message||error).slice(0,180)}));
        rows=await rest(spec.resource,spec.options);
      }
    }else rows=await rest(spec.resource,spec.options);
  }
  if(!Array.isArray(rows))throw new Error('文章查询返回格式异常');
  const articles=rows.slice(0,spec.pageSize).map(row=>settings.publicOnly?row:{...row,pin:pinState(row,settings.now)});
  return {articles,page:spec.page,page_size:spec.pageSize,has_more:rows.length>spec.pageSize,search:spec.text,recent_hours:spec.recent_hours,search_scope:spec.search_scope,search_limited:spec.search_limited,search_notice:spec.search_notice};
}
function publicDatabaseError(error){
  if(/read.only transaction|25006/i.test(String(error?.message||'')))return {status:503,code:'DATABASE_READ_ONLY',message:'数据库当前处于只读保护状态，无法保存置顶或文章修改；当前内容未被更改。'};
  if(/statement timeout|57014/i.test(String(error?.message||'')))return {status:503,code:'SEARCH_TIMEOUT',message:'查询超时，不代表文章不存在。请稍后重试或缩小关键词范围。'};
  return null;
}
module.exports={listRequest,readArticleList,publicDatabaseError,MAINTENANCE_NOTICE};

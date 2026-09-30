const {articleListQuery,searchTerms}=require('./article-search');
const {pinState}=require('../../../article-pin-policy');
const MAINTENANCE_NOTICE='当前按标题和摘要搜索全部历史文章；全文索引维护中，仅正文命中的文章可能暂未列出。';
const uuid=v=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v||'');

function listRequest(input={}, {publicOnly=false,now=Date.now(),indexReady=process.env.ARTICLE_SEARCH_INDEX_READY==='1'}={}){
  const spec=articleListQuery(input,{publicOnly,now});
  const {query,text,pageSize,page}=spec;
  const pinnedOnly=!publicOnly&&input.status==='pinned';
  const at=new Date(now).toISOString();
  if(!publicOnly)query.select+=',publication_path,homepage_pinned_at,homepage_pin_expires_at,hidden_at,archived_at';
  if(publicOnly){query.hidden_at='is.null';query.archived_at='is.null';query.or=`(published_at.lte.${at},and(published_at.is.null,created_at.lte.${at}))`;}
  if(pinnedOnly){
    query.status='eq.published';query.visibility='eq.public';query.hidden_at='is.null';query.archived_at='is.null';
    query.homepage_pin_expires_at=`gt.${at}`;query.homepage_pinned_at=`lte.${at}`;
    query['metadata->>homepage_focus_override']='eq.force';
    query.order='homepage_pinned_at.desc,published_at.desc.nullslast,id.desc';
    if(!text)delete query.and;
  }
  // Never activate a partly filled index: deployment keeps this flag off until
  // a complete DB coverage / performance / privacy verification succeeds.
  const useIndex=Boolean(text&&!uuid(text)&&indexReady);
  if(text&&!uuid(text)&&!useIndex){
    const filters=searchTerms(text).map(term=>`or(title.ilike.*${term}*,summary.ilike.*${term}*)`);
    query.and=`(${filters.join(',')})`;
  }
  let resource='articles',options={query};
  if(useIndex){
    resource='rpc/trrb_search_articles_v2';
    options={method:'POST',query:{select:query.select},body:{p_terms:searchTerms(text),p_public_only:publicOnly,p_status:pinnedOnly?null:input.status||null,p_category:input.category||null,p_offset:(page-1)*pageSize,p_limit:pageSize+1,p_article_id:null,p_pinned_only:pinnedOnly,p_ice_category:false}};
  }
  const limited=Boolean(text&&!uuid(text)&&!useIndex);
  return {...spec,resource,options,pinnedOnly,search_scope:useIndex?'full_text':limited?'title_summary':uuid(text)?'article_id':'list',search_limited:limited,search_notice:limited?MAINTENANCE_NOTICE:null,recent_hours:!publicOnly&&!text&&!pinnedOnly?72:null};
}
async function readArticleList(input,settings={},rest){
  const spec=listRequest(input,settings);
  const rows=spec.emptySearch||settings.publicOnly&&!spec.text?[]:await rest(spec.resource,spec.options);
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

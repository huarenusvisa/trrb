'use strict';
const {createHash,randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SELECT='id,title,status,visibility,slug,publication_path,published_at,created_at,cover_image,author,metadata';
function problem(message,code,status=503){return Object.assign(new Error(message),{code,statusCode:status});}
function identity(actorId,requestId){
  if(!UUID.test(actorId)||!UUID.test(requestId))throw problem('无效的发布请求编号','INVALID_PUBLISH_REQUEST',400);
  const h=createHash('sha256').update('trrb-manual-v1\0'+actorId.toLowerCase()+'\0'+requestId.toLowerCase()).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function fingerprint(payload){
  const keys=['title','content','category_id','category_name','cover_image','author','status','visibility'];
  return createHash('sha256').update(JSON.stringify(keys.map(k=>[k,payload[k]??null]))).digest('hex');
}
function publicReceipt(row,requestId,replayed=false){
  const {metadata,...article}=row;
  return {article,request_id:requestId,replayed,confirmed:true};
}
async function lookupManualPublication(input,actor,rest){
  const requestId=String(input.request_id||'').toLowerCase(),id=identity(actor.user.id,requestId);
  const rows=await rest('articles',{query:{select:SELECT,id:'eq.'+id,limit:'1'},timeoutMs:5000});
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row)return {confirmed:false,request_id:requestId,state:'not_found',message:'尚未查到已保存记录；不是发布成功确认。'};
  if(row.metadata?.manual_actor_id!==actor.user.id||row.metadata?.manual_request_id!==requestId)throw problem('发布记录与当前账号不一致','PUBLISH_RECORD_CONFLICT',409);
  return {...publicReceipt(row,requestId,true),state:row.status};
}
async function saveManualArticle(payload,input,actor,rest){
  const requestId=String(input.request_id||randomUUID()).toLowerCase(),id=identity(actor.user.id,requestId),hash=fingerprint(payload);
  const read=async()=>{
    const rows=await rest('articles',{query:{select:SELECT,id:'eq.'+id,limit:'1'},timeoutMs:3500});
    const row=Array.isArray(rows)?rows[0]:null;
    if(row&&(row.metadata?.manual_actor_id!==actor.user.id||row.metadata?.manual_request_id!==requestId||row.metadata?.manual_payload_sha256!==hash))throw problem('同一发布编号的内容已改变，请先核对原稿，不能覆盖已保存文章。','PUBLISH_PAYLOAD_CONFLICT',409);
    return row;
  };
  // Reads are exact primary-key lookups; there is no recent-500 or full-body pre-scan.
  let prior;
  try{prior=await read();}catch(error){if(error.statusCode===409)throw error;throw problem('发布前核对暂时超时，尚未发送写入请求；请保留正文后重试。','PUBLISH_LOOKUP_UNAVAILABLE');}
  if(prior)return publicReceipt(prior,requestId,true);
  const body={...payload,id,metadata:{...payload.metadata,manual_request_id:requestId,manual_actor_id:actor.user.id,manual_payload_sha256:hash}};
  try{
    const rows=await rest('articles',{method:'POST',query:{select:SELECT},body,prefer:'return=representation',timeoutMs:12000});
    const row=Array.isArray(rows)?rows[0]:rows;
    if(!row?.id||row.id!==id)throw problem('尚未收到可靠的文章保存回执','PUBLISH_RECEIPT_MISSING');
    return publicReceipt(row,requestId);
  }catch(error){
    // A lost HTTP response is not proof of a failed transaction. Read once; never
    // retry POST automatically or overwrite a record after a key collision.
    let saved;
    try{saved=await read();}catch(readError){if(readError.code==='PUBLISH_PAYLOAD_CONFLICT')throw readError;}
    if(saved)return publicReceipt(saved,requestId,true);
    if(/duplicate published article title/i.test(String(error.message)))throw problem('已有同标题的已发布文章。请先查看文章管理，避免重复发布。','DUPLICATE_PUBLISHED_ARTICLE',409);
    if(error.statusCode>=400&&error.statusCode<500&&![408,429].includes(error.statusCode))throw error;
    const pending=problem('发布结果暂未确认，请保留正文。再次提交同一内容会沿用原发布编号，不会另建重复稿。','PUBLISH_RESULT_UNKNOWN');
    pending.requestId=requestId;throw pending;
  }
}
module.exports={identity,fingerprint,lookupManualPublication,saveManualArticle};

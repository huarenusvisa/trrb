(function(root){
  'use strict';
  const keyPrefix='trrb:manual-submit-v1:';
  const stages={save_article:'文章保存',upload_cover:'封面上传',publication_status:'发布结果核对'};
  const inMemory=new Map();
  function owner(token){try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub||'unknown';}catch{return 'unknown';}}
  async function requestIdentity(payload,token){
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    const signature=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const key=keyPrefix+owner(token);let saved=inMemory.get(key);
    try{saved=JSON.parse(root.sessionStorage.getItem(key))||saved;}catch{}
    if(!saved||saved.signature!==signature)saved={signature,request_id:root.crypto.randomUUID()};
    inMemory.set(key,saved);try{root.sessionStorage.setItem(key,JSON.stringify(saved));}catch{}
    return saved.request_id;
  }
  async function raw({api,token,action,payload}){
    const timeoutMs=action==='upload_cover'?22000:action==='publication_status'?6000:action==='save_article'?25000:0;
    const controller=new AbortController();const timer=timeoutMs?setTimeout(()=>controller.abort(),timeoutMs):null;
    try{
      const response=await root.fetch(api,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload}),signal:controller.signal});
      const result=await response.json().catch(()=>null);
      if(!response.ok){const e=new Error(result?.error||`${stages[action]||'文章接口'}失败（${response.status}）`);e.status=response.status;e.code=result?.code;throw e;}
      if(!result)throw new Error('服务器未返回有效保存结果');
      return result;
    }finally{if(timer)clearTimeout(timer);}
  }
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function confirmPublication(options,requestId){
    const delays=Array.isArray(root.__TRRB_PUBLISH_CONFIRM_DELAYS__)?root.__TRRB_PUBLISH_CONFIRM_DELAYS__:[0,1200,2500];
    for(const delay of delays){
      if(delay>0)await wait(delay);
      try{
        const checked=await raw({...options,action:'publication_status',payload:{request_id:requestId}});
        if(checked.confirmed&&checked.article?.id)return checked;
      }catch{}
    }
    return null;
  }
  async function call(options){
    const {action,token}=options;
    const payload={...options.payload};
    if(action==='save_article')payload.request_id=await requestIdentity(payload,token);
    try{
      const result=await raw({...options,payload});
      if(action==='save_article'&&(!result.confirmed||!result.article?.id))throw new Error('未收到文章保存确认');
      return result;
    }catch(error){
      const ambiguous=action==='save_article'&&(!error.status||error.status>=500)&&error.code!=='PUBLISH_LOOKUP_UNAVAILABLE';
      if(ambiguous){
        const checked=await confirmPublication(options,payload.request_id);
        if(checked)return checked;
        throw new Error('文章保存响应超时，发布结果尚未确认。正文和封面选择已保留；重试同一内容不会重复建稿。');
      }
      if(action==='upload_cover'&&(!error.status||error.status>=500))throw new Error('封面上传超时，尚未进入文章保存。正文和文件选择已保留，请稍后重试。');
      throw error;
    }
  }
  function completed(token){const key=keyPrefix+owner(token);inMemory.delete(key);try{root.sessionStorage.removeItem(key);}catch{}}
  root.TrrbManualPublish={call,completed,requestIdentity};
})(typeof window!=='undefined'?window:globalThis);

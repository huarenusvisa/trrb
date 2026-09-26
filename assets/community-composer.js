/* Media uploads begin only on Publish. Composition stays in this browser, not a cloud draft. */
(function(root){
  'use strict';
  const policy=root.TrrbCommunityMediaPolicy;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create({client,getSession}){
    const form=$('composer-form'),dialog=$('composer-dialog');
    let selected=[],postId=crypto.randomUUID(),busy=false,attempted=false,ownerId='';
    const bucket=()=>client.storage.from('community-post-media');
    const message=text=>{$('composer-message').textContent=text;};
    function render(){
      $('community-media-previews').innerHTML=selected.map((item,i)=>`<figure class="compose-media-preview">${item.file.type.startsWith('video/')?`<video src="${esc(item.url)}" controls preload="metadata" playsinline></video>`:`<img src="${esc(item.url)}" alt="已选图片 ${i+1}" />`}<button type="button" data-remove-compose-media="${i}" aria-label="移除第 ${i+1} 个文件" ${busy?'disabled':''}>×</button><figcaption>${esc(item.file.name)} · ${(item.file.size/1048576).toFixed(1)} MB</figcaption></figure>`).join('');
      $('community-media-count').textContent=selected.length?(selected[0].file.type.startsWith('video/')?'已选 1 个视频':`已选 ${selected.length} / 9 张图片`):'可不上传附件';
    }
    function setBusy(value){
      busy=value;
      form.querySelectorAll('button,input,textarea,select').forEach(el=>{el.disabled=value;});
      form.setAttribute('aria-busy',String(value));
      $('community-publish-submit').textContent=value?'正在发布…':'发布';
    }
    function release(items){for(const item of items){URL.revokeObjectURL(item.url);}}
    async function removeUnbound(items){
      const paths=items.filter(x=>x.path).map(x=>x.path);
      if(paths.length){try{await bucket().remove(paths);}catch{/* RLS prevents deleting files attached to any non-deleted post. */}}
    }
    function reset(){release(selected);selected=[];postId=crypto.randomUUID();ownerId='';attempted=false;render();}
    async function addFiles(files){
      if(busy)return;
      const next=Array.from(files||[]);if(!next.length)return;
      try{
        policy.validateFiles([...selected.map(x=>x.file),...next]);
        selected.push(...next.map(file=>({file,url:URL.createObjectURL(file),path:null,uploaded:false})));
        render();message('');
      }catch(error){message(error.message);}
    }
    function prepareForAccount(){
      const user=getSession()?.user?.id||'';
      if(ownerId&&ownerId!==user){reset();form.reset();}
      if(user)ownerId=user;
    }
    async function submit(api){
      if(busy)throw new Error('正在发布，请勿重复提交');
      const session=getSession();if(!session?.user?.id)throw new Error('请先登录再发布');
      if(ownerId&&ownerId!==session.user.id)throw new Error('登录账号已变化，请重新打开发布框');
      ownerId=session.user.id;
      const content=$('post-content').value.trim(),category=$('post-category').value;
      policy.validateFiles(selected.map(x=>x.file));
      if(!content&&!selected.length)throw new Error('请填写正文，或选择图片／视频');
      setBusy(true);
      try{
        // Reusing this ID makes a retry safe even when a previous response was lost.
        if(attempted){
          const saved=await api('GET',null,'?post_id='+encodeURIComponent(postId));
          const previous=saved.posts?.find(p=>p.id===postId&&p.user_id===ownerId);
          if(previous)return {ok:true,post:previous,message:previous.status==='published'?'发布成功':'已提交，进入人工审核',replayed:true};
        }
        for(let i=0;i<selected.length;i++){
          const item=selected[i];if(item.uploaded)continue;
          message(`正在上传 ${i+1} / ${selected.length}…`);
          item.path=item.path||`${ownerId}/${postId}/${crypto.randomUUID()}.${policy.TYPES[item.file.type]}`;
          const result=await bucket().upload(item.path,item.file,{contentType:item.file.type,cacheControl:'3600',upsert:false});
          if(result.error){
            // A storage response can be lost after success. A duplicate is safe only
            // at this random, immutable path; the DB verifies real object metadata.
            if(String(result.error.statusCode)!=='409'&&!/already exists|duplicate/i.test(result.error.message||''))throw result.error;
          }
          item.uploaded=true;
        }
        const media=selected.map((item,i)=>({storage_path:item.path,media_type:item.file.type.startsWith('video/')?'video':'image',mime_type:item.file.type,size_bytes:item.file.size,sort_order:i}));
        message('上传完成，正在提交…');attempted=true;
        return await api('POST',{action:'create_post',composer_version:'simple-media-v1',client_post_id:postId,category,content,media});
      }finally{setBusy(false);}
    }
    $('community-images').addEventListener('change',event=>{void addFiles(event.target.files);event.target.value='';});
    $('community-video').addEventListener('change',event=>{void addFiles(event.target.files);event.target.value='';});
    $('community-add-images').addEventListener('click',()=>{$('community-images').click();});
    $('community-add-video').addEventListener('click',()=>{$('community-video').click();});
    $('community-media-previews').addEventListener('click',event=>{
      const b=event.target.closest('[data-remove-compose-media]');if(!b||busy)return;
      const i=Number(b.dataset.removeComposeMedia);const removed=selected.splice(i,1);release(removed);void removeUnbound(removed);render();
    });
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('click',event=>{if(busy&&event.target.closest('[data-close]')){event.preventDefault();event.stopPropagation();}},true);
    dialog.addEventListener('close',()=>{dialog.querySelectorAll('video').forEach(v=>v.pause());});
    root.addEventListener('pagehide',()=>{release(selected);});
    render();
    return {submit,reset,prepareForAccount,isBusy:()=>busy,clearForLogout:()=>{if(!busy){void removeUnbound(selected);reset();form.reset();}}};
  }
  root.TrrbCommunityComposer={create};
})(window);

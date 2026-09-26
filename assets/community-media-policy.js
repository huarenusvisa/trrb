/* Pure policy shared by browser, API and tests. Storage independently enforces bytes. */
(function(root){
  'use strict';
  const MAX_BYTES=12*1024*1024,MAX_IMAGES=9;
  const TYPES=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'});
  const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  function fail(message){const e=new Error(message);e.statusCode=400;throw e;}
  function validateFiles(files){
    if(!Array.isArray(files))fail('上传文件格式无效');
    let videos=0;
    for(const f of files){
      if(!Object.hasOwn(TYPES,f.type))fail('请上传 JPG、PNG、WebP 图片，或 MP4、MOV、WebM 视频');
      if(!Number.isSafeInteger(f.size)||f.size<=0)fail('不能上传空文件');
      if(f.size>MAX_BYTES)fail(f.type.startsWith('video/')?'视频不能超过 12 MB，请压缩后重新选择':'单张图片不能超过 12 MB');
      if(f.type.startsWith('video/'))videos++;
    }
    if(videos&&files.length!==1)fail('每次可上传 1 个视频，不能与图片混合；请先移除已选文件');
    if(!videos&&files.length>MAX_IMAGES)fail('最多上传 9 张图片');
    return files;
  }
  function normalizeMedia(media,userId,postId){
    if(media===undefined)return [];
    if(!Array.isArray(media)||media.length>MAX_IMAGES)fail('媒体列表无效，最多 9 张图片或 1 个视频');
    const paths=new Set();
    const items=media.map((m,i)=>{
      if(!m||typeof m!=='object'||!UUID.test(userId)||!UUID.test(postId))fail('媒体编号无效');
      const path=String(m.storage_path||'');
      const prefix=userId+'/'+postId+'/';
      if(!path.startsWith(prefix)||!new RegExp('^[a-f0-9-]{36}\\.(jpg|png|webp|mp4|mov|webm)$','i').test(path.slice(prefix.length)))fail('不能使用其他账号或其他帖子的上传文件');
      if(paths.has(path))fail('同一文件不能重复添加');paths.add(path);
      const mime=String(m.mime_type||'');
      const size=Number(m.size_bytes);
      const dimension=value=>Number.isInteger(value)&&value>0&&value<=30000?value:null;
      return {storage_path:path,media_type:mime.startsWith('video/')?'video':'image',mime_type:mime,size_bytes:size,width:dimension(m.width),height:dimension(m.height),sort_order:i};
    });
    validateFiles(items.map(m=>({type:m.mime_type,size:m.size_bytes})));
    return items;
  }
  function automaticTitle(content,media=[]){
    const line=String(content||'').split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'';
    const title=Array.from(line.replace(/[<>]/g,'')).slice(0,80).join('');
    if(Array.from(title).length>=4)return title;
    if(title)return '社区分享｜'+title;
    return media.some(m=>m.media_type==='video')?'分享一段视频':'分享图片';
  }
  function normalizeSimplePost(body,userId){
    const id=String(body.client_post_id||'');
    if(!UUID.test(id))fail('发布编号无效，请重新打开发布框');
    const content=String(body.content||'').replace(/[<>]/g,'').trim();
    if(Array.from(content).length>12000)fail('正文不能超过 12000 字');
    const media=normalizeMedia(body.media,userId,id);
    if(!content&&!media.length)fail('请填写正文，或选择图片／视频');
    return {id,content,media,title:automaticTitle(content,media)};
  }
  const api={MAX_BYTES,MAX_IMAGES,TYPES,UUID,validateFiles,normalizeMedia,automaticTitle,normalizeSimplePost};
  root.TrrbCommunityMediaPolicy=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

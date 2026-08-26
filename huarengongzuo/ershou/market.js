(() => {
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const $=(id)=>document.getElementById(id);
  const panel=$('publish-panel');
  let currentUser=null,currentProfile=null,photos=[],locationData={},lastAiSuggestion={};
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const publicImage=(path)=>`${SUPABASE_URL}/storage/v1/object/public/secondhand-images/${String(path||'').split('/').map(encodeURIComponent).join('/')}`;
  const setStatus=(id,message,type='')=>{const el=$(id);if(!el)return;el.textContent=message||'';el.className=`form-status${type?` ${type}`:''}`;};
  const session=async()=>{const{data}=await client.auth.getSession();return data.session||null};

  function openPanel(){panel.hidden=false;document.body.classList.add('modal-open');if(currentUser)$('listing-photos')?.focus();else $('login-identifier')?.focus()}
  function closePanel(){panel.hidden=true;document.body.classList.remove('modal-open')}
  document.querySelectorAll('[data-open-publish]').forEach((button)=>button.addEventListener('click',openPanel));
  document.querySelectorAll('[data-close-publish]').forEach((button)=>button.addEventListener('click',closePanel));
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&!panel.hidden)closePanel()});

  async function signedIn(user){
    currentUser=user||null;$('publish-login').hidden=Boolean(currentUser);$('smart-publish-form').hidden=!currentUser;if(!currentUser)return;
    currentProfile=await window.TRUnifiedAccount.loadProfile(client,currentUser.id);$('account-name').textContent=currentProfile?.display_name||'统一账号';$('account-label').textContent=window.TRUnifiedAccount.accountLabel(currentUser);
    const label=window.TRUnifiedAccount.accountLabel(currentUser);if(!$('listing-contact').value&&(/^\+\d{10,15}$/.test(label)||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label)))$('listing-contact').value=label;
  }
  async function login(){
    const button=$('login-button');button.disabled=true;setStatus('auth-status','正在登录；新账号会自动创建…');
    try{const result=await window.TRUnifiedAccount.loginOrRegister(client,$('login-identifier').value,$('login-password').value);await signedIn(result.user);setStatus('auth-status',result.created?'账号已创建并登录。':'登录成功。','success')}
    catch(error){setStatus('auth-status',error.message,'error')}finally{button.disabled=false}
  }
  $('login-button').addEventListener('click',login);$('login-password').addEventListener('keydown',(event)=>{if(event.key==='Enter')login()});

  async function loadBitmap(file){
    if('createImageBitmap' in window)return createImageBitmap(file);
    return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('无法读取这张图片'))};img.src=url});
  }
  const canvasBlob=(canvas,quality)=>new Promise((resolve,reject)=>canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error('图片压缩失败')),'image/jpeg',quality));
  async function prepareImage(file){
    if(!file||!String(file.type).startsWith('image/'))throw new Error('只能上传图片文件');if(file.size>25*1024*1024)throw new Error('单张原图不能超过25MB');
    const bitmap=await loadBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    const blob=await canvasBlob(canvas,.82),analysisScale=Math.min(1,720/Math.max(canvas.width,canvas.height)),analysis=document.createElement('canvas');analysis.width=Math.max(1,Math.round(canvas.width*analysisScale));analysis.height=Math.max(1,Math.round(canvas.height*analysisScale));analysis.getContext('2d',{alpha:false}).drawImage(canvas,0,0,analysis.width,analysis.height);
    const analysisBlob=await canvasBlob(analysis,.66),analysisUrl=await new Promise((resolve)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(analysisBlob)});return{blob,analysisUrl,preview:URL.createObjectURL(blob),width:canvas.width,height:canvas.height};
  }
  function movePhoto(index,direction){const next=index+direction;if(next<0||next>=photos.length)return;[photos[index],photos[next]]=[photos[next],photos[index]];renderPhotos()}
  function renderPhotos(){
    $('photo-count').textContent=`${photos.length}/8`;$('ai-analyze').disabled=!photos.length;
    $('photo-strip').innerHTML=photos.map((photo,index)=>`<div class="photo-thumb"><img src="${photo.preview}" alt="商品图片${index+1}">${index===0?'<span class="cover-badge">封面</span>':''}<div class="photo-actions"><button type="button" data-photo-left="${index}" aria-label="向前移动">←</button><button type="button" data-photo-right="${index}" aria-label="向后移动">→</button><button type="button" data-photo-remove="${index}" aria-label="删除">×</button></div></div>`).join('');
    document.querySelectorAll('[data-photo-remove]').forEach((button)=>button.onclick=()=>{const index=Number(button.dataset.photoRemove);URL.revokeObjectURL(photos[index].preview);photos.splice(index,1);renderPhotos()});document.querySelectorAll('[data-photo-left]').forEach((button)=>button.onclick=()=>movePhoto(Number(button.dataset.photoLeft),-1));document.querySelectorAll('[data-photo-right]').forEach((button)=>button.onclick=()=>movePhoto(Number(button.dataset.photoRight),1));
  }
  $('listing-photos').addEventListener('change',async()=>{
    const files=[...($('listing-photos').files||[])];if(!files.length)return;if(photos.length+files.length>8){setStatus('ai-status','每件商品最多上传8张图片。','error');$('listing-photos').value='';return}setStatus('ai-status','正在压缩图片，请稍候…');
    try{for(const file of files){photos.push(await prepareImage(file));renderPhotos()}setStatus('ai-status','图片已经准备好，可以自动识别，也可以直接手动填写。','success')}catch(error){setStatus('ai-status',error.message,'error')}finally{$('listing-photos').value=''}
  });

  async function analyze(){
    const button=$('ai-analyze');button.disabled=true;setStatus('ai-status','正在识别商品并生成文字…');
    try{const active=await session();if(!active)throw new Error('请重新登录');const response=await fetch('/.netlify/functions/secondhand-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${active.access_token}`},body:JSON.stringify({images:photos.map((photo)=>photo.analysisUrl)})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'识别失败');lastAiSuggestion=data;$('listing-text').value=[data.title,data.description].filter(Boolean).join('\n\n');$('listing-category').value=data.category||'';$('listing-condition').value=data.condition||'used_good';setStatus('ai-status',`识别完成。请直接修改不准确的内容。${data.review_note?`\n需要确认：${data.review_note}`:''}`,'success');$('listing-text').focus()}
    catch(error){setStatus('ai-status',`${error.message}；你仍然可以手动填写发布。`,'error')}finally{button.disabled=!photos.length}
  }
  $('ai-analyze').addEventListener('click',analyze);
  $('listing-free').addEventListener('change',()=>{if($('listing-free').checked){$('listing-price').value='0';$('listing-price').disabled=true;$('listing-category').value='free'}else $('listing-price').disabled=false});

  async function useLocation(){
    if(!navigator.geolocation)return setStatus('location-status','当前浏览器不支持自动定位，请手动输入城市或社区。','error');const button=$('use-location');button.disabled=true;setStatus('location-status','正在读取附近区域，不会公开门牌号…');
    navigator.geolocation.getCurrentPosition(async(position)=>{try{const active=await session();if(!active)throw new Error('请重新登录');const response=await fetch('/.netlify/functions/secondhand-location',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${active.access_token}`},body:JSON.stringify({lat:position.coords.latitude,lng:position.coords.longitude})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'无法读取位置');locationData=data;$('listing-location').value=data.location_label;setStatus('location-status',`已自动填写：${data.location_label}。前台只显示这个大概区域。`,'success')}catch(error){setStatus('location-status',`${error.message}，请手动输入城市或社区。`,'error')}finally{button.disabled=false}},(error)=>{setStatus('location-status',error.code===1?'你没有允许定位，请手动输入城市或社区。':'暂时无法取得位置，请手动输入。','error');button.disabled=false},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }
  $('use-location').addEventListener('click',useLocation);$('listing-location').addEventListener('input',()=>{if($('listing-location').value!==locationData.location_label)locationData={}});

  function splitListingText(value){const raw=String(value||'').trim();if(!raw)return{title:'',description:''};const lines=raw.split(/\r?\n/),firstIndex=lines.findIndex((line)=>line.trim()),first=firstIndex>=0?lines[firstIndex].trim():'';if(lines.length===1&&Array.from(first).length>30)return{title:Array.from(first).slice(0,30).join(''),description:Array.from(first).slice(30).join('').trim()};return{title:Array.from(first).slice(0,60).join(''),description:lines.slice(firstIndex+1).join('\n').trim()}}
  function typedLocation(raw){const label=String(raw||'').trim(),match=label.match(/(?:,|\s)\s*([A-Za-z]{2})(?:\s+\d{5})?$/);return{location_label:label,city:label.replace(/(?:,|\s)\s*[A-Za-z]{2}(?:\s+\d{5})?$/,'').trim()||label,state_code:match?match[1].toUpperCase():null,neighborhood:null,postal_code:(label.match(/\b\d{5}\b/)||[])[0]||null}}
  async function publish(event){
    event.preventDefault();const button=$('publish-submit');button.disabled=true;setStatus('publish-status','正在发布并上传图片…');let listingId=null,uploaded=[];
    try{if(!currentUser)throw new Error('请先登录');if(!photos.length)throw new Error('请至少上传1张商品图片');const text=splitListingText($('listing-text').value);if(!text.title)throw new Error('请在第一行填写商品标题');if(!$('listing-category').value)throw new Error('请选择商品分类');const location=Object.keys(locationData).length?locationData:typedLocation($('listing-location').value);if(!location.location_label)throw new Error('请填写所在区域');const price=$('listing-free').checked?0:Number($('listing-price').value);if(!Number.isFinite(price)||price<0)throw new Error('请填写正确价格');
      const payload={seller_user_id:currentUser.id,category_slug:$('listing-category').value,title:text.title,description:text.description,price,item_condition:$('listing-condition').value,city:location.city||location.location_label,state_code:location.state_code||null,neighborhood:location.neighborhood||null,postal_code:location.postal_code||null,location_label:location.location_label,approximate_lat:location.approximate_lat??null,approximate_lng:location.approximate_lng??null,contact_value:$('listing-contact').value.trim(),contact_public:true,ai_suggestion:lastAiSuggestion,status:'pending'};let result=await client.from('secondhand_listings').insert(payload).select('id').single();if(result.error)throw result.error;listingId=result.data.id;
      for(let index=0;index<photos.length;index++){setStatus('publish-status',`正在上传第 ${index+1}/${photos.length} 张图片…`);const photo=photos[index],path=`${currentUser.id}/${listingId}/${crypto.randomUUID()}.jpg`;result=await client.storage.from('secondhand-images').upload(path,photo.blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});if(result.error)throw result.error;uploaded.push(path);result=await client.from('secondhand_listing_images').insert({listing_id:listingId,uploader_user_id:currentUser.id,storage_path:path,width:photo.width,height:photo.height,sort_order:index,alt_text:text.title});if(result.error)throw result.error}
      setStatus('publish-status','发布成功，商品已经进入审核。你可以在“我的发布”中修改、下架或删除。','success');setTimeout(()=>{location.href='/ershou/my.html'},900);
    }catch(error){if(uploaded.length)await client.storage.from('secondhand-images').remove(uploaded);if(listingId){await client.from('secondhand_listing_images').delete().eq('listing_id',listingId);await client.from('secondhand_listings').update({status:'deleted',status_reason:'upload_failed'}).eq('id',listingId)}setStatus('publish-status',`发布失败：${error.message}`,'error');button.disabled=false}
  }
  $('smart-publish-form').addEventListener('submit',publish);

  async function loadListings(){
    const keyword=$('search-keyword').value.trim().toLowerCase(),place=$('search-place').value.trim().toLowerCase(),params=new URLSearchParams(location.search),category=params.get('category')||'';let query=client.from('secondhand_listings').select('id,title,price,location_label,status,created_at,secondhand_listing_images(storage_path,sort_order)').in('status',['published','sold']).eq('moderation_hold',false).order('published_at',{ascending:false,nullsFirst:false}).limit(48);if(category)query=query.eq('category_slug',category);const{data,error}=await query;if(error){$('filter-copy').textContent='商品读取失败，请稍后刷新。';return}const rows=(data||[]).filter((row)=>(!keyword||row.title.toLowerCase().includes(keyword))&&(!place||String(row.location_label).toLowerCase().includes(place)));
    $('listing-grid').innerHTML=rows.map((row)=>{const images=[...(row.secondhand_listing_images||[])].sort((a,b)=>a.sort_order-b.sort_order),cover=images[0]?.storage_path;return`<a class="listing-card" href="/ershou/item.html?id=${encodeURIComponent(row.id)}">${cover?`<img src="${publicImage(cover)}" alt="${esc(row.title)}" loading="lazy">`:'<div class="listing-placeholder">暂无图片</div>'}<div><h3>${esc(row.title)}</h3><strong>${Number(row.price)===0?'免费':`$${Number(row.price).toLocaleString()}`}</strong><small>${esc(row.location_label)}${row.status==='sold'?' · 已售出':''}</small></div></a>`}).join('');$('listing-empty').hidden=rows.length>0;
  }
  const keyword=$('search-keyword'),place=$('search-place'),params=new URLSearchParams(location.search);keyword.value=params.get('q')||'';place.value=params.get('place')||'';const selectedCategory=params.get('category')||'';document.querySelectorAll('[data-category]').forEach((link)=>{const url=new URL(link.href,location.href);if(place.value)url.searchParams.set('place',place.value);link.href=`${url.pathname}${url.search}`;if(url.searchParams.get('category')===selectedCategory)link.classList.add('active')});const parts=[selectedCategory?document.querySelector('.category-grid a.active b')?.textContent:'',keyword.value.trim(),place.value.trim()].filter(Boolean);if(parts.length)$('filter-copy').textContent=`已选择：${parts.join(' · ')}`;
  $('market-search').addEventListener('submit',(event)=>{event.preventDefault();const next=new URLSearchParams();if(keyword.value.trim())next.set('q',keyword.value.trim());if(place.value.trim())next.set('place',place.value.trim());if(selectedCategory)next.set('category',selectedCategory);location.search=next.toString()});document.querySelectorAll('[data-place]').forEach((button)=>button.addEventListener('click',()=>{place.value=button.dataset.place||'';$('market-search').requestSubmit()}));
  document.addEventListener('DOMContentLoaded',async()=>{const active=await session();await signedIn(active?.user||null);await loadListings();if(new URLSearchParams(location.search).get('publish')==='1')openPanel()});
})();

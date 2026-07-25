(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const menu=$('.ice-menu');
  if(!menu)return;
  const pageUrl=()=>location.href.split('#')[0];
  const toast=(t)=>{const el=$('#share-toast');if(!el)return;el.textContent=t;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600)};

  document.body.insertAdjacentHTML('beforeend',`<button id="share-backdrop" class="share-backdrop" aria-label="关闭分享菜单"></button><section id="share-sheet" class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title"><div class="share-sheet-head"><h2 id="share-title">分享 ICE 执法追踪</h2><button id="share-close" class="share-sheet-close" aria-label="关闭">×</button></div><div class="share-actions"><button id="share-page" class="share-action primary">转发当前页面<small>发送给朋友或分享到其他应用</small></button><button id="share-poster" class="share-action">生成长图并分享<small>自动生成新闻长图和二维码</small></button><button id="share-copy" class="share-action">复制链接<small>复制当前页面地址</small></button></div></section><div id="poster-modal" class="poster-modal" role="dialog" aria-modal="true"><div class="poster-card"><img id="poster-image" alt="ICE执法追踪分享长图"><div class="poster-buttons"><a id="poster-save" download="ICE执法追踪.png">保存长图</a><button id="poster-system-share" class="poster-share">系统分享</button><button id="poster-close">关闭</button></div><p class="poster-tip">微信内请长按图片保存，再发送给好友或朋友圈</p></div></div><div id="share-toast" class="share-toast" role="status" aria-live="polite"></div>`);

  const open=()=>{document.documentElement.classList.add('share-sheet-open');document.body.classList.add('share-sheet-open');menu.setAttribute('aria-expanded','true')};
  const close=()=>{document.documentElement.classList.remove('share-sheet-open');document.body.classList.remove('share-sheet-open');menu.setAttribute('aria-expanded','false')};
  menu.setAttribute('aria-label','打开分享菜单');menu.setAttribute('aria-expanded','false');menu.addEventListener('click',open);
  $('#share-close').onclick=close;$('#share-backdrop').onclick=close;
  addEventListener('keydown',e=>{if(e.key==='Escape'){close();$('#poster-modal').classList.remove('show')}});

  const copy=async()=>{try{await navigator.clipboard.writeText(pageUrl())}catch{const x=document.createElement('textarea');x.value=pageUrl();x.style.position='fixed';x.style.opacity='0';document.body.append(x);x.select();document.execCommand('copy');x.remove()}toast('链接已复制，可粘贴发送给朋友')};
  $('#share-copy').onclick=copy;
  $('#share-page').onclick=async()=>{const data={title:'ICE执法追踪 - 唐人日报',text:'唐人日报 ICE执法追踪',url:pageUrl()};try{if(navigator.share){await navigator.share(data);close()}else await copy()}catch(e){if(e.name!=='AbortError')await copy()}};

  const wrap=(ctx,text,x,y,max,line=46,maxLines=3)=>{let cur='',lines=[];for(const c of text){if(ctx.measureText(cur+c).width>max&&cur){lines.push(cur);cur=c}else cur+=c}if(cur)lines.push(cur);lines.slice(0,maxLines).forEach((l,i)=>ctx.fillText(l,x,y+i*line));return Math.min(lines.length,maxLines)*line};

  async function loadImage(src){return await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=src})}

  async function makeQrCanvas(){
    const qr=document.createElement('canvas');
    if(window.QRCode&&typeof window.QRCode.toCanvas==='function'){
      await window.QRCode.toCanvas(qr,pageUrl(),{width:190,margin:1,errorCorrectionLevel:'M'});
      return qr;
    }
    const api='https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=6&data='+encodeURIComponent(pageUrl());
    const response=await fetch(api,{mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error('二维码服务不可用');
    const blob=await response.blob();
    const objectUrl=URL.createObjectURL(blob);
    try{const img=await loadImage(objectUrl);qr.width=190;qr.height=190;qr.getContext('2d').drawImage(img,0,0,190,190);return qr}finally{URL.revokeObjectURL(objectUrl)}
  }

  async function poster(){
    toast('正在生成长图…');
    await new Promise(r=>setTimeout(r,50));
    const news=[...document.querySelectorAll('.ice-news-copy h3')].slice(0,10).map(x=>x.textContent.trim()).filter(Boolean);
    const W=1080,pad=60,row=82,H=1120+Math.max(1,news.length)*row;
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const g=c.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,W,H);
    g.fillStyle='#e60012';g.font='900 58px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';g.fillText('唐',pad,92);
    g.fillStyle='#101828';g.fillText('人日报',pad+66,92);
    g.font='900 62px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';g.fillText('ICE执法追踪',pad,190);
    g.fillStyle='#667085';g.font='28px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText(new Date().toLocaleString('zh-CN',{timeZone:'America/New_York'}),pad,240);
    g.fillStyle='#f8fafc';g.fillRect(pad,285,W-pad*2,170);
    g.fillStyle='#344054';g.font='700 28px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText('近24小时涉及人数',pad+30,335);g.fillText('近24小时涉及地点',W/2+20,335);
    g.fillStyle='#101828';g.font='900 50px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText($('#today-count')?.textContent||'--',pad+30,405);g.fillText($('#today-places')?.textContent||'--',W/2+20,405);
    g.fillStyle='#eef6ff';g.fillRect(pad,495,W-pad*2,250);
    g.fillStyle='#175cd3';g.font='800 34px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText('美国实时执法地图',pad+30,550);
    g.fillStyle='#475467';g.font='28px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText('实时地图请扫码进入页面查看',pad+30,620);
    g.strokeStyle='#98a2b3';g.lineWidth=4;g.strokeRect(pad+30,650,W-pad*2-60,55);
    g.fillStyle='#101828';g.font='900 36px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText('最新动态',pad,815);
    let y=875;g.font='28px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    if(news.length){news.forEach((t,i)=>{g.fillStyle='#0874e8';g.fillText(String(i+1).padStart(2,'0'),pad,y);g.fillStyle='#344054';wrap(g,t,pad+55,y,W-pad*2-55,34,2);y+=row})}else{g.fillStyle='#667085';g.fillText('暂无最新动态',pad,y)}
    g.fillStyle='#101828';g.font='800 30px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText('扫码查看实时动态',pad,H-140);
    const qr=await makeQrCanvas();g.drawImage(qr,W-pad-190,H-250,190,190);
    g.fillStyle='#667085';g.font='22px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';g.fillText(pageUrl().replace(/^https?:\/\//,''),pad,H-78);
    return c;
  }

  let lastBlob=null,lastUrl='';
  $('#share-poster').onclick=async()=>{const btn=$('#share-poster');btn.disabled=true;try{const c=await poster();lastBlob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('无法生成图片')),'image/png',0.92));if(lastUrl)URL.revokeObjectURL(lastUrl);lastUrl=URL.createObjectURL(lastBlob);$('#poster-image').src=lastUrl;$('#poster-save').href=lastUrl;$('#poster-modal').classList.add('show');close();toast('长图已生成')}catch(e){console.error('ICE poster error:',e);toast('长图生成失败，请刷新后重试')}finally{btn.disabled=false}};
  $('#poster-close').onclick=()=>$('#poster-modal').classList.remove('show');
  $('#poster-system-share').onclick=async()=>{if(!lastBlob){toast('请先生成长图');return}const file=new File([lastBlob],'ICE执法追踪.png',{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'ICE执法追踪 - 唐人日报',text:'扫码查看实时动态'})}else{toast('请长按图片保存后发送给微信好友')}}catch(e){if(e.name!=='AbortError')toast('请长按图片保存后发送给微信好友')}};
})();
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const menu=$('.ice-menu');if(!menu)return;
  const pageUrl=()=>location.href.split('#')[0];
  const toast=t=>{const el=$('#share-toast');if(!el)return;el.textContent=t;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600)};

  document.body.insertAdjacentHTML('beforeend',`<button id="share-backdrop" class="share-backdrop" aria-label="关闭分享菜单"></button><section id="share-sheet" class="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title"><div class="share-sheet-head"><h2 id="share-title">分享 ICE 执法追踪</h2><button id="share-close" class="share-sheet-close" aria-label="关闭">×</button></div><div class="share-actions"><button id="share-page" class="share-action primary">转发当前页面<small>发送给朋友或分享到其他应用</small></button><button id="share-poster" class="share-action">生成长图并分享<small>自动生成热力图、数据和二维码</small></button><button id="share-copy" class="share-action">复制链接<small>复制当前页面地址</small></button></div></section><div id="poster-modal" class="poster-modal" role="dialog" aria-modal="true"><div class="poster-card"><img id="poster-image" alt="ICE执法追踪分享长图"><div class="poster-buttons"><a id="poster-save" download="ICE执法追踪.jpg">保存长图</a><button id="poster-system-share" class="poster-share">系统分享</button><button id="poster-close">关闭</button></div><p class="poster-tip">微信内请长按图片保存，再发送给好友或朋友圈</p></div></div><div id="share-toast" class="share-toast" role="status" aria-live="polite"></div>`);

  const open=()=>{document.documentElement.classList.add('share-sheet-open');document.body.classList.add('share-sheet-open');menu.setAttribute('aria-expanded','true')};
  const close=()=>{document.documentElement.classList.remove('share-sheet-open');document.body.classList.remove('share-sheet-open');menu.setAttribute('aria-expanded','false')};
  menu.addEventListener('click',open);$('#share-close').onclick=close;$('#share-backdrop').onclick=close;
  addEventListener('keydown',e=>{if(e.key==='Escape'){close();$('#poster-modal').classList.remove('show')}});

  const copy=async()=>{try{await navigator.clipboard.writeText(pageUrl())}catch{const x=document.createElement('textarea');x.value=pageUrl();x.style.cssText='position:fixed;opacity:0';document.body.append(x);x.select();document.execCommand('copy');x.remove()}toast('链接已复制，可粘贴发送给朋友')};
  $('#share-copy').onclick=copy;
  $('#share-page').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'ICE执法追踪 - 唐人日报',text:'唐人日报 ICE执法追踪',url:pageUrl()});close()}else await copy()}catch(e){if(e.name!=='AbortError')await copy()}};

  const font='-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  const roundRect=(g,x,y,w,h,r,fill,stroke)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w,h,r):(g.rect(x,y,w,h));if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.stroke()}};
  const wrap=(g,text,x,y,max,line=42,maxLines=2)=>{let cur='',lines=[];for(const ch of text){if(g.measureText(cur+ch).width>max&&cur){lines.push(cur);cur=ch}else cur+=ch}if(cur)lines.push(cur);lines.slice(0,maxLines).forEach((l,i)=>g.fillText(l,x,y+i*line));return Math.min(lines.length,maxLines)*line};
  const loadImage=src=>new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=src});

  async function makeQrCanvas(){
    const qr=document.createElement('canvas');
    if(window.QRCode?.toCanvas){await window.QRCode.toCanvas(qr,pageUrl(),{width:190,margin:1,errorCorrectionLevel:'M'});return qr}
    const response=await fetch('https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=6&data='+encodeURIComponent(pageUrl()),{cache:'no-store'});
    if(!response.ok)throw new Error('二维码服务不可用');
    const u=URL.createObjectURL(await response.blob());try{const img=await loadImage(u);qr.width=190;qr.height=190;qr.getContext('2d').drawImage(img,0,0,190,190);return qr}finally{URL.revokeObjectURL(u)}
  }

  async function drawMapSnapshot(g,x,y,w,h){
    roundRect(g,x,y,w,h,22,'#dff1fb','#cbd5e1');
    const map=$('#ice-map');
    if(!map){g.fillStyle='#64748b';g.font=`700 28px ${font}`;g.fillText('实时执法热力图',x+30,y+55);return}
    const mr=map.getBoundingClientRect();
    let tilesDrawn=0;
    const tiles=$$('.leaflet-tile-loaded',map).slice(0,16);
    for(const tile of tiles){
      try{const tr=tile.getBoundingClientRect();const img=await loadImage(tile.currentSrc||tile.src);g.drawImage(img,x+(tr.left-mr.left)/mr.width*w,y+(tr.top-mr.top)/mr.height*h,tr.width/mr.width*w,tr.height/mr.height*h);tilesDrawn++}catch{}
    }
    if(!tilesDrawn){
      const grad=g.createLinearGradient(x,y,x+w,y+h);grad.addColorStop(0,'#d8eef8');grad.addColorStop(1,'#eef7fb');g.fillStyle=grad;g.fillRect(x,y,w,h);
      g.strokeStyle='rgba(71,84,103,.12)';g.lineWidth=2;for(let i=1;i<6;i++){g.beginPath();g.moveTo(x+w*i/6,y);g.lineTo(x+w*i/6,y+h);g.stroke()}for(let i=1;i<4;i++){g.beginPath();g.moveTo(x,y+h*i/4);g.lineTo(x+w,y+h*i/4);g.stroke()}
      g.fillStyle='rgba(52,64,84,.45)';g.font=`700 26px ${font}`;g.fillText('美国执法动态分布',x+30,y+55);
    }
    const markers=$$('.leaflet-interactive',map).filter(el=>{const r=el.getBoundingClientRect();return r.width>5&&r.height>5});
    markers.forEach((el,i)=>{
      const r=el.getBoundingClientRect();const cx=x+(r.left+r.width/2-mr.left)/mr.width*w;const cy=y+(r.top+r.height/2-mr.top)/mr.height*h;
      const fill=getComputedStyle(el).fill||el.getAttribute('fill')||'#d92d20';
      const radius=Math.max(22,Math.min(52,r.width/mr.width*w*1.3));
      const halo=g.createRadialGradient(cx,cy,2,cx,cy,radius*1.8);halo.addColorStop(0,fill);halo.addColorStop(.35,fill);halo.addColorStop(1,'rgba(255,255,255,0)');g.globalAlpha=.34;g.fillStyle=halo;g.beginPath();g.arc(cx,cy,radius*1.8,0,Math.PI*2);g.fill();g.globalAlpha=1;g.fillStyle=fill;g.strokeStyle='rgba(15,23,42,.75)';g.lineWidth=4;g.beginPath();g.arc(cx,cy,Math.max(10,radius*.42),0,Math.PI*2);g.fill();g.stroke();
    });
    g.fillStyle='rgba(255,255,255,.92)';roundRect(g,x+20,y+18,w-40,64,14,'rgba(255,255,255,.92)','#cbd5e1');
    g.fillStyle='#101828';g.font=`700 24px ${font}`;g.fillText(`实时热力图 · ${$('#today-places')?.textContent||'--'} · ${$('#today-count')?.textContent||'--'}`,x+42,y+58);
    const ly=y+h-58;roundRect(g,x+20,ly,w-40,40,12,'rgba(255,255,255,.92)','#d0d5dd');
    const legends=[['#d92d20','抓捕/拘留'],['#175cd3','遣返'],['#7f56d9','其他行动']];let lx=x+55;
    g.font=`700 20px ${font}`;legends.forEach(([c,t])=>{g.fillStyle=c;g.beginPath();g.arc(lx,ly+20,9,0,Math.PI*2);g.fill();g.fillStyle='#475467';g.fillText(t,lx+18,ly+27);lx+=180});
  }

  async function poster(){
    toast('正在生成长图…');await new Promise(r=>setTimeout(r,80));
    const news=$$('.ice-news-copy h3').slice(0,8).map(x=>x.textContent.trim()).filter(Boolean);
    const W=1080,pad=60,row=82,H=1390+Math.max(1,news.length)*row;
    const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{alpha:false});
    g.fillStyle='#fff';g.fillRect(0,0,W,H);
    g.fillStyle='#e60012';g.font=`900 58px ${font}`;g.fillText('唐',pad,92);g.fillStyle='#101828';g.fillText('人日报',pad+66,92);
    g.font=`900 62px ${font}`;g.fillText('ICE执法追踪',pad,190);g.fillStyle='#667085';g.font=`28px ${font}`;g.fillText(new Date().toLocaleString('zh-CN',{timeZone:'America/New_York'}),pad,240);
    roundRect(g,pad,285,W-pad*2,170,18,'#f8fafc','#e4e7ec');
    g.fillStyle='#344054';g.font=`700 28px ${font}`;g.fillText('近24小时涉及人数',pad+30,335);g.fillText('近24小时涉及地点',W/2+20,335);
    g.fillStyle='#101828';g.font=`900 50px ${font}`;g.fillText($('#today-count')?.textContent||'--',pad+30,405);g.fillText($('#today-places')?.textContent||'--',W/2+20,405);
    g.fillStyle='#101828';g.font=`900 36px ${font}`;g.fillText('ICE动态热力图',pad,515);
    await drawMapSnapshot(g,pad,545,W-pad*2,430);
    g.fillStyle='#101828';g.font=`900 36px ${font}`;g.fillText('最新动态',pad,1040);
    let y=1100;g.font=`28px ${font}`;
    if(news.length){news.forEach((t,i)=>{g.fillStyle='#0874e8';g.fillText(String(i+1).padStart(2,'0'),pad,y);g.fillStyle='#344054';wrap(g,t,pad+55,y,W-pad*2-55,34,2);y+=row})}else{g.fillStyle='#667085';g.fillText('暂无最新动态',pad,y)}
    g.fillStyle='#101828';g.font=`800 30px ${font}`;g.fillText('扫码查看实时动态',pad,H-140);
    const qr=await makeQrCanvas();g.drawImage(qr,W-pad-190,H-250,190,190);
    g.fillStyle='#667085';g.font=`22px ${font}`;g.fillText(pageUrl().replace(/^https?:\/\//,''),pad,H-78);
    return c;
  }

  let lastBlob=null,lastUrl='';
  $('#share-poster').onclick=async()=>{const btn=$('#share-poster');btn.disabled=true;try{const c=await poster();lastBlob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('无法生成图片')),'image/jpeg',0.95));if(lastUrl)URL.revokeObjectURL(lastUrl);lastUrl=URL.createObjectURL(lastBlob);$('#poster-image').src=lastUrl;$('#poster-save').href=lastUrl;$('#poster-save').download='ICE执法追踪.jpg';$('#poster-modal').classList.add('show');close();toast('长图已生成')}catch(e){console.error('ICE poster error:',e);toast('长图生成失败，请刷新后重试')}finally{btn.disabled=false}};
  $('#poster-close').onclick=()=>$('#poster-modal').classList.remove('show');
  $('#poster-system-share').onclick=async()=>{if(!lastBlob){toast('请先生成长图');return}const file=new File([lastBlob],'ICE执法追踪.jpg',{type:'image/jpeg',lastModified:Date.now()});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'ICE执法追踪',text:'唐人日报 ICE执法追踪热力图'})}else toast('请长按图片保存后发送给微信好友')}catch(e){if(e.name!=='AbortError')toast('请长按图片保存后发送给微信好友')}};
})();
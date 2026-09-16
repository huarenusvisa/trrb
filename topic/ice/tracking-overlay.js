(function(){
  'use strict';
  const strip=document.querySelector('.ice-tracking-summary');if(!strip)return;
  const entry=strip.querySelector('a'),dialog=document.getElementById('ice-tracking-dialog'),floating=document.querySelector('.ice-tracking-float');
  let opener=null,scroll=0,previousOverflow='',loading=false,hasData=false;
  function open(event){
    if(!dialog.showModal)return;
    event.preventDefault();opener=event.currentTarget;scroll=window.scrollY;previousOverflow=document.documentElement.style.overflow;
    if(!dialog.querySelector('iframe')){const frame=document.createElement('iframe');frame.title='ICE执法地图与报道';frame.src='/ice?embed=1';dialog.append(frame);}
    dialog.showModal();document.documentElement.style.overflow='hidden';dialog.querySelector('button').focus();
  }
  entry.addEventListener('click',open);floating.addEventListener('click',open);
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.documentElement.style.overflow=previousOverflow;window.scrollTo(0,scroll);opener?.focus({preventScroll:true});});
  window.addEventListener('message',event=>{if(event.origin===location.origin && event.source===dialog.querySelector('iframe')?.contentWindow && event.data==='ice-tracking-close' && dialog.open)dialog.close();});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{floating.hidden=entries[0].isIntersecting||entries[0].boundingClientRect.top>0;}).observe(strip);
  async function refresh(){
    if(loading||document.hidden)return;loading=true;
    const note=strip.querySelector('[data-ice-update]');
    try{
      const stats=window.TRRBIceData.summarize(await window.TRRBIceData.fetchRecent(24));
      strip.querySelector('[data-ice-reports]').textContent=String(stats.reports);
      strip.querySelector('[data-ice-people]').textContent=(stats.estimated?'约':'')+stats.people.toLocaleString('zh-CN');
      note.textContent=`${stats.places}处已知地点 · ${stats.unknown}篇未披露人数 · ${stats.excluded}篇累计/日均统计未计入人数 · ${new Date().toLocaleTimeString('zh-CN',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'})}纽约时间更新`;
      hasData=true;
    }catch{note.textContent=hasData?'暂时无法刷新，显示上次取得的数据':'暂时无法读取统计，仍可打开地图查看报道';}
    finally{loading=false;}
  }
  refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
})();

(()=>{
  "use strict";
  const PAGE_SIZE=12;
  const el=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const normalize=value=>String(value||"").toLowerCase().replace(/[.,，。;；:：()（）]/g," ").replace(/\s+/g," ").trim();
  const inferType=item=>{
    if(item?.type)return item.type;
    const text=normalize(`${item?.event_type||""} ${item?.title||""} ${item?.summary||""}`);
    if(/removal|removed|deport|repatriat|遣返|递解|驱逐/.test(text))return "removal";
    if(Number(item?.people||0)>0)return "arrest";
    return "other";
  };
  const itemKey=item=>`${item?.id||""}|${item?.title||""}|${item?.time||""}`;
  const displayedKeys=()=>new Set([...document.querySelectorAll("#ice-news-list .ice-news-item")].map(node=>node.dataset.iceKey).filter(Boolean));
  const currentType=()=>document.querySelector('.type-tabs button.active')?.dataset.type||"all";
  const formatTime=item=>{
    const date=new Date(item?.time||0);
    if(Number.isNaN(date.getTime()))return "时间待确认";
    return new Intl.DateTimeFormat("zh-CN",{timeZone:"America/New_York",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date);
  };
  const renderItem=item=>{
    const key=itemKey(item);
    const image=item.image?`<a href="${escapeHtml(item.article_url)}"><img class="ice-news-thumb" src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`:"";
    const count=Number(item.people||0)>0?`<span>涉及${item.estimated?"约":""}${Number(item.people)}人</span>`:"";
    return `<article class="ice-news-item ${item.image?"":"no-image"}" data-ice-key="${escapeHtml(key)}">${image}<div class="ice-news-copy"><h3><a href="${escapeHtml(item.article_url||"#")}">${escapeHtml(item.title||"ICE执法动态")}</a></h3><p>${escapeHtml(item.summary||"")}</p><div class="ice-news-source">${escapeHtml(formatTime(item))} · 来源：${escapeHtml(item.source||"唐人日报编辑部")} ${count}</div></div></article>`;
  };
  const stampExisting=()=>{
    const data=Array.isArray(window.TRRB_ICE_DATA)?window.TRRB_ICE_DATA:[];
    const nodes=[...document.querySelectorAll("#ice-news-list .ice-news-item")];
    nodes.forEach(node=>{
      if(node.dataset.iceKey)return;
      const title=node.querySelector("h3")?.textContent?.trim()||"";
      const match=data.find(item=>(item.title||"").trim()===title);
      if(match)node.dataset.iceKey=itemKey(match);
    });
  };
  const remaining=()=>{
    stampExisting();
    const shown=displayedKeys();
    const type=currentType();
    return (Array.isArray(window.TRRB_ICE_DATA)?window.TRRB_ICE_DATA:[])
      .filter(item=>type==="all"||inferType(item)===type)
      .filter(item=>!shown.has(itemKey(item)))
      .sort((a,b)=>new Date(b.time||0)-new Date(a.time||0));
  };
  const syncButton=()=>{
    const button=el("load-more");
    if(!button)return;
    const left=remaining().length;
    button.hidden=left===0;
    button.style.display=left===0?"none":"block";
    button.disabled=false;
    button.textContent=left>0?`加载更多（剩余${left}条）⌄`:"已显示全部";
  };
  const loadMore=event=>{
    const button=event.target.closest?.("#load-more");
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const box=el("ice-news-list");
    if(!box)return;
    const batch=remaining().slice(0,PAGE_SIZE);
    if(!batch.length){syncButton();return;}
    button.disabled=true;
    box.insertAdjacentHTML("beforeend",batch.map(renderItem).join(""));
    syncButton();
  };
  document.addEventListener("click",loadMore,true);
  document.addEventListener("DOMContentLoaded",()=>{
    const list=el("ice-news-list");
    if(list)new MutationObserver(()=>setTimeout(syncButton,0)).observe(list,{childList:true,subtree:false});
    document.querySelectorAll('.range-tabs button,.type-tabs button').forEach(button=>button.addEventListener("click",()=>setTimeout(syncButton,80)));
    const timer=setInterval(()=>{if(Array.isArray(window.TRRB_ICE_DATA)){syncButton();clearInterval(timer)}},250);
    setTimeout(syncButton,1500);
  });
})();


const DATA_URL="/data/ice.json";
const $=(s,e=document)=>e.querySelector(s);
const $$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function clock(){const n=new Date();$("#clock").textContent=n.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});$("#date").textContent=n.toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"})}
function ago(v){const d=new Date(v),m=Math.max(0,Math.floor((Date.now()-d)/60000));if(m<1)return"刚刚";if(m<60)return m+"分钟前";if(m<1440)return Math.floor(m/60)+"小时前";return d.toLocaleDateString("zh-CN")}
async function init(){
 clock();setInterval(clock,30000);
 const data=await fetch(DATA_URL,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()});
 $("#confirmed").textContent=(data.stats?.confirmed||0)+"人";$("#locations").textContent=(data.stats?.locations||0)+"处";
 $("#dots").innerHTML=(data.mapPoints||[]).map(p=>`<span class="map-dot${p.small?" small":""}" style="left:${p.x}%;top:${p.y}%">${p.small?"":esc(p.count)}</span>`).join("");
 const render=f=>{$("#news").innerHTML=(data.news||[]).filter(n=>f==="all"||n.type===f).map(n=>`<article><div class="ice-time">${ago(n.published_at)}<i></i></div><img class="ice-thumb" src="${esc(n.image||"/assets/placeholder.svg")}" alt=""><div class="ice-copy"><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p></div><a class="ice-source" href="${esc(n.source_url||"#")}" target="_blank" rel="noopener">来源：${esc(n.source||"公开信息")} ↗</a></article>`).join("")||"<p>暂无数据</p>"};
 $$(".ice-filters button").forEach(b=>b.onclick=()=>{$$(".ice-filters button").forEach(x=>x.classList.remove("active"));b.classList.add("active");render(b.dataset.filter)});
 render("all");
}
init().catch(e=>{$("#news").innerHTML="<p>数据加载失败，请检查 /data/ice.json</p>"});

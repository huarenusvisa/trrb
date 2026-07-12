
const CONFIG = {
  iceApi: window.TRRB_ICE_API || "/data/ice.json",
  electionApi: window.TRRB_ELECTION_API || "/data/election.json"
};

function qs(s, el=document){ return el.querySelector(s); }
function qsa(s, el=document){ return [...el.querySelectorAll(s)]; }
function esc(v=""){
  return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function fmtTime(iso){
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return iso || "";
  const diff = Math.max(0, Math.floor((Date.now()-d.getTime())/60000));
  if(diff < 1) return "刚刚";
  if(diff < 60) return `${diff}分钟前`;
  if(diff < 1440) return `${Math.floor(diff/60)}小时前`;
  return d.toLocaleDateString("zh-CN");
}
function updateClock(){
  const now = new Date();
  const t = qs("[data-clock]");
  const d = qs("[data-date]");
  if(t) t.textContent = now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  if(d) d.textContent = now.toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"});
}
async function loadJSON(url){
  const res = await fetch(url,{cache:"no-store"});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
function bindTabs(){
  qsa(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    qsa(".tab").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
  }));
}
function bindFilters(render){
  qsa(".filter").forEach(btn=>btn.addEventListener("click",()=>{
    qsa(".filter").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    render(btn.dataset.filter || "all");
  }));
}
async function initIce(){
  updateClock(); setInterval(updateClock,30000); bindTabs();
  try{
    const data = await loadJSON(CONFIG.iceApi);
    qs("[data-confirmed]").textContent = `${data.stats.confirmed || 0}人`;
    qs("[data-locations]").textContent = `${data.stats.locations || 0}处`;
    const labels = qs("#mapLabels");
    labels.innerHTML = (data.mapPoints||[]).map(p =>
      `<span class="map-label${p.small?' sm':''}" style="left:${p.x}%;top:${p.y}%">${p.small?'':esc(p.count)}</span>`
    ).join("");
    const render = filter => {
      const list = (data.news||[]).filter(n => filter==="all" || n.type===filter);
      qs("#newsList").innerHTML = list.length ? list.map(n=>`
        <article class="news-item">
          <div class="news-time">${fmtTime(n.published_at)} <span class="live"></span></div>
          <img class="news-thumb" src="${esc(n.image || '/assets/placeholder.svg')}" alt="" loading="lazy">
          <div class="news-main">
            <h3>${esc(n.title)}</h3>
            <p>${esc(n.summary||"")}</p>
          </div>
          <a class="source" href="${esc(n.source_url||'#')}" target="_blank" rel="noopener">来源：${esc(n.source||"公开信息")} ↗</a>
        </article>`).join("") : `<div class="empty">暂无数据</div>`;
    };
    bindFilters(render); render("all");
  }catch(e){
    qs("#newsList").innerHTML = `<div class="empty">数据加载失败：${esc(e.message)}</div>`;
  }
}
async function initElection(){
  updateClock(); setInterval(updateClock,30000);
  try{
    const data = await loadJSON(CONFIG.electionApi);
    qs("[data-senate]").textContent = data.stats?.senate ?? "-";
    qs("[data-house]").textContent = data.stats?.house ?? "-";
    qs("[data-governor]").textContent = data.stats?.governor ?? "-";
    qs("#raceCards").innerHTML = (data.races||[]).map(r=>`
      <div class="race-card">
        <h3>${esc(r.title)}</h3>
        <div class="progress"><span style="width:${Math.max(0,Math.min(100,r.progress||0))}%"></span></div>
        <div class="race-meta"><span>${esc(r.left_label||"")}</span><span>${esc(r.right_label||"")}</span></div>
      </div>`).join("");
    qs("#stateList").innerHTML = (data.keyStates||[]).map(s=>`
      <div class="state-row">
        <div><strong>${esc(s.state)}</strong><div class="stat-sub">${esc(s.note||"")}</div></div>
        <span class="badge ${esc(s.status_class||'tossup')}">${esc(s.status)}</span>
      </div>`).join("");
    qs("#electionNews").innerHTML = (data.news||[]).map(n=>`
      <article class="news-item">
        <div class="news-time">${fmtTime(n.published_at)} <span class="live"></span></div>
        <img class="news-thumb" src="${esc(n.image || '/assets/placeholder.svg')}" alt="" loading="lazy">
        <div class="news-main"><h3>${esc(n.title)}</h3><p>${esc(n.summary||"")}</p></div>
        <a class="source" href="${esc(n.source_url||'#')}" target="_blank" rel="noopener">来源：${esc(n.source||"公开信息")} ↗</a>
      </article>`).join("");
  }catch(e){
    qs("#electionNews").innerHTML = `<div class="empty">数据加载失败：${esc(e.message)}</div>`;
  }
}

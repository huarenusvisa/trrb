(() => {
  const PAGE_SIZE = 5;
  let shown = PAGE_SIZE;
  let activeType = "all";
  let activeRange = "24h";

  const fallback = [
    {title:"纽约皇后区突袭行动，ICE逮捕23人",excerpt:"执法人员在皇后区多个地点执行搜查行动，重点针对有犯罪记录的非法移民。",image:"",source:"NY Post",url:"#",type:"arrest",lat:40.7282,lng:-73.7949},
    {title:"ICE在芝加哥展开执法行动，逮捕多人",excerpt:"执法行动集中在南区和西区，更多细节暂未公布。",image:"",source:"ABC 7",url:"#",type:"arrest",lat:41.8781,lng:-87.6298},
    {title:"ICE与当地警方在洛杉矶联合行动",excerpt:"行动主要针对非法居留和与犯罪相关的个人。",image:"",source:"CBS LA",url:"#",type:"other",lat:34.0522,lng:-118.2437},
    {title:"迈阿密ICE逮捕行动持续，重点打击非法就业",excerpt:"当局在多个商业区进行检查，逮捕数人并发出传票。",image:"",source:"Miami Herald",url:"#",type:"arrest",lat:25.7617,lng:-80.1918},
    {title:"ICE在休斯顿地区逮捕10人",excerpt:"被捕人员涉及非法居留及其他移民相关违规行为。",image:"",source:"Chron",url:"#",type:"arrest",lat:29.7604,lng:-95.3698}
  ];

  function sourceData() {
    const raw = Array.isArray(window.TRRB_ARTICLE_INDEX) ? window.TRRB_ARTICLE_INDEX : [];
    const mapped = raw.filter(item => {
      const text = `${item.title||""} ${item.excerpt||""} ${item.category||""}`;
      return /\bICE\b|移民与海关执法局|移民执法/i.test(text);
    }).map(item => ({
      title:item.title||"ICE执法动态",
      excerpt:item.excerpt||"",
      image:normalizeImage(item.image),
      source:item.source||item.author||"唐人日报",
      url:item.url||item.href||`../../article.html?id=${encodeURIComponent(item.id||"")}`,
      type:inferType(item),
      lat:null,lng:null
    }));
    return mapped.length ? mapped : fallback;
  }

  function normalizeImage(value) {
    const image = String(value||"").trim();
    if (!image || image === "null" || /placeholder/i.test(image)) return "";
    if (image.startsWith("./")) return "../../" + image.slice(2);
    if (image.startsWith("/")) return "../.." + image;
    return image;
  }

  function inferType(item) {
    const text = `${item.title||""} ${item.excerpt||""}`;
    if (/遣返|驱逐|deport|removal/i.test(text)) return "removal";
    if (/逮捕|拘留|抓捕|arrest|detain/i.test(text)) return "arrest";
    return "other";
  }

  function filtered() {
    const data = sourceData();
    if (activeType === "all") return data;
    return data.filter(item => item.type === activeType);
  }

  function escapeHtml(value) {
    return String(value||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }

  function renderNews() {
    const list = document.getElementById("ice-news-list");
    const data = filtered();
    const items = data.slice(0, shown);
    list.innerHTML = items.map(item => {
      const image = item.image ? `<img class="ice-news-thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy">` : "";
      return `<article class="ice-news-item ${item.image ? "" : "no-image"}">
        ${image}
        <div class="ice-news-copy">
          <h3><a href="${escapeHtml(item.url)}">${escapeHtml(shortTitle(item.title))}</a></h3>
          <p>${escapeHtml(item.excerpt)}</p>
        </div>
        <div class="ice-news-source">来源：<a href="${escapeHtml(item.url)}">${escapeHtml(item.source)}</a></div>
      </article>`;
    }).join("") || `<p style="padding:24px 0;color:#667085">暂无相关动态</p>`;
    document.getElementById("load-more").hidden = shown >= data.length;
  }

  function shortTitle(title) {
    const text = String(title||"ICE执法动态").trim();
    return text.length > 18 ? text.slice(0,18) : text;
  }

  function updateClock() {
    const now = new Date();
    const time = new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",minute:"2-digit",hour12:true}).format(now);
    const date = new Intl.DateTimeFormat("zh-CN",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).format(now);
    document.getElementById("ny-time").textContent = time;
    document.getElementById("ny-date").textContent = date;
  }

  function initMap() {
    if (!window.L) return;
    const map = L.map("ice-map",{zoomControl:true,scrollWheelZoom:false}).setView([38.2,-96.3],4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
    fallback.forEach(item => {
      if (item.lat && item.lng) L.circleMarker([item.lat,item.lng],{radius:7,weight:2,color:"#fff",fillColor:"#087bf0",fillOpacity:.95})
        .addTo(map).bindPopup(`<b>${escapeHtml(item.title)}</b>`);
    });
  }

  function bindTabs() {
    document.querySelectorAll(".type-tabs button").forEach(btn => btn.addEventListener("click",() => {
      document.querySelectorAll(".type-tabs button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      activeType = btn.dataset.type;
      shown = PAGE_SIZE;
      renderNews();
    }));
    document.querySelectorAll(".range-tabs button").forEach(btn => btn.addEventListener("click",() => {
      document.querySelectorAll(".range-tabs button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      activeRange = btn.dataset.range;
    }));
    document.getElementById("load-more").addEventListener("click",() => {
      shown += PAGE_SIZE;
      renderNews();
    });
  }

  document.addEventListener("DOMContentLoaded",() => {
    updateClock();
    setInterval(updateClock,30000);
    initMap();
    bindTabs();
    renderNews();
    const data = sourceData();
    document.getElementById("today-count").textContent = `${data.length}人`;
    document.getElementById("today-places").textContent = `${Math.min(data.length, new Set(data.map(x=>x.source)).size)}处`;
  });
})();

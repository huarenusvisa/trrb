(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let page=1;
  async function load() {
    const output=document.getElementById('seo-inventory-output');
    try {
      output.textContent='正在读取总控全量台账…';
      const token=await window.getAdminAccessToken?.();
      if (!token) throw new Error('请先登录后台');
      const response=await fetch('/.netlify/functions/admin-seo-inventory',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({page,q:document.getElementById('seo-inventory-query').value,pilot:document.getElementById('seo-inventory-pilot').checked,issue:document.getElementById('seo-inventory-issue').value})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'读取失败');
      if(!data.summary){output.textContent=data.message;return;}
      const s=data.summary;
      output.innerHTML=`<p>生成时间：${esc(data.created_at)} · 版本：${esc((data.commit_sha||'').slice(0,12))}</p><p>内容总数 ${s.total} · 公开 ${s.public} · 来源缺口 ${s.sourceGaps} · 相同正文待复核 ${s.duplicateCandidates} · 快照缺口 ${s.missingSnapshots}</p><p>Google 数据：${esc(s.googleAvailability)}；没有返回记录表示未知，不代表未收录。相同正文须人工复核，系统不会据此删除或合并。</p><p>当前筛选 ${data.total} 篇，第 ${page} 页</p><div style="overflow:auto"><table><thead><tr><th>文章</th><th>栏目</th><th>待处理</th><th>Google</th></tr></thead><tbody>${data.items.map(x=>`<tr><td>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>`:esc(x.title)}<small style="display:block">${esc(x.id)}</small></td><td>${esc(x.category)}</td><td>${esc(x.issues.map(y=>({'missing-external-source':'补充来源','exact-body-duplicate-review':'相同正文待复核','missing-body':'正文缺失','missing-title':'标题缺失','missing-publication-snapshot':'快照缺失','missing-publication-path':'固定地址缺失'}[y]||y)).join('；'))||'—'}</td><td>${x.google.performance?`已返回：${x.google.performance.clicks} 点击 / ${x.google.performance.impressions} 展示`:'暂无返回数据'}</td></tr>`).join('')}</tbody></table></div>`;
      document.getElementById('seo-inventory-next').disabled=!data.has_more;
      document.getElementById('seo-inventory-prev').disabled=page===1;
    } catch(e){output.textContent=e.message;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const container=document.getElementById('automation-control-page');
    if(!container)return;
    const section=document.createElement('section');section.className='card';
    section.innerHTML='<h2>内容与收录全量台账</h2><p>由现有 SEO 总控更新。先处理证据和重复内容，再比较 ICE 栏目各发布月份的搜索表现。</p><input id="seo-inventory-query" placeholder="标题、网址或文章 ID" aria-label="搜索台账"><label><input id="seo-inventory-pilot" type="checkbox">只看 ICE</label><select id="seo-inventory-issue" aria-label="待处理类型"><option value="">全部</option><option value="missing-external-source">来源缺口</option><option value="exact-body-duplicate-review">相同正文待复核</option><option value="missing-publication-snapshot">快照缺口</option></select><button id="seo-inventory-refresh" type="button">查询 / 刷新台账</button><div id="seo-inventory-output" aria-live="polite">点击查询读取最新全量台账。</div><button id="seo-inventory-prev" type="button" disabled>上一页</button><button id="seo-inventory-next" type="button" disabled>下一页</button>';
    container.append(section);
    document.getElementById('seo-inventory-refresh').onclick=()=>{page=1;load();};
    document.getElementById('seo-inventory-prev').onclick=()=>{page=Math.max(1,page-1);load();};
    document.getElementById('seo-inventory-next').onclick=()=>{page++;load();};
  });
})();

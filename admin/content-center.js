(function () {
  const state = { items: [], trumpItems: [], activeTrump: null, activeChina:null };
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const decisionLabels = {
    processing: "自动加工中", published: "已发布", review_required: "需要重新加工",
    pending_review: "待人工审核", ready_for_review: "待人工审核",
    failed: "加工失败", rejected: "已过滤", duplicate: "重复内容",
    taken_down: "已下架", deleted: "已删除", legacy_archived: "历史归档",
  };
  const titleOf = (item) => item.ai_payload?.title || item.ai_payload?.proposed_title || "标题待生成";
  const timeOf = (item) => new Date(item.collected_at || item.created_at || Date.now()).toLocaleString("zh-CN");

  async function api(body) {
    const token = await window.getAdminAccessToken?.();
    const response = await fetch("/.netlify/functions/china-hot-pool-admin", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  async function chinaEditApi(body) {
    const token=await window.getAdminAccessToken?.();
    const response=await fetch('/.netlify/functions/china-hot-editor',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'编辑失败');return result;
  }
  function ensureChinaEditor() {
    if(el('china-editor-modal'))return;
    const modal=document.createElement('div');modal.id='china-editor-modal';modal.className='hidden';
    modal.innerHTML=`<div class="china-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="china-editor-heading"><h3 id="china-editor-heading">核实与编辑新闻</h3><p>保存草稿不等于批准发布。请核实来源，区分事实、指控和推测。</p><details><summary>原始材料与处理说明</summary><pre id="china-editor-source"></pre><p id="china-editor-reason"></p></details><label>标题<input type="text" id="china-editor-title"></label><label>摘要<textarea id="china-editor-summary" rows="2"></textarea></label><label>正文<textarea id="china-editor-content" rows="15"></textarea></label><label>配图地址（可留空）<input type="text" id="china-editor-cover"></label><label>核实依据链接（每行一个）<textarea id="china-editor-links" rows="3"></textarea></label><label>具体核实说明<textarea id="china-editor-note" rows="3" placeholder="说明哪些来源支持事件、日期及核心主张"></textarea></label><p><label><input type="checkbox" id="china-editor-facts"> 已核实核心事实及来源，明确标注未证实内容</label></p><p><label><input type="checkbox" id="china-editor-fresh"> 已确认事件或实质新进展，并非旧闻重新传播</label></p><p id="china-editor-message" role="status"></p><div class="china-hot-pool-actions"><button id="china-editor-save">保存草稿</button><button id="china-editor-publish">核实后发布</button><button id="china-editor-close">关闭</button></div></div>`;
    document.body.appendChild(modal);
    el('china-editor-close').onclick=()=>{modal.classList.add('hidden');state.activeChina=null;};
    for(const action of ['save','publish'])el('china-editor-'+action).onclick=()=>saveChinaEditor(action);
  }
  async function openChinaEditor(id) {
    ensureChinaEditor();const data=await chinaEditApi({action:'detail',id});state.activeChina=data;
    const c=data.candidate,a=data.article||{},p=c.ai_payload||{},m=a.metadata||{};
    el('china-editor-title').value=a.title||p.title||p.proposed_title||'';
    el('china-editor-summary').value=/自动加工未完成/.test(a.summary||'')?'':a.summary||p.summary||'';
    el('china-editor-content').value=/自动加工未完成|未经编辑不得发布|【编辑提示】/.test(a.content||'')?'':a.content||p.last_generated_draft?.content||'';
    el('china-editor-cover').value=a.cover_image||'';
    el('china-editor-source').textContent=c.raw_text||m.source_text_original||'原始材料已清理，请重新核实来源';
    el('china-editor-reason').textContent=c.decision_reason||'';
    el('china-editor-links').value=(m.manual_evidence_urls||p.context_research?.sources?.map(x=>x.url)||[]).join('\n');
    el('china-editor-note').value=m.manual_verification_note||'';
    el('china-editor-facts').checked=false;el('china-editor-fresh').checked=false;
    el('china-editor-message').textContent='';el('china-editor-modal').classList.remove('hidden');
  }
  async function saveChinaEditor(action) {
    const current=state.activeChina;if(!current)return;
    const buttons=['save','publish'].map(x=>el('china-editor-'+x));buttons.forEach(x=>x.disabled=true);
    el('china-editor-message').textContent=action==='publish'?'正在查重并发布…':'正在保存…';
    try {
      await chinaEditApi({action,id:current.candidate.id,updated_at:current.candidate.updated_at,title:el('china-editor-title').value,summary:el('china-editor-summary').value,content:el('china-editor-content').value,cover_image:el('china-editor-cover').value,evidence_urls:el('china-editor-links').value,verification_note:el('china-editor-note').value,facts_confirmed:el('china-editor-facts').checked,freshness_confirmed:el('china-editor-fresh').checked});
      if(action==='publish'){el('china-editor-modal').classList.add('hidden');state.activeChina=null;await load();}
      else {state.activeChina=await chinaEditApi({action:'detail',id:current.candidate.id});el('china-editor-message').textContent='草稿已保存，可继续核实和编辑。';await load();}
    }catch(error){el('china-editor-message').textContent=error.message;}
    finally{buttons.forEach(x=>x.disabled=false);}
  }

  async function trumpApi(body) {
    const token = await window.getAdminAccessToken?.();
    const response = await fetch("/.netlify/functions/trump-x-pool-admin", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function render() {
    el("china-hot-pool-count").textContent = String(state.items.length);
    el("china-hot-pool-list").innerHTML = state.items.length ? state.items.map((item) => {
      const published = item.decision === "published";
      const takenDown = item.decision === "taken_down";
      const reason = item.decision_reason || item.ai_payload?.reason || "等待处理";
      const summary = item.ai_payload?.summary || item.raw_text || "没有可显示的原始材料";
      const source = item.source_url ? `<a class="source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">查看原始来源</a>` : "";
      const articleAction = published
        ? `<a href="/article.html?id=${encodeURIComponent(item.article_id)}" target="_blank" rel="noopener">查看文章</a>`
        : `<button data-pool-edit="${esc(item.id)}">编辑、核实与发布</button>`;
      return `<article class="china-hot-pool-item"><div><span class="tag">${esc(item.ai_payload?.manual_review_required ? "待核实·可编辑" : decisionLabels[item.decision] || item.decision || "未处理")}</span><span class="tag">${esc(item.proposed_section || "待分流")}</span><time>${esc(timeOf(item))}</time><h4>${esc(titleOf(item))}</h4><p>${esc(String(summary).slice(0, 240))}</p><p class="pool-reason"><b>处理说明：</b>${esc(reason)}</p>${source}</div><div class="china-hot-pool-actions">${articleAction}<button data-pool-download="${esc(item.id)}">下载</button>${published ? `<button data-pool-action="take_down" data-pool-id="${esc(item.id)}">下架</button>` : ""}${takenDown ? `<button data-pool-action="restore" data-pool-id="${esc(item.id)}">恢复</button>` : ""}<button class="danger" data-pool-action="delete" data-pool-id="${esc(item.id)}">删除文章</button></div></article>`;
    }).join("") : "<div class=\"panel\">内容池暂时为空。</div>";
  }

  async function load() {
    el("china-hot-pool-message").textContent = "正在读取内容池…";
    try {
      const data = await api({ action: "list" });
      const terminal = new Set(["published", "rejected", "deleted", "duplicate", "legacy_archived"]);
      state.items = (data.items || []).filter((item) => !terminal.has(item.decision));
      render();
      el("china-hot-pool-message").textContent = `待处理 ${state.items.length} 条；重复稿、已发布稿和其他已完成记录不会出现在后台。`;
    }
    catch (error) { el("china-hot-pool-message").textContent = `读取失败：${error.message}`; }
  }

  function renderTrump() {
    el("trump-x-pool-count").textContent = String(state.trumpItems.length);
    el("trump-x-pool-list").innerHTML = state.trumpItems.length ? state.trumpItems.map((item) => {
      const author = item.source_account || item.source_name || "X来源";
      const body = item.ai_payload?.summary || item.ai_payload?.content || (item.decision === "processing" ? "正在自动翻译、读图和查重…" : "中文编辑未完成，禁止直接发布英文原文。");
      const title = item.ai_payload?.title || (item.decision === "processing" ? "正在生成中文标题…" : "中文标题待人工编辑");
      return `<article class="china-hot-pool-item"><div><span class="tag">${esc(item.decision || "待处理")}</span><time>${esc(timeOf(item))}</time><h4>${esc(title)}</h4><p>${esc(String(body).slice(0, 300))}</p><small>${esc(author)}</small></div><div class="china-hot-pool-actions">${item.article_id ? `<a href="/article.html?id=${encodeURIComponent(item.article_id)}" target="_blank" rel="noopener">查看文章</a>` : ""}<button data-trump-edit="${esc(item.id)}">编辑标题和正文</button><a href="${esc(item.source_url || "https://x.com")}" target="_blank" rel="noopener noreferrer">查看原帖</a><button data-trump-download="${esc(item.id)}">下载</button><button class="danger" data-trump-action="delete" data-trump-id="${esc(item.id)}">删除</button></div></article>`;
    }).join("") : "<div class=\"panel\">特朗普X资讯内容池暂时为空。</div>";
  }

  async function loadTrump() {
    el("trump-x-pool-message").textContent = "正在读取内容池…";
    try { const data = await trumpApi({ action: "list" }); state.trumpItems = data.items || []; renderTrump(); el("trump-x-pool-message").textContent = `已读取 ${state.trumpItems.length} 条记录。`; }
    catch (error) { el("trump-x-pool-message").textContent = `读取失败：${error.message}`; }
  }

  function download(item) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `china-hot-${item.id}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  const sourceText = (value) => String(value || "").replace(/https?:\/\/\S+/gi, " ").replace(/(?:^|\s)@[A-Za-z0-9_]+/g, " ").replace(/\s+/g, " ").trim();
  const bodyLength = (value) => Array.from(String(value || "").replace(/\s+/g, "")).length;
  function trumpMedia(item) { return Array.isArray(item?.raw_payload?.media) ? item.raw_payload.media : []; }
  function updateTrumpCount() {
    const count = bodyLength(el("trump-editor-content")?.value);
    el("trump-editor-count").textContent = `${count}字`;
    el("trump-editor-count").style.color = "";
    el("trump-editor-target").textContent = `原帖${sourceText(state.activeTrump?.raw_text).length}字；正文不限字数。`;
  }
  function openTrumpEditor(item) {
    state.activeTrump = item; const payload = item.ai_payload || {}; const media = trumpMedia(item);
    el("trump-editor-heading").textContent = payload.title || "编辑特朗普X资讯";
    el("trump-editor-title").value = payload.title || "";
    el("trump-editor-summary").value = payload.summary || "";
    el("trump-editor-content").value = payload.content || "";
    el("trump-editor-cover").value = media.find((entry) => entry?.type === "photo" && entry?.url)?.url || media.find((entry) => entry?.preview_image_url)?.preview_image_url || "";
    el("trump-editor-raw").textContent = item.raw_text || "没有保存原帖文字。";
    el("trump-editor-media").innerHTML = media.length ? media.map((entry) => { const url = entry?.url || entry?.preview_image_url; return url ? `<img src="${esc(url)}" alt="原帖图片" loading="lazy">` : ""; }).join("") : "<p>原帖没有图片。</p>";
    el("trump-editor-image-reviewed").checked = !media.length || payload.image_grounding_used === true;
    el("trump-editor-image-reviewed").disabled = !media.length;
    el("trump-editor-not-old").checked = payload.manual_old_news_confirmation === true && payload.appears_old_news !== true;
    el("trump-editor-message").textContent = "";
    el("trump-editor-modal").classList.remove("hidden"); document.body.classList.add("modal-open"); updateTrumpCount();
  }
  function closeTrumpEditor() { el("trump-editor-modal")?.classList.add("hidden"); document.body.classList.remove("modal-open"); state.activeTrump = null; }
  async function submitTrumpEditor(action, button) {
    const item = state.activeTrump; if (!item) return;
    button.disabled = true; el("trump-editor-message").textContent = action === "publish" ? "正在查重并发布…" : "正在保存…";
    try {
      const result = await trumpApi({ action, id: item.id, title: el("trump-editor-title").value, summary: el("trump-editor-summary").value, content: el("trump-editor-content").value, cover_image: el("trump-editor-cover").value, image_reviewed: el("trump-editor-image-reviewed").checked, not_old_news_confirmed: el("trump-editor-not-old").checked });
      if (action === "publish" && result.article_id) alert("已发布中文文章，并完成同源去重、近30天查重和旧闻确认。");
      closeTrumpEditor(); await loadTrump();
    } catch (error) { el("trump-editor-message").textContent = error.message; button.disabled = false; }
  }

  document.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-content-center-tab]");
    if (tab) {
      const selected = tab.dataset.contentCenterTab;
      const china = selected === "china";
      const ice = selected === "ice";
      const trump = selected === "trump";
      document.querySelectorAll("[data-content-center-tab]").forEach((button) => button.classList.toggle("active", button === tab));
      el("china-hot-pool-panel").classList.toggle("hidden", !china);
      el("ice-review-page").classList.toggle("hidden", !ice);
      el("trump-x-pool-panel").classList.toggle("hidden", !trump);
      if (china) load(); else if (ice) window.loadReviewQueue?.(); else loadTrump();
    }
    const dl = event.target.closest("[data-pool-download]");
    if (dl) download(state.items.find((item) => String(item.id) === dl.dataset.poolDownload));
    const edit = event.target.closest("[data-pool-edit]");
    if (edit) {edit.disabled=true;try{await openChinaEditor(edit.dataset.poolEdit);}catch(error){alert(error.message);}finally{edit.disabled=false;}}
    const action = event.target.closest("[data-pool-action]");
    if (action) {
      const label = action.dataset.poolAction === "delete" ? "删除关联文章（内容池原始记录仍保留）" : action.textContent.trim();
      if (!confirm(`确定${label}？`)) return;
      action.disabled = true;
      try {
        await api({ action: action.dataset.poolAction, id: action.dataset.poolId });
        await load();
      }
      catch (error) { alert(error.message); action.disabled = false; }
    }
    const trumpDownload = event.target.closest("[data-trump-download]");
    if (trumpDownload) download(state.trumpItems.find((item) => item.id === trumpDownload.dataset.trumpDownload));
    const trumpEdit = event.target.closest("[data-trump-edit]");
    if (trumpEdit) openTrumpEditor(state.trumpItems.find((item) => item.id === trumpEdit.dataset.trumpEdit));
    const trumpEditorClose = event.target.closest("[data-trump-editor-close]");
    if (trumpEditorClose) closeTrumpEditor();
    const trumpEditorAction = event.target.closest("[data-trump-editor-action]");
    if (trumpEditorAction) submitTrumpEditor(trumpEditorAction.dataset.trumpEditorAction, trumpEditorAction);
    const trumpAction = event.target.closest("[data-trump-action]");
    if (trumpAction) {
      if (!confirm("确定从特朗普X资讯内容池删除这条记录？")) return;
      trumpAction.disabled = true;
      try { await trumpApi({ action: trumpAction.dataset.trumpAction, id: trumpAction.dataset.trumpId }); await loadTrump(); }
      catch (error) { alert(error.message); trumpAction.disabled = false; }
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    el("refresh-china-hot-pool")?.addEventListener("click", load);
    el("refresh-trump-x-pool")?.addEventListener("click", loadTrump);
    el("trump-editor-content")?.addEventListener("input", updateTrumpCount);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !el("trump-editor-modal")?.classList.contains("hidden")) closeTrumpEditor(); });
  window.loadUnifiedContentCenter = () => { load(); };
})();

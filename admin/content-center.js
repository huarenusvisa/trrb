(function () {
  const state = { items: [], trumpItems: [], activeTrump: null };
  const el = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const titleOf = (item) => item.ai_payload?.title || item.ai_payload?.proposed_title || item.raw_text || "未命名内容";
  const timeOf = (item) => new Date(item.collected_at || item.created_at || Date.now()).toLocaleString("zh-CN");

  async function api(body) {
    const token = await window.getAdminAccessToken?.();
    const response = await fetch("/.netlify/functions/china-hot-pool-admin", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
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
      return `<article class="china-hot-pool-item"><div><span class="tag">${esc(item.decision || "未处理")}</span><time>${esc(timeOf(item))}</time><h4>${esc(titleOf(item))}</h4><p>${esc(String(item.raw_text || "").slice(0, 220))}</p></div><div class="china-hot-pool-actions">${item.article_id ? `<a href="/article.html?id=${encodeURIComponent(item.article_id)}" target="_blank" rel="noopener">查看文章</a>` : ""}<button data-pool-download="${esc(item.id)}">下载</button>${item.article_id ? `<button data-pool-action="${published ? "take_down" : "restore"}" data-pool-id="${esc(item.id)}">${published ? "下架" : "恢复"}</button>` : ""}<button class="danger" data-pool-action="delete" data-pool-id="${esc(item.id)}">删除文章</button></div></article>`;
    }).join("") : "<div class=\"panel\">内容池暂时为空。</div>";
  }

  async function load() {
    el("china-hot-pool-message").textContent = "正在读取内容池…";
    try { const data = await api({ action: "list" }); state.items = data.items || []; render(); el("china-hot-pool-message").textContent = `已读取 ${state.items.length} 条记录。`; }
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
  function targetFor(item) { return sourceText(item?.raw_text).length < 300 ? { min: 300, max: 360 } : { min: 500, max: 800 }; }
  function trumpMedia(item) { return Array.isArray(item?.raw_payload?.media) ? item.raw_payload.media : []; }
  function updateTrumpCount() {
    const target = targetFor(state.activeTrump); const count = bodyLength(el("trump-editor-content")?.value);
    el("trump-editor-count").textContent = `${count}字`;
    el("trump-editor-count").style.color = count >= target.min && count <= target.max ? "#166534" : "#b42318";
    el("trump-editor-target").textContent = `原帖${sourceText(state.activeTrump?.raw_text).length}字；本稿必须为${target.min}-${target.max}字。`;
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
    el("trump-editor-not-old").checked = payload.old_news_checked === true && payload.appears_old_news !== true;
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
    if (dl) download(state.items.find((item) => item.id === dl.dataset.poolDownload));
    const action = event.target.closest("[data-pool-action]");
    if (action) {
      const label = action.dataset.poolAction === "delete" ? "删除前台文章（内容池记录仍保留）" : action.textContent.trim();
      if (!confirm(`确定${label}？`)) return;
      action.disabled = true;
      try { await api({ action: action.dataset.poolAction, id: action.dataset.poolId }); await load(); }
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

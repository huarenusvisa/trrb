(function () {
  const state = { items: [] };
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

  function download(item) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `china-hot-${item.id}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  document.addEventListener("click", async (event) => {
    const tab = event.target.closest("[data-content-center-tab]");
    if (tab) {
      const china = tab.dataset.contentCenterTab === "china";
      document.querySelectorAll("[data-content-center-tab]").forEach((button) => button.classList.toggle("active", button === tab));
      el("china-hot-pool-panel").classList.toggle("hidden", !china); el("ice-review-page").classList.toggle("hidden", china);
      if (china) load(); else window.loadReviewQueue?.();
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
  });
  document.addEventListener("DOMContentLoaded", () => el("refresh-china-hot-pool")?.addEventListener("click", load));
  window.loadUnifiedContentCenter = () => { load(); };
})();

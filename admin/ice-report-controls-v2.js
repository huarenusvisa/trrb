(() => {
  "use strict";
  const API = "/.netlify/functions/ice-report-integrated";

  async function call(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(API, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `操作失败（${response.status}）`);
      return result;
    } finally { clearTimeout(timer); }
  }

  function setEditable() {
    ["report-edit-title", "report-edit-summary", "report-edit-content"].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      field.readOnly = false;
      field.removeAttribute("aria-readonly");
      field.classList.remove("original-submission-field");
      field.style.pointerEvents = "auto";
      field.style.opacity = "1";
    });
    document.getElementById("original-submission-lock-note")?.remove();
  }

  function ensureFacts() {
    const report = window.__TRRB_ACTIVE_REPORT__ || null;
    const facts = report?.extracted_facts;
    const box = document.getElementById("report-facts");
    if (!box || !facts || box.querySelector(".auto-extracted-facts")) return;
    const row = document.createElement("div");
    row.className = "report-fact auto-extracted-facts";
    row.innerHTML = `<b>自动提取</b><span>机构：${facts.agency || "ICE"}　地点：${facts.location || "待确认"}　人数：${facts.people_count || "未明确"}　国家：${facts.country || "未提及"}</span>`;
    box.appendChild(row);
  }

  function installButtons() {
    const footer = document.querySelector("#report-modal .report-modal-actions");
    if (!footer || footer.dataset.controlsV2 === "1") return;
    footer.dataset.controlsV2 = "1";
    const publish = footer.querySelector('[data-report-action="publish"]');
    if (publish) publish.textContent = "人工决定发布";

    const unpublish = document.createElement("button");
    unpublish.type = "button";
    unpublish.className = "warning-btn";
    unpublish.textContent = "下线已发布内容";
    unpublish.dataset.extraAction = "unpublish";

    const deletePublication = document.createElement("button");
    deletePublication.type = "button";
    deletePublication.className = "danger-btn";
    deletePublication.textContent = "删除已发布文章";
    deletePublication.dataset.extraAction = "delete_publication";

    const deleteReport = document.createElement("button");
    deleteReport.type = "button";
    deleteReport.className = "danger-btn";
    deleteReport.textContent = "彻底删除投稿";
    deleteReport.dataset.extraAction = "delete_report";

    footer.insertBefore(unpublish, publish || null);
    footer.insertBefore(deletePublication, publish || null);
    footer.insertBefore(deleteReport, publish || null);

    footer.querySelectorAll("[data-extra-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const report = window.__TRRB_ACTIVE_REPORT__;
        if (!report?.id) return;
        const action = button.dataset.extraAction;
        const prompts = {
          unpublish: "确认将这篇随手拍内容从前台下线，并保留为可编辑草稿？",
          delete_publication: "确认删除已经发布的文章，但保留投稿草稿？",
          delete_report: "确认彻底删除投稿和已发布文章？此操作不可恢复。"
        };
        if (!confirm(prompts[action])) return;
        const message = document.getElementById("report-action-message");
        button.disabled = true;
        if (message) message.textContent = "正在处理…";
        try {
          await call(action, { report_id: report.id });
          if (message) message.textContent = "操作成功。";
          if (typeof loadReports === "function") await loadReports();
          if (typeof loadArticles === "function") await loadArticles();
          setTimeout(() => document.getElementById("report-modal-close")?.click(), 500);
        } catch (error) {
          if (message) message.textContent = error.name === "AbortError" ? "接口超时，请重试。" : error.message;
        } finally { button.disabled = false; }
      });
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function captureReport(input, init = {}) {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.includes("ice-report-integrated") || String(init.method || "GET").toUpperCase() !== "POST") return response;
    let request = {};
    try { request = JSON.parse(init.body || "{}"); } catch {}
    if (request.action !== "detail" || !response.ok) return response;
    try {
      const data = await response.clone().json();
      window.__TRRB_ACTIVE_REPORT__ = data.report || null;
      setTimeout(() => { setEditable(); ensureFacts(); installButtons(); }, 30);
    } catch {}
    return response;
  };

  const observer = new MutationObserver(() => {
    setEditable();
    installButtons();
    ensureFacts();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

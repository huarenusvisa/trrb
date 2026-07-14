(() => {
  "use strict";

  const PAGE_KEY = "trrb-admin-page-v3";
  const MAINTENANCE_API = "/.netlify/functions/ice-admin-maintenance-v3";
  let explicitNavigation = false;
  let activeReportId = "";

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function stableAdminFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    let payload = null;
    try { payload = JSON.parse(init?.body || "{}"); } catch {}
    if (url.includes("/.netlify/functions/ice-report-integrated") && payload?.report_id) {
      activeReportId = String(payload.report_id);
      window.TRRB_ACTIVE_REPORT_ID = activeReportId;
    }
    return originalFetch(input, init);
  };

  async function api(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await originalFetch(MAINTENANCE_API, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `维护接口失败（${response.status}）`);
      return result;
    } finally { clearTimeout(timer); }
  }

  function currentPage() {
    return document.querySelector(".sidebar .nav-btn.active")?.dataset.page || "";
  }

  function remember(page) {
    if (page) localStorage.setItem(PAGE_KEY, page);
  }

  function installNavigationGuard() {
    document.querySelectorAll(".sidebar [data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        explicitNavigation = true;
        remember(button.dataset.page);
        setTimeout(() => { explicitNavigation = false; }, 300);
      }, true);
    });

    const saved = localStorage.getItem(PAGE_KEY);
    if (saved && saved !== "dashboard") {
      setTimeout(() => {
        const target = document.querySelector(`.sidebar [data-page="${CSS.escape(saved)}"]`);
        if (target && typeof showPage === "function") showPage(saved);
      }, 250);
    }

    const observer = new MutationObserver(() => {
      const active = currentPage();
      const savedPage = localStorage.getItem(PAGE_KEY);
      if (!explicitNavigation && active === "dashboard" && savedPage && savedPage !== "dashboard") {
        const target = document.querySelector(`.sidebar [data-page="${CSS.escape(savedPage)}"]`);
        if (target && typeof showPage === "function") showPage(savedPage);
      } else if (active) {
        remember(active);
      }
    });
    const nav = document.querySelector(".sidebar nav");
    if (nav) observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  async function deleteStory(button) {
    const id = button.dataset.storyId;
    if (!id || !confirm("确认彻底删除这条ICE候选记录？此操作不可恢复。")) return;
    button.disabled = true;
    button.textContent = "删除中…";
    try {
      await api("story_delete", { story_id: id });
      button.closest(".review-item")?.remove();
      if (typeof loadReviewStories === "function") await loadReviewStories();
    } catch (error) {
      alert(error.message || String(error));
      button.disabled = false;
      button.textContent = "删除";
    }
  }

  function addReportMaintenanceButtons() {
    const footer = document.querySelector("#report-modal .report-modal-actions");
    const reportId = activeReportId || window.TRRB_ACTIVE_REPORT_ID || "";
    if (!footer || !reportId) return;
    footer.querySelectorAll("[data-maintenance-action]").forEach((node) => node.remove());

    const actions = [
      ["user_report_unpublish", "下线已发布内容", "warning-btn"],
      ["user_report_delete_article", "删除已发布文章", "danger-btn"],
      ["user_report_delete_all", "彻底删除投稿", "danger-btn"]
    ];
    for (const [action, label, className] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.dataset.maintenanceAction = action;
      button.textContent = label;
      button.addEventListener("click", async () => {
        const warning = action === "user_report_delete_all"
          ? "确认彻底删除投稿及其已发布文章？此操作不可恢复。"
          : action === "user_report_delete_article"
            ? "确认删除前台文章并把投稿退回草稿？"
            : "确认将该内容从前台下线并退回编辑中？";
        if (!confirm(warning)) return;
        button.disabled = true;
        try {
          await api(action, { report_id: reportId });
          const refresh = document.getElementById("refresh-reports");
          refresh?.click();
          document.getElementById("report-modal")?.classList.add("hidden");
          document.body.classList.remove("modal-open");
        } catch (error) {
          alert(error.message || String(error));
          button.disabled = false;
        }
      });
      footer.prepend(button);
    }
  }

  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".ice-delete-story");
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteStory(deleteButton);
      return;
    }
    const reportButton = event.target.closest(".report-item button");
    if (reportButton) {
      const onclick = reportButton.getAttribute("onclick") || "";
      const matched = onclick.match(/TRRB_openIntegratedReport\(['\"]([^'\"]+)/);
      if (matched) {
        activeReportId = matched[1];
        window.TRRB_ACTIVE_REPORT_ID = activeReportId;
      }
      setTimeout(addReportMaintenanceButtons, 350);
    }
  }, true);

  const modalObserver = new MutationObserver(() => {
    const modal = document.getElementById("report-modal");
    if (modal && !modal.classList.contains("hidden")) setTimeout(addReportMaintenanceButtons, 50);
  });

  function init() {
    installNavigationGuard();
    modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

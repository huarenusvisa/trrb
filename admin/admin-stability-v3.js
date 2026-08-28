(() => {
  "use strict";

  const PAGE_KEY = "trrb-admin-page-v3";
  const MAINTENANCE_API = "/.netlify/functions/ice-admin-maintenance-v3";
  let explicitNavigation = false;

  async function api(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(MAINTENANCE_API, {
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
    if (saved && saved !== "dashboard") setTimeout(() => {
      const target = document.querySelector(`.sidebar [data-page="${CSS.escape(saved)}"]`);
      if (target && typeof showPage === "function") showPage(saved);
    }, 250);
    const nav = document.querySelector(".sidebar nav");
    if (!nav) return;
    new MutationObserver(() => {
      const active = currentPage();
      const savedPage = localStorage.getItem(PAGE_KEY);
      if (!explicitNavigation && active === "dashboard" && savedPage && savedPage !== "dashboard") {
        const target = document.querySelector(`.sidebar [data-page="${CSS.escape(savedPage)}"]`);
        if (target && typeof showPage === "function") showPage(savedPage);
      } else if (active) remember(active);
    }).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  async function deleteStory(button) {
    const id = button.dataset.storyId;
    if (!id || !confirm("确认彻底删除这条ICE候选记录？此操作不可恢复。")) return;
    button.disabled = true;
    button.textContent = "删除中…";
    try {
      await api("story_delete", { story_id: id });
      button.closest(".review-item")?.remove();
      if (typeof loadReviewQueue === "function") await loadReviewQueue();
    } catch (error) {
      alert(error.message || String(error));
      button.disabled = false;
      button.textContent = "删除";
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".ice-delete-story");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    deleteStory(button);
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installNavigationGuard, { once: true });
  else installNavigationGuard();
})();

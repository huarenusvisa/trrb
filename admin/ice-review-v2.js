(() => {
  "use strict";

  const VERSION = "20260713-v6-admin-login-hotfix";
  const OWNER_EMAIL_FIX = "tangrenribao@gmail.com";
  const OWNER_UID_FIX = "4c491ee3-a9f0-42c9-9bee-1abb52b20b01";
  const oldGetAdminRecord = getAdminRecord;
  const oldEnterAdmin = enterAdmin;
  const oldReviewApi = reviewApi;
  const oldPopulateReviewModal = populateReviewModal;

  function clean(value) {
    return String(value ?? "").trim();
  }

  function esc(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ownerRecord(user) {
    const email = clean(user?.email).toLowerCase();
    if (user?.id !== OWNER_UID_FIX || email !== OWNER_EMAIL_FIX) return null;
    return { user_id: OWNER_UID_FIX, email: OWNER_EMAIL_FIX, role: "owner", is_active: true };
  }

  function permissionTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("后台权限接口响应超时，请刷新页面后重试。")), 8000);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  getAdminRecord = async function getAdminRecordHotfix(user) {
    return ownerRecord(user) || permissionTimeout(oldGetAdminRecord(user));
  };

  enterAdmin = async function enterAdminHotfix(user) {
    try {
      await oldEnterAdmin(user);
    } catch (error) {
      console.error("Admin permission verification failed:", error);
      setLoginMessage("权限验证失败：" + (error?.message || String(error)));
    }
  };

  async function callV2(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch("/.netlify/functions/ice-review-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `ICE审核接口失败（${response.status}）`);
    return result;
  }

  reviewApi = async function reviewApiV2(action, payload = {}) {
    return action === "list" || action === "publish_now"
      ? callV2(action, payload)
      : oldReviewApi(action, payload);
  };

  renderReviewCard = function renderReviewCardV2(story) {
    const risks = [];
    if (story.conflict_detected) risks.push("事实冲突");
    if (story.legal_risk) risks.push("法律风险");
    if (story.privacy_risk) risks.push("隐私风险");
    if (story.fabrication_risk) risks.push("虚构风险");
    const risk = risks.length
      ? `<span class="risk-chip danger">${risks.map(esc).join(" · ")}</span>`
      : `<span class="risk-chip safe">无硬风险</span>`;
    const image = story.cover_image
      ? `<img src="${esc(story.cover_image)}" alt="" loading="lazy" />`
      : `<div class="review-card-placeholder">ICE</div>`;
    const title = clean(story.title) || "等待生成中文快讯";
    const text = clean(story.summary || story.content || story.decision_reason) || "暂无中文快讯";
    return `<article class="review-item review-item-v2"><div class="review-item-media">${image}</div><div class="review-item-main"><div class="review-item-topline"><span class="status-pill review-status-${esc(story.status)}">${reviewStatusLabel(story.status)}</span>${risk}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div><div class="review-item-action"><time>${esc(formatDate(story.updated_at || story.last_seen_at))}</time><button onclick="openIceReview('${esc(story.id)}')">查看并审核</button></div></article>`;
  };

  populateReviewModal = function populateReviewModalV2(detail) {
    oldPopulateReviewModal(detail);
    const summaryLabel = el("review-summary")?.previousElementSibling;
    const contentLabel = el("review-content")?.previousElementSibling;
    if (summaryLabel?.tagName === "LABEL") summaryLabel.textContent = "30—50字中文快讯";
    if (contentLabel?.tagName === "LABEL") contentLabel.textContent = "发布正文（可人工扩写）";
    const reason = el("review-decision-reason");
    document.querySelectorAll(".manual-publish-note").forEach((node) => node.remove());
    if (reason) reason.insertAdjacentHTML("afterend", "<p class=\"manual-publish-note\">管理员选择“立即发布”后将直接发布；系统只保留风险提示。</p>");
  };

  function loadUserReports() {
    if (!document.querySelector('link[data-ice-report-integrated="1"]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "./ice-report-integrated.css?v=20260713-v2";
      css.dataset.iceReportIntegrated = "1";
      document.head.appendChild(css);
    }
    const loadMain = () => {
      if (document.querySelector('script[data-ice-report-integrated="1"]')) return;
      const script = document.createElement("script");
      script.src = "./ice-report-integrated.js?v=20260713-v3";
      script.dataset.iceReportIntegrated = "1";
      document.body.appendChild(script);
    };
    if (document.querySelector('script[data-ice-report-raw-lock="1"]')) return loadMain();
    const lock = document.createElement("script");
    lock.src = "./ice-report-raw-lock.js?v=20260713-v2";
    lock.dataset.iceReportRawLock = "1";
    lock.onload = loadMain;
    document.body.appendChild(lock);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const head = document.querySelector("#ice-review-page .review-head");
    if (head && !head.querySelector(".user-report-entry")) {
      const actions = document.createElement("div");
      actions.className = "review-head-actions";
      actions.innerHTML = `<button type="button" class="user-report-entry" data-page="ice-reports">用户投稿审核</button>`;
      const refresh = el("refresh-review");
      if (refresh) actions.appendChild(refresh);
      head.appendChild(actions);
    }
    loadUserReports();
    const publishButton = document.querySelector('[data-review-action="publish_now"]');
    if (publishButton) publishButton.textContent = "人工立即发布";
    const modal = el("review-modal");
    if (modal) modal.dataset.iceReviewVersion = VERSION;
  });
})();

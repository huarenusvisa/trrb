(() => {
  "use strict";

  const oldGetAdminRecord = getAdminRecord;
  const oldEnterAdmin = enterAdmin;
  const oldReviewApi = reviewApi;
  const oldPopulateReviewModal = populateReviewModal;
  let pipeline = null;
  let dedupe = null;

  const clean = (value) => String(value ?? "").trim();
  const esc = (value) => clean(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function ownerRecord(user) {
    const email = clean(user?.email).toLowerCase();
    if (user?.id !== OWNER_UID || email !== OWNER_EMAIL) return null;
    return { user_id: OWNER_UID, email: OWNER_EMAIL, role: "owner", is_active: true };
  }

  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("后台权限接口响应超时，请刷新页面后重试。")), 8000);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  getAdminRecord = async (user) => ownerRecord(user) || withTimeout(oldGetAdminRecord(user));
  enterAdmin = async (user) => {
    try { await oldEnterAdmin(user); }
    catch (error) { setLoginMessage("权限验证失败：" + (error?.message || String(error))); }
  };

  async function callApi(endpoint, action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `ICE接口失败（${response.status}）`);
    return result;
  }

  reviewApi = async function reviewApiV3(action, payload = {}) {
    if (action === "list") {
      const result = await callApi("/.netlify/functions/ice-review-list-v3", action, payload);
      pipeline = result.pipeline || {};
      dedupe = result.dedupe || {};
      renderPipeline();
      return result;
    }
    if (action === "publish_now") return callApi("/.netlify/functions/ice-review-v2", action, payload);
    return oldReviewApi(action, payload);
  };

  function time(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "尚无记录";
  }

  function postCount(name) { return Number(pipeline?.post_counts?.[name] || 0); }

  function renderPipeline() {
    const head = document.querySelector("#ice-review-page .review-head");
    if (!head || !pipeline) return;
    let panel = document.getElementById("ice-pipeline-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "ice-pipeline-panel";
      panel.className = "panel";
      panel.style.margin = "12px 0";
      head.insertAdjacentElement("afterend", panel);
    }
    const errors = Array.isArray(pipeline.recent_errors) ? pipeline.recent_errors : [];
    panel.innerHTML = `<h3>ICE采集状态</h3><p>最近运行：${esc(time(pipeline.last_run_at))}　最近成功：${esc(time(pipeline.last_success_at))}</p><p>待处理 ${postCount("collected") + postCount("processing")}　已提取 ${postCount("extracted")}　已归并 ${postCount("clustered")}　失败 ${postCount("failed")}　关键词合并 ${Number(dedupe.hidden_duplicates || 0)}　后台可见 ${Number(dedupe.visible || 0)}</p>${errors.length ? `<p style="color:#b91c1c">最近错误：${errors.map((item) => esc(item.error)).join("；")}</p>` : ""}`;
  }

  renderReviewCard = function renderReviewCardV3(story) {
    const risks = [story.conflict_detected && "事实冲突", story.legal_risk && "法律风险", story.privacy_risk && "隐私风险", story.fabrication_risk && "虚构风险"].filter(Boolean);
    const image = clean(story.cover_image) ? `<div class="review-item-media"><img src="${esc(story.cover_image)}" alt="" loading="lazy"></div>` : "";
    const body = clean(story.summary || story.content || story.source_preview || story.decision_reason) || "暂无正文";
    const merged = Number(story.duplicate_count || 0) ? `<span class="risk-chip safe">已合并${Number(story.duplicate_count)}条重复信息</span>` : "";
    return `<article class="review-item review-item-v2" style="grid-template-columns:${image ? "164px minmax(0,1fr) auto" : "minmax(0,1fr) auto"}">${image}<div class="review-item-main"><div class="review-item-topline"><span class="status-pill review-status-${esc(story.status)}">${reviewStatusLabel(story.status)}</span><span class="risk-chip ${risks.length ? "danger" : "safe"}">${risks.length ? risks.map(esc).join(" · ") : "待工作人员判断"}</span>${merged}</div><h3>${esc(story.title || "ICE候选新闻待审核")}</h3><p>${esc(body)}</p></div><div class="review-item-action"><time>${esc(formatDate(story.source_created_at || story.updated_at || story.last_seen_at))}</time><button onclick="openIceReview('${esc(story.id)}')">查看并审核</button></div></article>`;
  };

  populateReviewModal = function populateReviewModalV3(detail) {
    oldPopulateReviewModal(detail);
    const reason = el("review-decision-reason");
    document.querySelectorAll(".staff-decision-note").forEach((node) => node.remove());
    if (reason) reason.insertAdjacentHTML("afterend", "<p class=\"manual-publish-note staff-decision-note\">系统只负责采集、关键词去重和风险提示；法律风险及是否发布由工作人员最终判断。没有图片也可以直接发布标题和正文。</p>");
  };

  function loadUserReports() {
    const loadMain = () => {
      if (document.querySelector('script[data-ice-report-integrated="1"]')) return;
      const script = document.createElement("script");
      script.src = "./ice-report-integrated.js?v=20260713-v3";
      script.dataset.iceReportIntegrated = "1";
      document.body.appendChild(script);
    };
    if (document.querySelector('script[data-ice-report-raw-lock="1"]')) return loadMain();
    const lock = document.createElement("script");
    lock.src = "./ice-report-raw-lock.js?v=20260713-v3";
    lock.dataset.iceReportRawLock = "1";
    lock.onload = loadMain;
    document.body.appendChild(lock);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const head = document.querySelector("#ice-review-page .review-head");
    const description = head?.querySelector("p");
    if (description) description.textContent = "采集内容完成关键词去重后直接显示；风险和法律问题由工作人员判断是否发布。";
    if (head && !head.querySelector(".user-report-entry")) {
      const actions = document.createElement("div");
      actions.className = "review-head-actions";
      actions.innerHTML = `<button type="button" class="user-report-entry" data-page="ice-reports">用户投稿审核</button>`;
      const refresh = el("refresh-review");
      if (refresh) actions.appendChild(refresh);
      head.appendChild(actions);
    }
    loadUserReports();
  });
})();

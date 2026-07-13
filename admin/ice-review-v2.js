(() => {
  "use strict";

  const VERSION = "20260713-v5-original-submission-server-lock";
  const originalReviewApi = reviewApi;
  const originalPopulateReviewModal = populateReviewModal;

  function clean(value) { return String(value ?? "").trim(); }
  function html(value) { return clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function attr(value) { return html(value).replaceAll("`", "&#096;"); }
  function locationOf(story) { const payload = story?.ai_payload || {}; return clean(payload.location_text || [payload.city, payload.state_code].filter(Boolean).join(" · ")) || "地点待确认"; }
  function sourceLanguageOf(story) { const language = clean(story?.ai_payload?.source_language).toLowerCase(); if (language === "en") return "英文信源 · 已译中文"; if (language === "mixed") return "中英混合信源"; if (language === "zh") return "中文信源"; return "X信源"; }
  function riskLabels(story) { const items = []; if (story.conflict_detected) items.push("事实冲突"); if (story.legal_risk) items.push("法律风险"); if (story.privacy_risk) items.push("隐私风险"); if (story.fabrication_risk) items.push("虚构风险"); return items; }

  async function callV2(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch("/.netlify/functions/ice-review-v2", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `ICE审核接口失败（${response.status}）`);
    return result;
  }

  reviewApi = async function reviewApiV2(action, payload = {}) { if (action === "list" || action === "publish_now") return callV2(action, payload); return originalReviewApi(action, payload); };

  renderReviewCard = function renderReviewCardV2(story) {
    const risks = riskLabels(story);
    const riskHtml = risks.length ? `<span class="risk-chip danger">${risks.map(html).join(" · ")}</span>` : `<span class="risk-chip safe">无硬风险</span>`;
    const image = story.cover_image ? `<img src="${attr(story.cover_image)}" alt="" loading="lazy" />` : `<div class="review-card-placeholder">ICE</div>`;
    const title = clean(story.title) || "等待生成中文快讯";
    const bulletin = clean(story.summary || story.content || story.decision_reason) || "暂无中文快讯";
    return `<article class="review-item review-item-v2"><div class="review-item-media">${image}</div><div class="review-item-main"><div class="review-item-topline"><span class="status-pill review-status-${html(story.status)}">${reviewStatusLabel(story.status)}</span>${riskHtml}<span class="source-chip">${html(sourceLanguageOf(story))}</span><span class="location-chip">📍 ${html(locationOf(story))}</span></div><h3>${html(title)}</h3><p>${html(bulletin)}</p><div class="score-row"><span><b>${Number(story.total_score || 0)}</b>/100 综合分</span><span><b>${Number(story.ai_confidence || 0)}</b>/100 AI可信度</span><span>独立信源 <b>${Number(story.independent_source_count || 0)}</b></span><span>官方 <b>${Number(story.official_source_count || 0)}</b></span><span>媒体 <b>${Number(story.media_source_count || 0)}</b></span></div></div><div class="review-item-action"><time>${html(formatDate(story.updated_at || story.last_seen_at))}</time><button onclick="openIceReview('${attr(story.id)}')">查看并审核</button></div></article>`;
  };

  populateReviewModal = function populateReviewModalV2(detail) {
    originalPopulateReviewModal(detail);
    const story = detail.story || {};
    const grid = el("review-score-grid");
    if (grid) grid.insertAdjacentHTML("beforeend", `<div class="review-location-metric"><span>地点分类</span><strong>${html(locationOf(story))}</strong></div><div><span>信源语言</span><strong>${html(sourceLanguageOf(story))}</strong></div>`);
    const summaryLabel = el("review-summary")?.previousElementSibling;
    const contentLabel = el("review-content")?.previousElementSibling;
    if (summaryLabel?.tagName === "LABEL") summaryLabel.textContent = "30—50字中文快讯";
    if (contentLabel?.tagName === "LABEL") contentLabel.textContent = "发布正文（可人工扩写）";
    if (el("review-summary")) el("review-summary").rows = 3;
    if (el("review-content")) el("review-content").rows = 7;
    const reason = el("review-decision-reason");
    document.querySelectorAll(".manual-publish-note").forEach((node) => node.remove());
    if (reason) reason.insertAdjacentHTML("afterend", `<p class="manual-publish-note">管理员选择“立即发布”后将直接发布；系统只保留风险提示，不再阻止人工决定。</p>`);
  };

  function loadIntegratedReportAssets() {
    if (!document.querySelector('link[data-ice-report-integrated="1"]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "./ice-report-integrated.css?v=20260713-v2";
      css.dataset.iceReportIntegrated = "1";
      document.head.appendChild(css);
    }
    const loadIntegrated = () => {
      if (document.querySelector('script[data-ice-report-integrated="1"]')) return;
      const script = document.createElement("script");
      script.src = "./ice-report-integrated.js?v=20260713-v3";
      script.dataset.iceReportIntegrated = "1";
      document.body.appendChild(script);
    };
    if (!document.querySelector('script[data-ice-report-raw-lock="1"]')) {
      const lock = document.createElement("script");
      lock.src = "./ice-report-raw-lock.js?v=20260713-v2";
      lock.dataset.iceReportRawLock = "1";
      lock.onload = loadIntegrated;
      document.body.appendChild(lock);
    } else {
      loadIntegrated();
    }
  }

  function installUserReportEntry() {
    const reviewHead = document.querySelector("#ice-review-page .review-head");
    if (reviewHead && !reviewHead.querySelector(".user-report-entry")) {
      const actions = document.createElement("div");
      actions.className = "review-head-actions";
      actions.innerHTML = `<button type="button" class="user-report-entry" data-page="ice-reports">用户投稿审核</button>`;
      const refresh = el("refresh-review");
      if (refresh) actions.appendChild(refresh);
      reviewHead.appendChild(actions);
      const description = reviewHead.querySelector("p");
      if (description) description.textContent = "英文信源生成中文快讯；用户投稿完全绕过AI，人工审核后按数据库原文发布。";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    installUserReportEntry();
    loadIntegratedReportAssets();
    const publishButton = document.querySelector('[data-review-action="publish_now"]');
    if (publishButton) publishButton.textContent = "人工立即发布";
    const modal = el("review-modal");
    if (modal) modal.dataset.iceReviewVersion = VERSION;
  });
})();

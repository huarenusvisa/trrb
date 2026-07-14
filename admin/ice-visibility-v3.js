(() => {
  "use strict";

  const originalReviewApi = reviewApi;
  let pipeline = null;
  let dedupe = null;

  async function callList() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch("/.netlify/functions/ice-review-list-v3", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "list" })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `ICE采集状态接口失败（${response.status}）`);
    pipeline = result.pipeline || {};
    dedupe = result.dedupe || {};
    renderPipeline();
    return result;
  }

  reviewApi = (action, payload = {}) => action === "list" ? callList() : originalReviewApi(action, payload);

  function text(value) {
    return String(value ?? "").trim();
  }

  function html(value) {
    return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function time(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "尚无记录";
  }

  function postCount(name) {
    return Number(pipeline?.post_counts?.[name] || 0);
  }

  function renderPipeline() {
    const head = document.querySelector("#ice-review-page .review-head");
    if (!head) return;
    let panel = document.getElementById("ice-pipeline-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "ice-pipeline-panel";
      panel.className = "panel";
      panel.style.margin = "12px 0";
      head.insertAdjacentElement("afterend", panel);
    }
    panel.innerHTML = `<h3>ICE采集状态</h3><p>最近运行：${html(time(pipeline.last_run_at))}　最近成功：${html(time(pipeline.last_success_at))}</p><p>待处理 ${postCount("collected") + postCount("processing")}　已提取 ${postCount("extracted")}　已归并 ${postCount("clustered")}　失败 ${postCount("failed")}　关键词合并 ${Number(dedupe.hidden_duplicates || 0)}　后台可见 ${Number(dedupe.visible || 0)}</p>${pipeline.recent_errors?.length ? `<p style="color:#b91c1c">最近错误：${pipeline.recent_errors.map((item) => html(item.error)).join("；")}</p>` : ""}`;
  }

  renderReviewCard = function renderVisibleIceCard(story) {
    const risks = [story.conflict_detected && "事实冲突", story.legal_risk && "法律风险", story.privacy_risk && "隐私风险", story.fabrication_risk && "虚构风险"].filter(Boolean);
    const image = text(story.cover_image) ? `<div class="review-item-media"><img src="${html(story.cover_image)}" alt="" loading="lazy"></div>` : "";
    const body = text(story.summary || story.content || story.source_preview || story.decision_reason) || "暂无正文";
    const merged = Number(story.duplicate_count || 0) ? `<span class="risk-chip safe">已合并${Number(story.duplicate_count)}条重复信息</span>` : "";
    return `<article class="review-item review-item-v2" style="grid-template-columns:${image ? "164px minmax(0,1fr) auto" : "minmax(0,1fr) auto"}">${image}<div class="review-item-main"><div class="review-item-topline"><span class="status-pill review-status-${html(story.status)}">${reviewStatusLabel(story.status)}</span><span class="risk-chip ${risks.length ? "danger" : "safe"}">${risks.length ? risks.map(html).join(" · ") : "待工作人员判断"}</span>${merged}</div><h3>${html(story.title || "ICE候选新闻待审核")}</h3><p>${html(body)}</p></div><div class="review-item-action"><time>${html(formatDate(story.source_created_at || story.updated_at || story.last_seen_at))}</time><button onclick="openIceReview('${html(story.id)}')">查看并审核</button></div></article>`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    const description = document.querySelector("#ice-review-page .review-head p");
    if (description) description.textContent = "采集内容完成关键词去重后直接显示；风险和法律问题由工作人员判断是否发布。";
  });
})();

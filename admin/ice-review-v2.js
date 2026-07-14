(() => {
  "use strict";

  const oldGetAdminRecord = getAdminRecord;
  const oldEnterAdmin = enterAdmin;
  const oldReviewApi = reviewApi;
  const oldPopulateReviewModal = populateReviewModal;
  let pipeline = null;
  let dedupe = null;
  let v2Health = null;

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

  async function token() {
    const { data } = await supabaseClient.auth.getSession();
    const value = data.session?.access_token;
    if (!value) throw new Error("登录状态已失效，请重新登录。");
    return value;
  }

  async function fetchJsonWithTimeout(endpoint, options = {}, label = "ICE接口", timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, { ...options, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `${label}失败（${response.status}）`);
      return result;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`${label}响应超时，请刷新后重试。`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function callApi(endpoint, action, payload = {}) {
    return fetchJsonWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ action, ...payload })
    }, "ICE后台接口");
  }

  async function loadV2Health() {
    const result = await fetchJsonWithTimeout("/.netlify/functions/ice-v2-health", {
      method: "GET",
      headers: { Authorization: `Bearer ${await token()}` },
      cache: "no-store"
    }, "ICE v2监控接口");
    v2Health = result;
    renderV2Health();
    return result;
  }

  reviewApi = async function reviewApiV3(action, payload = {}) {
    if (action === "list") {
      const [result] = await Promise.all([
        callApi("/.netlify/functions/ice-review-list-v3", action, payload),
        loadV2Health().catch((error) => {
          console.warn("ICE v2健康状态加载失败：", error);
          renderV2HealthError(error);
          return null;
        })
      ]);
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

  function installV2Styles() {
    if (document.getElementById("ice-v2-health-styles")) return;
    const style = document.createElement("style");
    style.id = "ice-v2-health-styles";
    style.textContent = `
      .ice-v2-health{margin:12px 0;padding:14px;border:1px solid #dbe4ef;border-radius:14px;background:#fff}
      .ice-v2-health-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.ice-v2-health-head h3{margin:0}
      .ice-v2-health-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.ice-v2-health-card{padding:10px 12px;border-radius:10px;background:#f7f9fc;min-width:0}
      .ice-v2-health-card span{display:block;font-size:12px;color:#64748b}.ice-v2-health-card strong{display:block;margin-top:4px;font-size:18px;color:#0f172a}
      .ice-v2-health-summary{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:12px;font-size:13px;color:#475569}.ice-v2-health-summary b{color:#0f172a}
      .ice-v2-source-table{margin-top:12px;overflow:auto}.ice-v2-source-table table{width:100%;border-collapse:collapse;font-size:13px}.ice-v2-source-table th,.ice-v2-source-table td{padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:left;white-space:nowrap}
      .ice-v2-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-weight:700;font-size:12px}.ice-v2-badge.healthy{background:#dcfce7;color:#166534}.ice-v2-badge.stale{background:#fef3c7;color:#92400e}.ice-v2-badge.failed{background:#fee2e2;color:#991b1b}.ice-v2-badge.unknown{background:#e5e7eb;color:#374151}
      .ice-v2-health-error{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff7ed;color:#9a3412}
      @media(max-width:1000px){.ice-v2-health-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:640px){.ice-v2-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ice-v2-health-head{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function healthPanel() {
    const head = document.querySelector("#ice-review-page .review-head");
    if (!head) return null;
    let panel = document.getElementById("ice-v2-health-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "ice-v2-health-panel";
      panel.className = "ice-v2-health";
      head.insertAdjacentElement("afterend", panel);
    }
    return panel;
  }

  function count(group, status) {
    return Number(v2Health?.groups?.[group]?.[status] || 0);
  }

  function sources() {
    const items = Array.isArray(v2Health?.sources) ? v2Health.sources : [];
    const order = { failed: 0, stale: 1, unknown: 2, healthy: 3 };
    return [...items].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || clean(a.query_key).localeCompare(clean(b.query_key)));
  }

  function renderV2Health() {
    installV2Styles();
    const panel = healthPanel();
    if (!panel || !v2Health) return;
    const queue = v2Health.queue || {};
    const rows = sources();
    panel.innerHTML = `
      <div class="ice-v2-health-head"><div><h3>ICE v2真实运行监控</h3><small>生成时间：${esc(time(v2Health.generated_at))}</small></div><button type="button" id="refresh-ice-v2-health">刷新监控</button></div>
      <div class="ice-v2-health-grid">
        <div class="ice-v2-health-card"><span>官方正常</span><strong>${count("official", "healthy")}</strong></div>
        <div class="ice-v2-health-card"><span>官方超时</span><strong>${count("official", "stale")}</strong></div>
        <div class="ice-v2-health-card"><span>官方失败</span><strong>${count("official", "failed")}</strong></div>
        <div class="ice-v2-health-card"><span>媒体正常</span><strong>${count("newsroom", "healthy")}</strong></div>
        <div class="ice-v2-health-card"><span>媒体超时</span><strong>${count("newsroom", "stale")}</strong></div>
        <div class="ice-v2-health-card"><span>媒体失败</span><strong>${count("newsroom", "failed")}</strong></div>
      </div>
      <div class="ice-v2-health-summary"><span>待归并 <b>${Number(queue.posts_collected || 0)}</b></span><span>已归并 <b>${Number(queue.posts_clustered || 0)}</b></span><span>帖子失败 <b>${Number(queue.posts_failed || 0)}</b></span><span>等待交叉信源 <b>${Number(queue.stories_waiting_corroboration || 0)}</b></span><span>待人工审核 <b>${Number(queue.stories_pending_review || 0)}</b></span><span>事件失败 <b>${Number(queue.stories_failed || 0)}</b></span></div>
      <div class="ice-v2-source-table"><table><thead><tr><th>信源</th><th>状态</th><th>最近成功</th><th>最近运行</th><th>最近结果</th><th>错误</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.query_key || "-")}</td><td><span class="ice-v2-badge ${esc(row.status || "unknown")}">${esc(row.status_label || row.status || "unknown")}</span></td><td>${esc(time(row.last_success_at))}</td><td>${esc(time(row.last_run_at))}</td><td>${esc(row.result_summary || "-")}</td><td>${esc(row.last_error || "-")}</td></tr>`).join("") || `<tr><td colspan="6">尚无ICE v2采集记录。首次运行采集器后会显示每个白名单账号的状态。</td></tr>`}</tbody></table></div>
    `;
    document.getElementById("refresh-ice-v2-health")?.addEventListener("click", () => loadV2Health().catch(renderV2HealthError));
  }

  function renderV2HealthError(error) {
    installV2Styles();
    const panel = healthPanel();
    if (!panel) return;
    panel.innerHTML = `<div class="ice-v2-health-head"><h3>ICE v2真实运行监控</h3><button type="button" id="refresh-ice-v2-health">重新加载</button></div><div class="ice-v2-health-error">${esc(error?.message || error || "监控接口加载失败")}</div>`;
    document.getElementById("refresh-ice-v2-health")?.addEventListener("click", () => loadV2Health().catch(renderV2HealthError));
  }

  function renderPipeline() {
    const head = document.querySelector("#ice-review-page .review-head");
    if (!head || !pipeline) return;
    let panel = document.getElementById("ice-pipeline-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "ice-pipeline-panel";
      panel.className = "panel";
      panel.style.margin = "12px 0";
      const health = document.getElementById("ice-v2-health-panel");
      (health || head).insertAdjacentElement("afterend", panel);
    }
    const errors = Array.isArray(pipeline.recent_errors) ? pipeline.recent_errors : [];
    panel.innerHTML = `<h3>旧队列兼容状态</h3><p>最近运行：${esc(time(pipeline.last_run_at))}　最近成功：${esc(time(pipeline.last_success_at))}</p><p>待处理 ${postCount("collected") + postCount("processing")}　已提取 ${postCount("extracted")}　已归并 ${postCount("clustered")}　失败 ${postCount("failed")}　关键词合并 ${Number(dedupe.hidden_duplicates || 0)}　后台可见 ${Number(dedupe.visible || 0)}</p>${errors.length ? `<p style="color:#b91c1c">最近错误：${errors.map((item) => esc(item.error)).join("；")}</p>` : ""}`;
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
    if (reason) reason.insertAdjacentHTML("afterend", "<p class=\"manual-publish-note staff-decision-note\">系统只负责采集、事件归并、中文整理和风险提示；法律风险及是否发布由工作人员最终判断。没有图片也可以直接发布标题和正文。</p>");
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
    installV2Styles();
    const head = document.querySelector("#ice-review-page .review-head");
    const description = head?.querySelector("p");
    if (description) description.textContent = "ICE v2仅采集白名单官方机构、政策官员和正规媒体；完成事件归并与中文整理后由工作人员审核。用户投稿完全绕过AI，按数据库原文审核发布。";
    if (head && !head.querySelector(".user-report-entry")) {
      const actions = document.createElement("div");
      actions.className = "review-head-actions";
      actions.innerHTML = `<button type="button" class="user-report-entry" data-page="ice-reports">用户投稿审核</button>`;
      const refresh = el("refresh-review");
      if (refresh) actions.appendChild(refresh);
      head.appendChild(actions);
    }
    const publishButton = document.querySelector('[data-review-action="publish_now"]');
    if (publishButton) publishButton.textContent = "人工立即发布";
    loadUserReports();
  });
})();
(() => {
  "use strict";

  const PAGE = "ice-reports";
  const API = "/.netlify/functions/ice-report-integrated";
  const STATUS_LIST = ["draft", "reviewing", "published", "rejected"];
  let reports = [];
  let currentStatus = "draft";
  let activeDetail = null;
  let initialized = false;
  const originalShowPage = showPage;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function attr(value) {
    return esc(value).replaceAll("`", "&#096;");
  }

  function statusLabel(value) {
    return ({ draft: "待审核", reviewing: "编辑中", published: "已发布", rejected: "已拒绝" })[value] || value;
  }

  async function callApi(action, payload = {}) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `用户投稿审核接口失败（${response.status}）`);
    return result;
  }

  function injectPage() {
    if (document.getElementById(`${PAGE}-page`)) return;

    const nav = document.querySelector(".sidebar nav");
    const oldNav = nav?.querySelector(".user-report-nav");
    if (oldNav) oldNav.remove();

    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "nav-btn report-nav";
    navButton.dataset.page = PAGE;
    navButton.innerHTML = `用户投稿审核 <span id="report-nav-count">0</span>`;
    nav?.insertBefore(navButton, nav.querySelector('[data-page="rankings"]'));

    const page = document.createElement("section");
    page.className = "page hidden";
    page.id = `${PAGE}-page`;
    page.innerHTML = `
      <div class="report-head panel">
        <div>
          <h3>ICE用户投稿审核</h3>
          <p>使用现有后台账号直接审核。用户投稿不进入AI，可编辑后发布或人工直接发布。</p>
        </div>
        <button type="button" id="refresh-reports">刷新投稿队列</button>
      </div>
      <div class="report-tabs" id="report-tabs">
        <button type="button" class="report-tab active" data-report-status="draft">待审核 <b id="report-count-draft">0</b></button>
        <button type="button" class="report-tab" data-report-status="reviewing">编辑中 <b id="report-count-reviewing">0</b></button>
        <button type="button" class="report-tab" data-report-status="published">已发布 <b id="report-count-published">0</b></button>
        <button type="button" class="report-tab" data-report-status="rejected">已拒绝 <b id="report-count-rejected">0</b></button>
      </div>
      <div class="report-status" id="report-status">正在读取用户投稿…</div>
      <div class="report-list" id="report-list"></div>
    `;
    const rankingsPage = document.getElementById("rankings-page");
    rankingsPage?.parentNode.insertBefore(page, rankingsPage);

    const modal = document.createElement("div");
    modal.className = "report-modal hidden";
    modal.id = "report-modal";
    modal.innerHTML = `
      <div class="report-modal-backdrop" id="report-modal-backdrop"></div>
      <section class="report-modal-panel" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <header class="report-modal-header">
          <div><span class="eyebrow">USER SUBMISSION</span><h2 id="report-modal-title">审核用户投稿</h2></div>
          <button type="button" class="icon-btn" id="report-modal-close" aria-label="关闭">×</button>
        </header>
        <div class="report-modal-body">
          <div class="report-facts" id="report-facts"></div>
          <div class="report-media-grid" id="report-media"></div>
          <label>编辑后标题</label>
          <input id="report-edit-title" maxlength="220" />
          <label>摘要</label>
          <textarea id="report-edit-summary" rows="3"></textarea>
          <label>正文</label>
          <textarea id="report-edit-content" rows="8"></textarea>
          <fieldset>
            <legend>选择封面</legend>
            <div class="report-cover-options" id="report-cover-options"></div>
          </fieldset>
          <label>审核说明／拒绝理由</label>
          <textarea id="report-review-note" rows="3" placeholder="可记录编辑内容；拒绝时必须填写理由。"></textarea>
        </div>
        <footer class="report-modal-actions">
          <button type="button" class="secondary-btn" data-report-action="save">保存编辑</button>
          <button type="button" class="danger-btn" data-report-action="reject">拒绝投稿</button>
          <button type="button" class="publish-now-btn" data-report-action="publish">人工立即发布</button>
        </footer>
        <div class="report-action-message" id="report-action-message"></div>
      </section>
    `;
    document.body.appendChild(modal);

    const oldEntry = document.querySelector("#ice-review-page .user-report-entry");
    if (oldEntry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "user-report-entry";
      button.textContent = "用户投稿审核";
      button.addEventListener("click", () => showPage(PAGE));
      oldEntry.replaceWith(button);
    }

    navButton.addEventListener("click", () => showPage(PAGE));
    document.getElementById("refresh-reports").addEventListener("click", loadReports);
    document.querySelectorAll("[data-report-status]").forEach((button) => {
      button.addEventListener("click", () => {
        currentStatus = button.dataset.reportStatus;
        document.querySelectorAll("[data-report-status]").forEach((item) => item.classList.toggle("active", item === button));
        renderReports();
      });
    });
    document.getElementById("report-modal-close").addEventListener("click", closeModal);
    document.getElementById("report-modal-backdrop").addEventListener("click", closeModal);
    document.querySelectorAll("[data-report-action]").forEach((button) => {
      button.addEventListener("click", () => handleAction(button.dataset.reportAction));
    });
  }

  showPage = function showPageWithReports(page) {
    originalShowPage(page);
    if (page === PAGE) {
      document.getElementById("page-title").textContent = "ICE用户投稿审核";
      history.replaceState(null, "", "#ice-reports");
      loadReports();
    } else if (location.hash === "#ice-reports") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  };

  async function loadReports() {
    const statusNode = document.getElementById("report-status");
    if (!statusNode) return;
    statusNode.textContent = "正在读取用户投稿…";
    try {
      const result = await callApi("list");
      reports = result.reports || [];
      updateCounts();
      renderReports();
      statusNode.textContent = `共读取 ${reports.length} 条用户投稿。`;
    } catch (error) {
      console.error(error);
      statusNode.textContent = `读取失败：${error.message}`;
      document.getElementById("report-list").innerHTML = `<div class="report-empty">${esc(error.message)}</div>`;
    }
  }

  function updateCounts() {
    STATUS_LIST.forEach((status) => {
      const count = reports.filter((item) => item.status === status).length;
      const node = document.getElementById(`report-count-${status}`);
      if (node) node.textContent = count;
    });
    const pending = reports.filter((item) => item.status === "draft").length;
    const navCount = document.getElementById("report-nav-count");
    if (navCount) navCount.textContent = pending;
  }

  function renderReports() {
    const listNode = document.getElementById("report-list");
    if (!listNode) return;
    const rows = reports.filter((item) => item.status === currentStatus);
    listNode.innerHTML = rows.length ? rows.map((report) => {
      const image = report.preview_url || report.cover_image;
      const media = image
        ? `<img src="${attr(image)}" alt="" loading="lazy" />`
        : `<div class="report-thumb">${Array.isArray(report.media) && report.media.length ? "投稿素材" : "无图片"}</div>`;
      return `
        <article class="report-item">
          <div>${media}</div>
          <div class="report-main">
            <span class="report-location">📍 ${esc(report.location_text || "地点未填写")}</span>
            <h3>${esc(report.admin_title || report.location_text || "ICE用户投稿")}</h3>
            <p>${esc(report.event_description || "暂无事件描述")}</p>
            <div class="report-meta">
              <span>事件日期 ${esc(report.report_date || "-")}</span>
              <span>素材 ${Array.isArray(report.media) ? report.media.length : 0}个</span>
              <span>${esc(statusLabel(report.status))}</span>
            </div>
          </div>
          <div class="report-action">
            <time>${esc(formatDate(report.created_at))}</time>
            <button type="button" onclick="TRRB_openIntegratedReport('${attr(report.id)}')">查看并审核</button>
          </div>
        </article>
      `;
    }).join("") : `<div class="report-empty">当前分类没有用户投稿。</div>`;
  }

  window.TRRB_openIntegratedReport = async function openIntegratedReport(id) {
    const modal = document.getElementById("report-modal");
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    document.getElementById("report-action-message").textContent = "正在读取投稿详情…";
    try {
      activeDetail = await callApi("detail", { report_id: id });
      populateModal(activeDetail);
    } catch (error) {
      document.getElementById("report-action-message").textContent = error.message;
    }
  };

  function populateModal(detail) {
    const report = detail.report || {};
    const editorial = detail.editorial || {};
    document.getElementById("report-modal-title").textContent = report.location_text || "审核用户投稿";
    document.getElementById("report-edit-title").value = report.admin_title || editorial.title || "";
    document.getElementById("report-edit-summary").value = report.admin_summary || editorial.summary || "";
    document.getElementById("report-edit-content").value = report.admin_content || editorial.content || "";
    document.getElementById("report-review-note").value = report.review_note || "";
    document.getElementById("report-action-message").textContent = "";

    const facts = [
      ["事件日期", report.report_date],
      ["地点", report.location_text],
      ["提交时间", formatDate(report.created_at)],
      ["联系方式（不公开）", report.contact_info || "未提供"],
      ["原始描述", report.event_description],
      ["当前状态", statusLabel(report.status)]
    ];
    document.getElementById("report-facts").innerHTML = facts.map(([label, value]) =>
      `<div class="report-fact"><b>${esc(label)}</b><span>${esc(value || "-")}</span></div>`
    ).join("");

    const media = report.signed_media || [];
    document.getElementById("report-media").innerHTML = media.length ? media.map((item) =>
      String(item.mime_type || "").startsWith("video/")
        ? `<video controls src="${attr(item.url)}"></video>`
        : `<img src="${attr(item.url)}" alt="" loading="lazy" />`
    ).join("") : `<div class="report-empty">没有上传照片或视频。</div>`;

    const images = media.filter((item) => String(item.mime_type || "").startsWith("image/"));
    document.getElementById("report-cover-options").innerHTML = images.length ? images.map((item, index) => `
      <label class="report-cover-choice">
        <input type="radio" name="report-cover-path" value="${attr(item.path)}" ${(report.selected_cover_path === item.path || (!report.selected_cover_path && index === 0)) ? "checked" : ""} />
        <img src="${attr(item.url)}" alt="封面选项" />
      </label>
    `).join("") : `<span>没有可用图片，文章将不设置封面。</span>`;
  }

  function closeModal() {
    document.getElementById("report-modal")?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    activeDetail = null;
  }

  async function handleAction(action) {
    const report = activeDetail?.report;
    if (!report?.id) return;
    const note = document.getElementById("report-review-note").value.trim();
    if (action === "reject" && !note) {
      document.getElementById("report-action-message").textContent = "拒绝投稿前必须填写理由。";
      return;
    }
    if (action === "publish" && !window.confirm("确认以人工审核结果立即发布到 trrb.net？")) return;

    const buttons = [...document.querySelectorAll("[data-report-action]")];
    buttons.forEach((button) => { button.disabled = true; });
    document.getElementById("report-action-message").textContent = "正在处理…";
    try {
      const result = await callApi(action, {
        report_id: report.id,
        title: document.getElementById("report-edit-title").value.trim(),
        summary: document.getElementById("report-edit-summary").value.trim(),
        content: document.getElementById("report-edit-content").value.trim(),
        cover_path: document.querySelector('input[name="report-cover-path"]:checked')?.value || "",
        review_note: note
      });
      document.getElementById("report-action-message").textContent = action === "publish"
        ? `发布成功，文章ID：${result.article_id}`
        : "保存成功。";
      await Promise.all([loadReports(), typeof loadArticles === "function" ? loadArticles() : Promise.resolve()]);
      setTimeout(closeModal, 650);
    } catch (error) {
      console.error(error);
      document.getElementById("report-action-message").textContent = error.message;
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function openHashPageWhenReady() {
    if (location.hash !== "#ice-reports") return;
    const adminView = document.getElementById("admin-view");
    if (adminView && !adminView.classList.contains("hidden")) {
      showPage(PAGE);
      return;
    }
    const observer = new MutationObserver(() => {
      if (!adminView.classList.contains("hidden")) {
        observer.disconnect();
        showPage(PAGE);
      }
    });
    if (adminView) observer.observe(adminView, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    injectPage();
    openHashPageWhenReady();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
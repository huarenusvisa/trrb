(() => {
  "use strict";

  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const $ = (id) => document.getElementById(id);
  let currentUser = null;
  let reports = [];
  let status = "draft";
  let active = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  async function adminRecord(user) {
    let result = await client.from("admin_users").select("id,user_id,email,role,is_active")
      .eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!result.data && user.email) {
      result = await client.from("admin_users").select("id,user_id,email,role,is_active")
        .ilike("email", user.email).eq("is_active", true).maybeSingle();
    }
    const role = String(result.data?.role || "").toLowerCase();
    return ["owner","admin"].includes(role) ? result.data : null;
  }

  async function enter(user) {
    const admin = await adminRecord(user);
    if (!admin) {
      await client.auth.signOut();
      $("login-message").textContent = "这个账号没有随手拍审核权限。";
      return;
    }
    currentUser = user;
    $("login-view").classList.add("hidden");
    $("app-view").classList.remove("hidden");
    $("admin-info").textContent = `${user.email} · ${admin.role}`;
    await load();
  }

  async function api(action, payload = {}) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录已失效，请重新登录。");
    const response = await fetch("/.netlify/functions/ice-report-review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `审核接口失败（${response.status}）`);
    return result;
  }

  async function load() {
    $("status-message").textContent = "正在读取随手拍队列…";
    try {
      const all = await Promise.all(["draft","reviewing","published","rejected"].map((value) =>
        api("list", { status: value })
      ));
      reports = all.flatMap((item) => item.reports || []);
      updateCounts();
      render();
      $("status-message").textContent = `共读取 ${reports.length} 条线索。`;
    } catch (error) {
      console.error(error);
      $("status-message").textContent = `读取失败：${error.message}`;
    }
  }

  function updateCounts() {
    ["draft","reviewing","published","rejected"].forEach((value) => {
      $(`count-${value}`).textContent = reports.filter((item) => item.status === value).length;
    });
  }

  function firstMedia(report) {
    const item = Array.isArray(report.media) ? report.media[0] : null;
    if (!item) return `<div class="report-thumb">无素材</div>`;
    return `<div class="report-thumb">${String(item.mime_type).startsWith("video/") ? "视频" : "图片"}</div>`;
  }

  function render() {
    const list = reports.filter((item) => item.status === status);
    $("report-list").innerHTML = list.length ? list.map((report) => `
      <article class="report-card">
        ${firstMedia(report)}
        <div>
          <h3>${escapeHtml(report.location_text)}</h3>
          <p>${escapeHtml(String(report.event_description || "").slice(0, 180))}</p>
          <div class="meta">
            <span>事件日期 ${escapeHtml(report.report_date)}</span>
            <span>提交 ${escapeHtml(formatDate(report.created_at))}</span>
            <span>素材 ${Array.isArray(report.media) ? report.media.length : 0}个</span>
            ${report.article_id ? `<span>文章 ${escapeHtml(report.article_id)}</span>` : ""}
          </div>
        </div>
        <button onclick="TRRB_openReport('${escapeHtml(report.id)}')">查看并审核</button>
      </article>
    `).join("") : `<div class="empty">当前分类没有记录。</div>`;
  }

  window.TRRB_openReport = async (id) => {
    $("modal").classList.remove("hidden");
    $("action-message").textContent = "正在读取详情…";
    try {
      const detail = await api("detail", { report_id: id });
      active = detail;
      populate(detail);
    } catch (error) {
      $("action-message").textContent = error.message;
    }
  };

  function populate(detail) {
    const report = detail.report;
    const editorial = detail.editorial || {};
    $("modal-title").textContent = report.location_text || "审核随手拍";
    $("edit-title").value = report.admin_title || editorial.title || "";
    $("edit-summary").value = report.admin_summary || editorial.summary || "";
    $("edit-content").value = report.admin_content || editorial.content || "";
    $("review-note").value = report.review_note || "";
    $("action-message").textContent = "";

    $("report-facts").innerHTML = [
      ["事件日期", report.report_date],
      ["地点", report.location_text],
      ["提交时间", formatDate(report.created_at)],
      ["联系方式（不公开）", report.contact_info || "未提供"],
      ["原始描述", report.event_description],
      ["当前状态", report.status]
    ].map(([label,value]) => `<div class="fact"><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "-")}</span></div>`).join("");

    const media = report.signed_media || [];
    $("report-media").innerHTML = media.length ? media.map((item) =>
      String(item.mime_type).startsWith("video/")
        ? `<video controls src="${escapeHtml(item.url)}"></video>`
        : `<img src="${escapeHtml(item.url)}" alt="" loading="lazy">`
    ).join("") : `<div class="empty">没有上传照片或视频。</div>`;

    const images = media.filter((item) => String(item.mime_type).startsWith("image/"));
    $("cover-options").innerHTML = images.length ? images.map((item,index) => `
      <label class="cover-choice">
        <input type="radio" name="cover-path" value="${escapeHtml(item.path)}" ${(report.selected_cover_path === item.path || (!report.selected_cover_path && index === 0)) ? "checked" : ""}>
        <img src="${escapeHtml(item.url)}" alt="封面选项">
      </label>
    `).join("") : `<span>没有可用图片，文章将不设置封面。</span>`;
  }

  function close() {
    $("modal").classList.add("hidden");
    active = null;
  }

  async function action(name) {
    if (!active?.report?.id) return;
    if (name === "reject" && !$("review-note").value.trim()) {
      $("action-message").textContent = "拒绝前必须填写审核理由。";
      return;
    }
    if (name === "publish" && !confirm("确认审核通过并立即发布到trrb.net？")) return;

    const buttons = [...document.querySelectorAll("[data-action]")];
    buttons.forEach((button) => button.disabled = true);
    $("action-message").textContent = "正在处理…";
    try {
      const result = await api(name, {
        report_id: active.report.id,
        title: $("edit-title").value.trim(),
        summary: $("edit-summary").value.trim(),
        content: $("edit-content").value.trim(),
        cover_path: document.querySelector('input[name="cover-path"]:checked')?.value || "",
        review_note: $("review-note").value.trim()
      });
      $("action-message").textContent = name === "publish"
        ? `发布成功，文章ID：${result.article_id}`
        : "保存成功。";
      await load();
      setTimeout(close, 700);
    } catch (error) {
      console.error(error);
      $("action-message").textContent = error.message;
    } finally {
      buttons.forEach((button) => button.disabled = false);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      $("login-message").textContent = "正在登录…";
      const { data, error } = await client.auth.signInWithPassword({
        email: $("login-email").value.trim(),
        password: $("login-password").value
      });
      if (error) {
        $("login-message").textContent = `登录失败：${error.message}`;
        return;
      }
      await enter(data.user);
    });

    $("logout").addEventListener("click", async () => {
      await client.auth.signOut();
      location.reload();
    });
    $("refresh").addEventListener("click", load);
    document.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => {
        status = button.dataset.status;
        document.querySelectorAll("[data-status]").forEach((item) => item.classList.toggle("active", item === button));
        render();
      });
    });
    $("modal-close").addEventListener("click", close);
    $("modal-backdrop").addEventListener("click", close);
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => action(button.dataset.action));
    });

    const { data } = await client.auth.getSession();
    if (data.session?.user) await enter(data.session.user);
  });
})();

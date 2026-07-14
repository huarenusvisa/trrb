(() => {
  "use strict";

  const EDITOR_API = "/.netlify/functions/ice-report-editor";
  let activeReportId = "";
  let wrapped = false;

  function installStyles() {
    if (document.getElementById("submission-editor-styles")) return;
    const style = document.createElement("style");
    style.id = "submission-editor-styles";
    style.textContent = `
      .submission-editor-note{display:grid;gap:5px;margin:4px 0 16px;border:1px solid #93c5fd;border-radius:10px;padding:12px 14px;background:#eff6ff;color:#1e3a8a}
      .submission-editor-note strong{font-size:14px}.submission-editor-note span{font-size:13px;line-height:1.55}
      .submission-original-box{margin:10px 0 16px;border:1px solid #e2e8f0;border-radius:10px;padding:12px;background:#f8fafc;white-space:pre-wrap;line-height:1.65;color:#334155}
      .submission-keywords{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 14px}.submission-keywords span{padding:4px 9px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px}
      [data-report-action="unpublish"]{background:#7f1d1d;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700}
    `;
    document.head.appendChild(style);
  }

  function authToken() {
    return window.supabaseClient?.auth?.getSession().then(({ data }) => data.session?.access_token || "");
  }

  async function editorApi(action, payload = {}) {
    const token = await authToken();
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch(EDITOR_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `投稿编辑接口失败（${response.status}）`);
    return result;
  }

  function currentPayload() {
    return {
      report_id: activeReportId,
      title: document.getElementById("report-edit-title")?.value.trim() || "",
      summary: document.getElementById("report-edit-summary")?.value.trim() || "",
      content: document.getElementById("report-edit-content")?.value.trim() || "",
      review_note: document.getElementById("report-review-note")?.value.trim() || ""
    };
  }

  function extractPreview() {
    const source = `${document.getElementById("report-edit-title")?.value || ""} ${document.getElementById("report-edit-summary")?.value || ""} ${document.getElementById("report-edit-content")?.value || ""}`;
    const agencies = ["ICE", "HSI", "CBP", "DHS", "ERO"].filter((v) => source.toUpperCase().includes(v));
    const countries = ["中国", "哥伦比亚", "墨西哥", "印度", "委内瑞拉", "厄瓜多尔", "危地马拉", "洪都拉斯", "萨尔瓦多", "古巴", "海地", "巴西", "秘鲁", "多米尼加", "越南", "菲律宾"].filter((v) => source.includes(v));
    const people = source.match(/(?:逮捕|抓捕|拘留|羁押)(?:了|约|至少|超过|逾)?\s*(\d{1,3})\s*(?:名|人|位)/)?.[1]
      || source.match(/(\d{1,3})\s*(?:名|人|位)[^。；;]{0,14}(?:被逮捕|被捕|被拘留|遭拘留|落网|羁押)/)?.[1]
      || "未明确";
    const location = document.querySelector("#report-facts .report-fact:nth-child(2) span")?.textContent?.trim() || "地点待确认";
    return { agencies, countries, people, location };
  }

  function renderKeywords() {
    const body = document.querySelector("#report-modal .report-modal-body");
    if (!body) return;
    let box = document.getElementById("submission-keywords");
    if (!box) {
      box = document.createElement("div");
      box.id = "submission-keywords";
      box.className = "submission-keywords";
      document.getElementById("report-facts")?.insertAdjacentElement("afterend", box);
    }
    const facts = extractPreview();
    box.innerHTML = [
      `执法机构：${facts.agencies.join("、") || "待确认"}`,
      `地点：${facts.location}`,
      `拘留人数：${facts.people === "未明确" ? facts.people : `${facts.people}人`}`,
      `国家：${facts.countries.join("、") || "未提及"}`
    ].map((v) => `<span>${v}</span>`).join("");
  }

  async function saveEdited(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!activeReportId) return;
    const message = document.getElementById("report-action-message");
    message.textContent = "正在保存编辑内容…";
    try {
      const result = await editorApi("save", currentPayload());
      if (!document.getElementById("report-edit-title").value.trim() && result.suggested_title) document.getElementById("report-edit-title").value = result.suggested_title;
      message.textContent = "编辑内容和关键信息已保存。";
      renderKeywords();
    } catch (error) { message.textContent = error.message; }
  }

  async function unpublish(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (!activeReportId || !confirm("确认将这篇已发布投稿下线？下线后会从网站、地图和统计中移除，但投稿记录仍保留。")) return;
    const message = document.getElementById("report-action-message");
    message.textContent = "正在下线…";
    try {
      await editorApi("unpublish", { report_id: activeReportId });
      message.textContent = "已成功下线。";
      setTimeout(() => location.reload(), 700);
    } catch (error) { message.textContent = error.message; }
  }

  async function syncAfterPublish() {
    try { await editorApi("sync_published", currentPayload()); } catch (error) { console.error("发布后同步编辑内容失败", error); }
  }

  function installEditor() {
    installStyles();
    const title = document.getElementById("report-edit-title");
    const summary = document.getElementById("report-edit-summary");
    const content = document.getElementById("report-edit-content");
    if (!title || !summary || !content) return false;

    [title, summary, content].forEach((field) => {
      field.readOnly = false;
      field.removeAttribute("aria-readonly");
      field.classList.remove("original-submission-field");
      field.addEventListener("input", renderKeywords);
    });

    const oldNote = document.getElementById("original-submission-lock-note");
    if (oldNote) oldNote.remove();
    if (!document.getElementById("submission-editor-note")) {
      const note = document.createElement("div");
      note.id = "submission-editor-note";
      note.className = "submission-editor-note";
      note.innerHTML = "<strong>投稿原文保留，发布内容可编辑</strong><span>数据库中的用户原始投稿不会被覆盖。管理员可以修改发布标题、摘要和正文，并自动提取执法机构、地点、拘留人数及国籍。</span>";
      title.previousElementSibling?.insertAdjacentElement("beforebegin", note);
    }

    const save = document.querySelector('[data-report-action="save"]');
    if (save && !save.dataset.editorBound) {
      save.dataset.editorBound = "1";
      save.textContent = "保存编辑";
      save.addEventListener("click", saveEdited, true);
    }

    const publish = document.querySelector('[data-report-action="publish"]');
    if (publish && !publish.dataset.syncBound) {
      publish.dataset.syncBound = "1";
      publish.textContent = "编辑后立即发布";
      publish.addEventListener("click", () => setTimeout(syncAfterPublish, 1200));
    }

    let unpublishButton = document.querySelector('[data-report-action="unpublish"]');
    if (!unpublishButton && publish) {
      unpublishButton = document.createElement("button");
      unpublishButton.type = "button";
      unpublishButton.dataset.reportAction = "unpublish";
      unpublishButton.textContent = "下线已发布内容";
      unpublishButton.addEventListener("click", unpublish, true);
      publish.insertAdjacentElement("beforebegin", unpublishButton);
    }
    const status = [...document.querySelectorAll("#report-facts .report-fact")].find((node) => node.querySelector("b")?.textContent.includes("当前状态"))?.querySelector("span")?.textContent;
    if (unpublishButton) unpublishButton.style.display = status === "已发布" ? "inline-block" : "none";
    renderKeywords();
    return true;
  }

  function wrapOpen() {
    if (wrapped || typeof window.TRRB_openIntegratedReport !== "function") return;
    const original = window.TRRB_openIntegratedReport;
    window.TRRB_openIntegratedReport = async function (id) {
      activeReportId = String(id || "");
      const result = await original.apply(this, arguments);
      setTimeout(installEditor, 80);
      setTimeout(renderKeywords, 250);
      return result;
    };
    wrapped = true;
  }

  const observer = new MutationObserver(() => { wrapOpen(); installEditor(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setInterval(() => { wrapOpen(); installEditor(); if (wrapped) clearInterval(timer); }, 100);
})();

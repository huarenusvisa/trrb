(() => {
  "use strict";

  let installed = false;
  let observer = null;

  function installStyles() {
    if (document.getElementById("original-submission-lock-styles")) return;
    const style = document.createElement("style");
    style.id = "original-submission-lock-styles";
    style.textContent = `
      .original-submission-lock-note {
        display: grid;
        gap: 4px;
        margin: 4px 0 16px;
        border: 1px solid #86efac;
        border-radius: 10px;
        padding: 12px 14px;
        background: #f0fdf4;
        color: #166534;
      }
      .original-submission-lock-note strong { font-size: 14px; }
      .original-submission-lock-note span { font-size: 13px; line-height: 1.55; }
      .original-submission-field {
        border-color: #bbf7d0 !important;
        background: #f8fafc !important;
        color: #0f172a !important;
        cursor: default;
      }
      #report-edit-content.original-submission-field {
        min-height: 190px;
        white-space: pre-wrap;
      }
      @media (max-width: 640px) {
        .original-submission-lock-note { margin-bottom: 12px; padding: 10px 12px; }
        #report-edit-content.original-submission-field { min-height: 230px; font-size: 16px; line-height: 1.65; }
      }
    `;
    document.head.appendChild(style);
  }

  function setTextOnce(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function installOriginalSubmissionLock() {
    if (installed) return true;
    installStyles();

    const title = document.getElementById("report-edit-title");
    const summary = document.getElementById("report-edit-summary");
    const content = document.getElementById("report-edit-content");
    if (!title || !summary || !content) return false;

    installed = true;
    document.documentElement.dataset.originalSubmissionLockInstalled = "true";

    [title, summary, content].forEach((field) => {
      field.readOnly = true;
      field.setAttribute("aria-readonly", "true");
      field.classList.add("original-submission-field");
    });

    title.title = "发布标题直接使用用户提交的原文，不生成、不改写、不可人工编辑";
    summary.title = "摘要直接使用数据库保存的用户原始投稿，不生成、不改写";
    content.title = "正文直接使用数据库保存的用户原始投稿，不生成、不改写";

    const titleLabel = title.previousElementSibling;
    const summaryLabel = summary.previousElementSibling;
    const contentLabel = content.previousElementSibling;
    if (titleLabel?.tagName === "LABEL") setTextOnce(titleLabel, "用户原始标题（原样发布，只读）");
    if (summaryLabel?.tagName === "LABEL") setTextOnce(summaryLabel, "用户原始摘要（原样发布，只读）");
    if (contentLabel?.tagName === "LABEL") setTextOnce(contentLabel, "用户原始现场描述（原样发布，只读）");

    if (!document.getElementById("original-submission-lock-note")) {
      const note = document.createElement("div");
      note.id = "original-submission-lock-note";
      note.className = "original-submission-lock-note";
      note.innerHTML = "<strong>原文锁定已开启</strong><span>用户提交的标题、摘要和现场描述全部按数据库原文展示和发布。AI与管理员都不能生成、改写、删减或补充用户原文。</span>";
      titleLabel?.insertAdjacentElement("beforebegin", note);
    }

    const saveButton = document.querySelector('[data-report-action="save"]');
    setTextOnce(saveButton, "保存审核状态");

    const publishButton = document.querySelector('[data-report-action="publish"]');
    if (publishButton) {
      setTextOnce(publishButton, "原文立即发布");
      publishButton.title = "标题、摘要和正文都会从数据库重新读取用户原始投稿";
    }

    const pageDescription = document.querySelector("#ice-reports-page .report-head p");
    setTextOnce(pageDescription, "用户投稿不进入AI。后台只能核实、选择封面、填写内部说明、发布或拒绝；标题和正文全部按数据库原文发布。");

    return true;
  }

  observer = new MutationObserver(() => {
    if (installOriginalSubmissionLock()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const run = () => {
    if (installOriginalSubmissionLock()) observer.disconnect();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();

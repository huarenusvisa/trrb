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

    title.title = "标题只使用投稿者填写的地点生成，不调用AI，也不能人工改写";
    summary.title = "摘要直接来自数据库保存的用户原始投稿";
    content.title = "正文为用户原始投稿，发布接口会忽略任何前端改写";

    const titleLabel = title.previousElementSibling;
    const summaryLabel = summary.previousElementSibling;
    const contentLabel = content.previousElementSibling;
    if (titleLabel?.tagName === "LABEL") setTextOnce(titleLabel, "发布标题（依据用户填写地点自动生成）");
    if (summaryLabel?.tagName === "LABEL") setTextOnce(summaryLabel, "用户原始摘要（只读）");
    if (contentLabel?.tagName === "LABEL") setTextOnce(contentLabel, "用户原始现场描述（原样发布，只读）");

    if (!document.getElementById("original-submission-lock-note")) {
      const note = document.createElement("div");
      note.id = "original-submission-lock-note";
      note.className = "original-submission-lock-note";
      note.innerHTML = "<strong>原文锁定已开启</strong><span>AI不会处理此投稿；管理员只能审核、选择封面、填写内部说明、发布或拒绝，不能修改用户现场描述。</span>";
      titleLabel?.insertAdjacentElement("beforebegin", note);
    }

    const saveButton = document.querySelector('[data-report-action="save"]');
    setTextOnce(saveButton, "保存审核状态");

    const publishButton = document.querySelector('[data-report-action="publish"]');
    if (publishButton) {
      setTextOnce(publishButton, "原文立即发布");
      publishButton.title = "正文将从数据库重新读取用户原始投稿，前端字段不会改变发布内容";
    }

    const pageDescription = document.querySelector("#ice-reports-page .report-head p");
    setTextOnce(pageDescription, "用户投稿不进入AI。后台只负责核实、选择封面和决定发布；现场描述按数据库原文发布。");

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

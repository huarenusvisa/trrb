(() => {
  "use strict";

  function installOriginalSubmissionLock() {
    const title = document.getElementById("report-edit-title");
    const summary = document.getElementById("report-edit-summary");
    const content = document.getElementById("report-edit-content");
    if (!title || !summary || !content) return false;

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
    if (titleLabel?.tagName === "LABEL") titleLabel.textContent = "发布标题（依据用户填写地点自动生成）";
    if (summaryLabel?.tagName === "LABEL") summaryLabel.textContent = "用户原始摘要（只读）";
    if (contentLabel?.tagName === "LABEL") contentLabel.textContent = "用户原始现场描述（原样发布，只读）";

    if (!document.getElementById("original-submission-lock-note")) {
      const note = document.createElement("div");
      note.id = "original-submission-lock-note";
      note.className = "original-submission-lock-note";
      note.innerHTML = "<strong>原文锁定已开启</strong><span>AI不会处理此投稿；管理员只能审核、选择封面、填写内部说明、发布或拒绝，不能修改用户现场描述。</span>";
      titleLabel?.insertAdjacentElement("beforebegin", note);
    }

    const saveButton = document.querySelector('[data-report-action="save"]');
    if (saveButton) saveButton.textContent = "保存审核状态";

    const publishButton = document.querySelector('[data-report-action="publish"]');
    if (publishButton) {
      publishButton.textContent = "原文立即发布";
      publishButton.title = "正文将从数据库重新读取用户原始投稿，前端字段不会改变发布内容";
    }

    const pageDescription = document.querySelector("#ice-reports-page .report-head p");
    if (pageDescription) {
      pageDescription.textContent = "用户投稿不进入AI。后台只负责核实、选择封面和决定发布；现场描述按数据库原文发布。";
    }

    return true;
  }

  const observer = new MutationObserver(() => installOriginalSubmissionLock());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installOriginalSubmissionLock, { once: true });
  } else {
    installOriginalSubmissionLock();
  }
})();

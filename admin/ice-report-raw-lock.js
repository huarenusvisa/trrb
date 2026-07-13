(() => {
  "use strict";

  const ENDPOINT = "/.netlify/functions/ice-report-integrated";
  const originalFetch = window.fetch.bind(window);
  const originalById = new Map();

  function clean(value) {
    return String(value ?? "").trim();
  }

  function rawTitle(report) {
    const location = clean(report?.location_text) || "地点待确认";
    return `${location}ICE执法线索`;
  }

  function rawSummary(report) {
    return clean(report?.event_description).replace(/\s+/g, " ").slice(0, 300);
  }

  function rawContent(report) {
    return clean(report?.event_description);
  }

  window.fetch = async function lockedUserReportFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url.includes(ENDPOINT) || String(init.method || "GET").toUpperCase() !== "POST") {
      return originalFetch(input, init);
    }

    let payload = null;
    try { payload = JSON.parse(init.body || "{}"); } catch {}

    if (payload?.action === "publish" && payload.report_id) {
      const report = originalById.get(String(payload.report_id));
      if (report) {
        payload.title = rawTitle(report);
        payload.summary = rawSummary(report);
        payload.content = rawContent(report);
        init = { ...init, body: JSON.stringify(payload) };
      }
    }

    const response = await originalFetch(input, init);

    if (payload?.action !== "detail" || !response.ok) return response;

    const cloned = response.clone();
    let data = null;
    try { data = await cloned.json(); } catch { return response; }
    const report = data?.report;
    if (!report?.id) return response;

    originalById.set(String(report.id), report);
    data.editorial = {
      title: rawTitle(report),
      summary: rawSummary(report),
      content: rawContent(report)
    };

    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => {
      const title = document.getElementById("report-edit-title");
      const summary = document.getElementById("report-edit-summary");
      const content = document.getElementById("report-edit-content");
      if (!title || !summary || !content) return;

      title.readOnly = true;
      summary.readOnly = true;
      content.readOnly = true;
      title.title = "按用户原始投稿生成地点标题，发布时不可由AI改写";
      summary.title = "来自用户原始描述，发布时不可由AI改写";
      content.title = "用户原始投稿内容，人工同意后原样发布";

      const titleLabel = title.previousElementSibling;
      const summaryLabel = summary.previousElementSibling;
      const contentLabel = content.previousElementSibling;
      if (titleLabel?.tagName === "LABEL") titleLabel.textContent = "发布标题（依据投稿地点，不使用AI）";
      if (summaryLabel?.tagName === "LABEL") summaryLabel.textContent = "用户原始摘要（只读）";
      if (contentLabel?.tagName === "LABEL") contentLabel.textContent = "用户原始投稿内容（原样发布）";
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

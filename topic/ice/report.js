(() => {
  "use strict";

  const MAX_FILES = 5;
  const IMAGE_MAX = 15 * 1024 * 1024;
  const VIDEO_MAX = 80 * 1024 * 1024;
  const ALLOWED = new Set([
    "image/jpeg","image/png","image/webp","image/gif","image/heic","image/heif",
    "video/mp4","video/quicktime","video/webm"
  ]);

  const $ = (id) => document.getElementById(id);
  let files = [];
  let objectUrls = [];

  function nyDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function openModal() {
    $("snapshot-modal").classList.remove("hidden");
    document.body.classList.add("snapshot-open");
    $("snapshot-date").value ||= nyDate();
    setTimeout(() => $("snapshot-location").focus(), 80);
  }

  function closeModal() {
    if ($("snapshot-submit").disabled) return;
    $("snapshot-modal").classList.add("hidden");
    document.body.classList.remove("snapshot-open");
  }

  function resetForm() {
    $("snapshot-form").reset();
    $("snapshot-date").value = nyDate();
    $("snapshot-form").classList.remove("hidden");
    $("snapshot-success").classList.add("hidden");
    $("snapshot-message").textContent = "";
    $("snapshot-progress").classList.add("hidden");
    $("snapshot-progress-bar").style.width = "0%";
    files = [];
    clearObjectUrls();
    renderPreview();
  }

  function clearObjectUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  function validateFile(file) {
    if (!ALLOWED.has(file.type)) return `不支持文件类型：${file.name}`;
    const max = file.type.startsWith("video/") ? VIDEO_MAX : IMAGE_MAX;
    if (file.size > max) {
      return `${file.name} 超过${file.type.startsWith("video/") ? "80MB" : "15MB"}`;
    }
    return "";
  }

  function addFiles(selected) {
    const merged = [...files];
    for (const file of selected) {
      if (merged.length >= MAX_FILES) break;
      const error = validateFile(file);
      if (error) {
        $("snapshot-message").textContent = error;
        continue;
      }
      const duplicate = merged.some((item) =>
        item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
      );
      if (!duplicate) merged.push(file);
    }
    files = merged.slice(0, MAX_FILES);
    if (selected.length + files.length > MAX_FILES) {
      $("snapshot-message").textContent = "最多只能选择5个文件。";
    }
    renderPreview();
  }

  function renderPreview() {
    clearObjectUrls();
    $("snapshot-preview").innerHTML = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const media = file.type.startsWith("video/")
        ? `<video src="${url}" muted playsinline></video>`
        : `<img src="${url}" alt="">`;
      return `
        <article class="snapshot-media-card">
          ${media}
          <button class="snapshot-media-remove" type="button" data-remove="${index}" aria-label="移除">×</button>
          <span>${escapeHtml(file.name)}</span>
        </article>
      `;
    }).join("");

    document.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        files.splice(Number(button.dataset.remove), 1);
        renderPreview();
      });
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(action, payload) {
    const response = await fetch("/.netlify/functions/ice-report", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `提交接口错误（${response.status}）`);
    return result;
  }

  async function uploadFile(file, index, total) {
    setProgress(Math.round((index / Math.max(1, total)) * 75), `正在上传 ${index + 1}/${total}：${file.name}`);
    const prepared = await api("prepare_upload", {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size
    });

    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file, file.name);

    const upload = await fetch(prepared.signed_url, {
      method: "PUT",
      headers: { "x-upsert": "false" },
      body: form
    });

    if (!upload.ok) {
      const detail = await upload.text().catch(() => "");
      throw new Error(`文件上传失败：${file.name}${detail ? `（${detail.slice(0, 120)}）` : ""}`);
    }

    return {
      path: prepared.path,
      original_name: file.name.slice(0, 180),
      mime_type: file.type,
      size: file.size
    };
  }

  function setProgress(percent, text) {
    $("snapshot-progress").classList.remove("hidden");
    $("snapshot-progress-bar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
    $("snapshot-progress-text").textContent = text;
  }

  async function submit(event) {
    event.preventDefault();
    $("snapshot-message").textContent = "";

    const date = $("snapshot-date").value;
    const location = $("snapshot-location").value.trim();
    const description = $("snapshot-event").value.trim();
    const contact = $("snapshot-contact").value.trim();

    if (!date || location.length < 3 || description.length < 10) {
      $("snapshot-message").textContent = "请完整填写日期、地点和事件（事件至少10个字）。";
      return;
    }
    if (!$("snapshot-consent").checked) {
      $("snapshot-message").textContent = "请先确认内容真实并同意审核发布。";
      return;
    }

    $("snapshot-submit").disabled = true;
    $("snapshot-submit").textContent = "正在提交…";

    try {
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        uploaded.push(await uploadFile(files[index], index, files.length));
      }

      setProgress(88, "正在保存线索并进入审核队列…");
      const result = await api("submit", {
        report_date: date,
        location_text: location,
        event_description: description,
        contact_info: contact,
        media: uploaded,
        website: $("snapshot-website").value
      });

      setProgress(100, "提交完成");
      $("snapshot-form").classList.add("hidden");
      $("snapshot-success").classList.remove("hidden");
      $("snapshot-receipt").textContent = result.receipt_id || result.id || "-";
    } catch (error) {
      console.error(error);
      $("snapshot-message").textContent = error.message || "提交失败，请稍后再试。";
      $("snapshot-progress").classList.add("hidden");
    } finally {
      $("snapshot-submit").disabled = false;
      $("snapshot-submit").textContent = "提交审核";
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("snapshot-date").value = nyDate();
    $("snapshot-open")?.addEventListener("click", openModal);
    $("snapshot-close")?.addEventListener("click", closeModal);
    $("snapshot-backdrop")?.addEventListener("click", closeModal);
    $("snapshot-done")?.addEventListener("click", () => {
      closeModal();
      resetForm();
    });
    $("snapshot-media")?.addEventListener("change", (event) => {
      addFiles([...event.target.files]);
      event.target.value = "";
    });
    $("snapshot-form")?.addEventListener("submit", submit);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("snapshot-modal").classList.contains("hidden")) closeModal();
    });
  });
})();

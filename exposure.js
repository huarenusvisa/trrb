const EXPOSURE_SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const EXPOSURE_SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const exposureDb = window.supabase.createClient(EXPOSURE_SUPABASE_URL, EXPOSURE_SUPABASE_KEY);
const grid = document.querySelector("#exposure-grid");
const dialog = document.querySelector("#exposure-dialog");
const form = document.querySelector("#exposure-form");
const filesInput = document.querySelector("#exposure-files");
const fileList = document.querySelector("#exposure-file-list");
const progress = document.querySelector("#exposure-progress");
const message = document.querySelector("#exposure-message");
const loadMore = document.querySelector("#exposure-load-more");
let offset = 0;
let query = "";
let loading = false;
let totalLoaded = 0;

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const formatDate = (value) => value ? new Date(value).toLocaleString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";

function mediaCover(post) {
  const media = post.media?.[0];
  if (!media) return `<div class="exposure-placeholder"><b>我要曝光</b><span>网友公开投稿</span></div>`;
  if (media.media_type === "video") return `<div class="exposure-video-cover"><video src="${esc(media.media_url)}#t=0.1" preload="metadata" muted playsinline></video><span>▶ 视频</span></div>`;
  return `<img src="${esc(media.media_url)}" alt="" loading="lazy" decoding="async" />`;
}

function card(post) {
  const status = post.status === "disputed" ? "内容存在争议" : post.status === "resolved" ? "事件已解决" : "网友公开投稿";
  return `<article class="exposure-card">
    <a class="exposure-card-media" href="./exposure-post.html?id=${encodeURIComponent(post.id)}">${mediaCover(post)}</a>
    <div class="exposure-card-body">
      <span class="exposure-status status-${esc(post.status)}">${status}</span>
      <h2><a href="./exposure-post.html?id=${encodeURIComponent(post.id)}">${esc(post.title)}</a></h2>
      <p>${esc(post.body).slice(0, 130)}${post.body?.length > 130 ? "…" : ""}</p>
      <div><span>${esc(post.author_name || "匿名投稿人")}</span><time>${formatDate(post.published_at)}</time></div>
    </div>
  </article>`;
}

async function loadPosts(reset = false) {
  if (loading) return;
  loading = true;
  if (reset) { offset = 0; totalLoaded = 0; grid.innerHTML = ""; }
  loadMore.textContent = "正在加载...";
  try {
    const params = new URLSearchParams({ limit: "18", offset: String(offset) });
    if (query) params.set("q", query);
    const res = await fetch(`/.netlify/functions/exposure-feed?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "读取失败");
    const posts = data.posts || [];
    grid.insertAdjacentHTML("beforeend", posts.map(card).join(""));
    offset += posts.length;
    totalLoaded += posts.length;
    document.querySelector("#exposure-count").textContent = `已显示 ${totalLoaded} 条公开投稿`;
    loadMore.hidden = posts.length < 18;
    if (!totalLoaded) grid.innerHTML = `<div class="exposure-empty">暂无公开投稿，您可以发布第一条曝光。</div>`;
  } catch (error) {
    grid.innerHTML = `<div class="exposure-empty">加载失败：${esc(error.message)}</div>`;
  } finally {
    loading = false;
    loadMore.textContent = "加载更多";
  }
}

function selectedFiles() { return Array.from(filesInput.files || []); }
function validateFiles(files) {
  if (files.length > 12) throw new Error("最多上传12个文件");
  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) throw new Error(`不支持文件：${file.name}`);
    const max = isVideo ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) throw new Error(`${file.name} 超过${isVideo ? "200MB" : "10MB"}`);
  }
}
function renderFiles() {
  try {
    const files = selectedFiles(); validateFiles(files);
    fileList.innerHTML = files.map(file => `<div><b>${esc(file.name)}</b><span>${(file.size / 1024 / 1024).toFixed(1)}MB · ${file.type.startsWith("video/") ? "视频" : "图片"}</span></div>`).join("");
  } catch (error) { filesInput.value = ""; fileList.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
}

function safeName(name) {
  const ext = String(name).split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${Date.now()}-${crypto.randomUUID()}.${ext}`;
}
async function uploadFiles(files) {
  validateFiles(files);
  const group = crypto.randomUUID();
  const uploaded = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    progress.classList.remove("hidden");
    progress.textContent = `正在上传 ${i + 1}/${files.length}：${file.name}`;
    const storagePath = `pending/${group}/${safeName(file.name)}`;
    const { error } = await exposureDb.storage.from("exposure-media").upload(storagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw new Error(`上传失败：${error.message}`);
    uploaded.push({ storagePath, mediaType: file.type.startsWith("video/") ? "video" : "image", fileName: file.name, mimeType: file.type, sizeBytes: file.size });
  }
  return uploaded;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const fd = new FormData(form);
    const media = await uploadFiles(selectedFiles());
    progress.textContent = "媒体上传完成，正在发布...";
    const payload = {
      title: fd.get("title"), targetName: fd.get("targetName"), location: fd.get("location"), happenedAt: fd.get("happenedAt"),
      authorName: fd.get("authorName"), authorContact: fd.get("authorContact"), anonymous: fd.get("anonymous") === "on",
      body: fd.get("body"), disclaimerAccepted: fd.get("disclaimerAccepted") === "on", media
    };
    const res = await fetch("/.netlify/functions/exposure-submit", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "发布失败");
    message.className = "exposure-message success";
    message.textContent = "发布成功，正在打开内容...";
    location.href = data.url;
  } catch (error) {
    message.className = "exposure-message error";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    progress.classList.add("hidden");
  }
});

document.querySelectorAll("[data-open-exposure]").forEach(btn => btn.addEventListener("click", () => dialog.showModal()));
document.querySelectorAll("[data-close-exposure]").forEach(btn => btn.addEventListener("click", () => dialog.close()));
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
filesInput.addEventListener("change", renderFiles);
loadMore.addEventListener("click", () => loadPosts(false));
document.querySelector("#exposure-search-form").addEventListener("submit", event => { event.preventDefault(); query = document.querySelector("#exposure-search").value.trim(); loadPosts(true); });
loadPosts(true);

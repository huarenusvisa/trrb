const detailRoot = document.querySelector("#exposure-detail");
const commentsRoot = document.querySelector("#comment-list");
const commentForm = document.querySelector("#comment-form");
const commentMessage = document.querySelector("#comment-message");
const postId = new URLSearchParams(location.search).get("id") || "";
let currentPost = null;
let currentComments = [];
const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const dt = value => value ? new Date(value).toLocaleString("zh-CN", { year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" }) : "";

function mediaHtml(media) {
  return (media || []).map(item => item.media_type === "video"
    ? `<figure><video controls playsinline preload="metadata" src="${esc(item.media_url)}"></video><figcaption>${esc(item.file_name || "投稿视频")}</figcaption></figure>`
    : `<figure><img src="${esc(item.media_url)}" alt="投稿图片" loading="lazy" /><figcaption>${esc(item.file_name || "投稿图片")}</figcaption></figure>`).join("");
}
function statusText(status) { return status === "disputed" ? "内容存在争议" : status === "resolved" ? "事件已解决" : "网友公开投稿"; }
function renderPost(post) {
  document.title = `${post.title}｜我要曝光｜唐人日报`;
  detailRoot.innerHTML = `
    <header class="exposure-detail-head">
      <span class="exposure-status status-${esc(post.status)}">${statusText(post.status)}</span>
      <h1>${esc(post.title)}</h1>
      <div><span>${esc(post.author_name || "匿名投稿人")}</span><time>${dt(post.published_at)}</time></div>
    </header>
    <div class="exposure-responsibility">本内容由当事人投稿并主动公开，相关事实陈述、图片、视频及责任由投稿人承担。被涉及方可向唐人日报提交回应、证据、更正或撤稿要求。</div>
    <dl class="exposure-facts">
      ${post.target_name ? `<div><dt>被曝光对象</dt><dd>${esc(post.target_name)}</dd></div>` : ""}
      ${post.location ? `<div><dt>发生地点</dt><dd>${esc(post.location)}</dd></div>` : ""}
      ${post.happened_at ? `<div><dt>发生日期</dt><dd>${esc(post.happened_at)}</dd></div>` : ""}
    </dl>
    <div class="exposure-body">${esc(post.body).replace(/\n/g,"<br>")}</div>
    ${post.media?.length ? `<section class="exposure-media-gallery">${mediaHtml(post.media)}</section>` : ""}
    <div class="exposure-contact-note">被曝光方回应、证据、更正或撤稿申请：<a href="mailto:tangrenribao@gmail.com">tangrenribao@gmail.com</a></div>`;
}
function roleLabel(role) { return role === "subject" ? "当事人回应" : role === "author" ? "投稿人回复" : role === "admin" ? "唐人日报" : "网友"; }
function renderComments() {
  document.querySelector("#comment-count").textContent = `${currentComments.length}条`;
  commentsRoot.innerHTML = currentComments.length ? currentComments.map(c => `<article class="comment-item">
    <header><b>${esc(c.nickname)}</b><span class="comment-role role-${esc(c.role)}">${roleLabel(c.role)}</span><time>${dt(c.created_at)}</time></header>
    <p>${esc(c.body).replace(/\n/g,"<br>")}</p>
  </article>`).join("") : `<div class="exposure-empty">还没有评论，欢迎发表第一条评论。</div>`;
}
async function load() {
  if (!postId) { detailRoot.innerHTML = `<div class="exposure-empty">缺少内容ID。</div>`; return; }
  try {
    const res = await fetch(`/.netlify/functions/exposure-detail?id=${encodeURIComponent(postId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "读取失败");
    currentPost = data.post; currentComments = data.comments || [];
    renderPost(currentPost); renderComments();
  } catch (error) { detailRoot.innerHTML = `<div class="exposure-empty">${esc(error.message)}</div>`; commentForm.hidden = true; }
}
commentForm.addEventListener("submit", async event => {
  event.preventDefault(); commentMessage.textContent = "";
  const button = commentForm.querySelector("button"); button.disabled = true;
  try {
    const fd = new FormData(commentForm);
    const res = await fetch("/.netlify/functions/exposure-comment", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ postId, nickname:fd.get("nickname"), email:fd.get("email"), body:fd.get("body") }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "评论失败");
    currentComments.push(data.comment); renderComments(); commentForm.reset();
    commentMessage.className = "exposure-message success"; commentMessage.textContent = "评论已发布。";
  } catch (error) { commentMessage.className = "exposure-message error"; commentMessage.textContent = error.message; }
  finally { button.disabled = false; }
});
load();

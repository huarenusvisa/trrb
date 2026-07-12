
const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const OWNER_EMAIL = "tangrenribao@gmail.com";
const OWNER_UID = "4c491ee3-a9f0-42c9-9bee-1abb52b20b01";
const ARTICLE_IMAGE_BUCKET = "article-images";
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const el = (id) => document.getElementById(id);
let currentUser = null;
let currentAdmin = null;
let categories = [];
let selectedCoverFile = null;
let selectedCoverObjectUrl = "";
let currentEditingArticleId = null;
let currentEditingArticle = null;

document.addEventListener("DOMContentLoaded", init);

// 后台永远使用最新静态文件，清理旧 Service Worker / Cache Storage。
async function clearLegacyBrowserCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("清理旧缓存失败，不影响继续登录：", error);
  }
}

async function init() {
  await clearLegacyBrowserCaches();
  bindEvents();
  const { data } = await supabaseClient.auth.getSession();
  if (data.session?.user) {
    await enterAdmin(data.session.user);
  }
}

function bindEvents() {
  el("login-form").addEventListener("submit", handleLogin);
  el("logout-btn").addEventListener("click", handleLogout);

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });

  el("article-form").addEventListener("submit", handleSaveArticle);
  el("refresh-articles").addEventListener("click", loadArticles);
  el("refresh-rankings").addEventListener("click", loadRankings);
  el("refresh-logs")?.addEventListener("click", loadAutomationLogs);
  el("refresh-drafts")?.addEventListener("click", loadDrafts);
  el("source-form")?.addEventListener("submit", saveNewsSource);
  el("refresh-sources")?.addEventListener("click", loadNewsSources);
  el("article-cancel-edit")?.addEventListener("click", resetArticleEditor);
  el("article-cover-file").addEventListener("change", handleCoverSelection);
  el("article-cover-remove").addEventListener("click", clearCoverSelection);
  el("article-cover-paste-zone").addEventListener("paste", handleCoverPaste);
  el("article-cover-paste-zone").addEventListener("focus", () => el("article-cover-paste-zone").classList.add("is-paste-active"));
  el("article-cover-paste-zone").addEventListener("blur", () => el("article-cover-paste-zone").classList.remove("is-paste-active"));
  el("generate-summary").addEventListener("click", () => {
    el("article-summary").value = generateSummary(el("article-content").value, el("article-title").value);
  });
  el("generate-seo").addEventListener("click", () => {
    const categoryName = el("article-category").selectedOptions?.[0]?.textContent || "";
    el("article-seo-keywords").value = generateSeoKeywords(el("article-title").value, categoryName, el("article-content").value);
  });
  el("generate-ai-cover")?.addEventListener("click", () => generateAiCover());
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginMessage("正在登录...");
  const email = el("login-email").value.trim().toLowerCase();
  const password = el("login-password").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setLoginMessage("登录失败：" + error.message);
    return;
  }

  await enterAdmin(data.user);
}

async function enterAdmin(user) {
  currentUser = user;
  setLoginMessage("正在验证后台权限...");

  const admin = await getAdminRecord(user);
  if (!admin) {
    await supabaseClient.auth.signOut();
    setLoginMessage(
      "这个账号没有后台权限。\n" +
      "当前登录 UID: " + user.id + "\n" +
      "当前邮箱: " + (user.email || "") + "\n" +
      "请确认 admin_users.user_id 是否一致。"
    );
    return;
  }

  currentAdmin = admin;
  el("login-view").classList.add("hidden");
  el("admin-view").classList.remove("hidden");
  el("admin-info").textContent = `${user.email} · ${admin.role}`;
  await Promise.all([loadCategories(), loadArticles(), loadDrafts(), loadRankings(), loadAutomationLogs(), loadNewsSources()]);
  showPage("dashboard");
}

async function getAdminRecord(user) {
  // 正确字段是 user_id，不是 admin_users.id。v2 已修复这一点。
  let { data, error } = await supabaseClient
    .from("admin_users")
    .select("id,user_id,email,role,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Admin check by user_id failed:", error);
  }
  if (data && ["owner", "admin"].includes(String(data.role || "").toLowerCase())) return data;

  // 备用：如果早期表里 user_id 没写对，用邮箱再核对一次。
  const fallback = await supabaseClient
    .from("admin_users")
    .select("id,user_id,email,role,is_active")
    .ilike("email", String(user.email || "").trim())
    .eq("is_active", true)
    .maybeSingle();

  if (fallback.error) {
    console.error("Admin check by email failed:", fallback.error);
  }
  if (fallback.data && ["owner", "admin"].includes(String(fallback.data.role || "").toLowerCase())) return fallback.data;

  // 最后保险：只允许这一个 Supabase Auth UID 进入 UI。数据库写入仍然受 RLS 控制。
  if (user.id === OWNER_UID && String(user.email || "").trim().toLowerCase() === OWNER_EMAIL) {
    return { user_id: OWNER_UID, email: OWNER_EMAIL, role: "owner", is_active: true };
  }

  return null;
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

function showPage(page) {
  const titles = {
    dashboard: "控制台",
    articles: "文章管理",
    "new-article": "发布文章",
    rankings: "24小时热榜",
    drafts: "待审核草稿",
    sources: "来源管理",
    logs: "自动化日志"
  };

  document.querySelectorAll(".page").forEach((item) => item.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  el(`${page}-page`).classList.remove("hidden");
  el("page-title").textContent = titles[page] || "控制台";
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("id,name,slug,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  categories = data || [];
  el("article-category").innerHTML = categories
    .map((item) => `<option value="${item.id}" data-name="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`)
    .join("");
}

async function loadArticles() {
  const { data, error } = await supabaseClient
    .from("articles")
    .select("id,title,category_name,status,published_at,created_at,ai_confidence,ai_review_reason,automation_source,source_name")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    el("articles-tbody").innerHTML = `<tr><td colspan="5">文章读取失败：${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const articles = data || [];
  el("count-articles").textContent = articles.length;
  el("count-published").textContent = articles.filter((item) => item.status === "published").length;
  el("count-draft").textContent = articles.filter((item) => item.status === "draft").length;

  el("articles-tbody").innerHTML = articles.length
    ? articles.map(renderArticleRow).join("")
    : `<tr><td colspan="5">暂无文章。可以先发布一篇测试文章。</td></tr>`;
}

function renderArticleRow(article) {
  return `
    <tr>
      <td><b>${escapeHtml(article.title)}</b><br><small>${article.id}</small></td>
      <td>${escapeHtml(article.category_name || "-")}</td>
      <td><span class="status-pill status-${article.status}">${statusLabel(article.status)}</span></td>
      <td>${escapeHtml(formatDate(article.published_at || article.created_at))}</td>
      <td>
        <button class="small-btn" onclick="editArticle('${article.id}')">编辑</button>
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','published')">发布</button>
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','draft')">草稿</button>
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','hidden')">隐藏</button>
        ${article.ai_review_reason ? `<br><small class="review-note">AI：${escapeHtml(article.ai_review_reason)}</small>` : ""}
      </td>
    </tr>
  `;
}

window.editArticle = async function (id) {
  const { data, error } = await supabaseClient
    .from("articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    alert("读取文章失败：" + (error?.message || "文章不存在"));
    return;
  }
  currentEditingArticleId = id;
  currentEditingArticle = article;
  el("article-title").value = data.title || "";
  el("article-summary").value = data.summary || "";
  el("article-content").value = data.content || "";
  el("article-cover").value = data.cover_image || "";
  el("article-seo-keywords").value = data.seo_keywords || "";
  el("article-author").value = data.author || "Tang Ren Daily";
  el("article-status").value = data.status || "draft";
  const categoryOption = [...el("article-category").options].find(option => option.value === data.category_id || option.textContent === data.category_name);
  if (categoryOption) el("article-category").value = categoryOption.value;
  el("article-source-url").value = data.source_url || "";
  el("article-review-reason").value = data.ai_review_reason || "";
  el("article-confidence").value = data.ai_confidence ?? "";
  el("article-submit").textContent = "保存修改";
  el("article-cancel-edit").classList.remove("hidden");
  el("editor-mode-label").textContent = "正在编辑已存在文章";
  if (data.cover_image) {
    el("article-cover-preview").src = data.cover_image;
    el("article-cover-preview-wrap").classList.remove("hidden");
  }
  showPage("new-article");
};

function resetArticleEditor() {
  currentEditingArticleId = null;
  currentEditingArticle = null;
  el("article-form").reset();
  el("article-author").value = "Tang Ren Daily";
  el("article-submit").textContent = "保存文章";
  el("article-cancel-edit").classList.add("hidden");
  el("editor-mode-label").textContent = "新建文章";
  clearCoverSelection();
}

window.changeArticleStatus = async function (id, status) {
  const patch = { status };
  if (status === "published") patch.published_at = new Date().toISOString();

  const { error } = await supabaseClient.from("articles").update(patch).eq("id", id);
  if (error) {
    alert("更新失败：" + error.message);
    return;
  }
  await loadArticles();
};

async function handleSaveArticle(event) {
  event.preventDefault();
  const selected = el("article-category");
  const categoryName = selected.options[selected.selectedIndex]?.textContent || "";
  const title = el("article-title").value.trim();
  const status = el("article-status").value;
  const submitButton = el("article-submit");

  submitButton.disabled = true;
  el("article-message").textContent = selectedCoverFile ? "正在压缩并上传封面图片..." : "正在保存...";

  try {
    let coverImage = el("article-cover").value.trim();
    if (selectedCoverFile) {
      coverImage = await uploadCoverImage(selectedCoverFile, title);
      el("article-cover").value = coverImage;
    }

    const content = el("article-content").value.trim();
    if (!coverImage && status === "published" && el("auto-ai-cover")?.checked) {
      coverImage = await generateAiCover({ silent: true });
      el("article-cover").value = coverImage || "";
    }
    const summary = el("article-summary").value.trim() || generateSummary(content, title);
    const seoKeywords = el("article-seo-keywords").value.trim() || generateSeoKeywords(title, categoryName, content);
    el("article-summary").value = summary;
    el("article-seo-keywords").value = seoKeywords;

    const payload = {
      title,
      slug: currentEditingArticleId && currentEditingArticle?.slug ? currentEditingArticle.slug : makeSlug(title),
      summary,
      content,
      category_id: selected.value || null,
      category_name: categoryName,
      cover_image: coverImage,
      seo_keywords: seoKeywords,
      author: el("article-author").value.trim() || "Tang Ren Daily",
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      source_url: el("article-source-url").value.trim(),
      ai_review_reason: el("article-review-reason").value.trim(),
      ai_confidence: Number(el("article-confidence").value || 0),
      updated_at: new Date().toISOString()
    };

    el("article-message").textContent = "图片上传完成，正在保存文章...";
    const query = currentEditingArticleId
      ? supabaseClient.from("articles").update(payload).eq("id", currentEditingArticleId)
      : supabaseClient.from("articles").insert(payload);
    const { error } = await query;
    if (error) throw error;

    el("article-message").textContent = currentEditingArticleId ? "文章修改已保存。" : "文章已保存，封面图片已本地化。";
    resetArticleEditor();
    await loadArticles();
    showPage("articles");
  } catch (error) {
    console.error(error);
    el("article-message").textContent = "保存失败：" + (error?.message || String(error));
  } finally {
    submitButton.disabled = false;
    el("article-cover-progress").classList.add("hidden");
  }
}

async function generateAiCover(options = {}) {
  const progress = el("ai-cover-progress");
  const title = el("article-title").value.trim();
  const content = el("article-content").value.trim();
  const summary = el("article-summary").value.trim() || generateSummary(content, title);
  const category = el("article-category").selectedOptions?.[0]?.textContent || "新闻";
  if (!title) { if (!options.silent) alert("请先填写文章标题。"); return ""; }
  progress?.classList.remove("hidden");
  if (progress) progress.textContent = "正在生成 16:9 AI 新闻封面，通常需要 15–60 秒…";
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    const response = await fetch("/.netlify/functions/generate-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, category, summary, content: content.slice(0, 4000) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `AI 封面生成失败（${response.status}）`);
    if (!result.url) throw new Error("AI 接口没有返回图片地址。");
    el("article-cover").value = result.url;
    el("article-cover-preview").src = result.url;
    el("article-cover-preview-wrap").classList.remove("hidden");
    if (progress) progress.textContent = "AI 封面生成并本地化成功。";
    return result.url;
  } catch (error) {
    console.error(error);
    if (progress) progress.textContent = `AI 封面失败：${error.message}`;
    if (!options.silent) alert(`AI 封面失败：${error.message}`);
    return "";
  }
}

function handleCoverPaste(event) {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (imageItem) {
    event.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: blob.type });
    setSelectedCoverFile(file);
    return;
  }

  const pastedText = event.clipboardData?.getData("text/plain")?.trim() || "";
  if (/^https?:\/\//i.test(pastedText)) {
    event.preventDefault();
    el("article-cover").value = pastedText;
    el("article-cover-progress").textContent = "已粘贴外部图片链接。";
    el("article-cover-progress").classList.remove("hidden");
  }
}

function setSelectedCoverFile(file) {
  if (!file?.type?.startsWith("image/")) {
    alert("请选择或粘贴 JPG、PNG、WebP 或 GIF 图片。");
    return;
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    alert("原图不能超过 15MB，请先缩小图片。");
    return;
  }

  selectedCoverFile = file;
  if (selectedCoverObjectUrl) URL.revokeObjectURL(selectedCoverObjectUrl);
  selectedCoverObjectUrl = URL.createObjectURL(file);
  el("article-cover-preview").src = selectedCoverObjectUrl;
  el("article-cover-preview-wrap").classList.remove("hidden");
  el("article-cover-progress").textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)}MB`;
  el("article-cover-progress").classList.remove("hidden");
  el("article-cover").value = "";
}

function generateSummary(content, title = "") {
  const clean = String(content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return String(title || "").trim();
  const sentences = clean.split(/(?<=[。！？!?])\s*/).filter(Boolean);
  let summary = "";
  for (const sentence of sentences) {
    if ((summary + sentence).length > 135 && summary.length >= 60) break;
    summary += sentence;
  }
  summary = (summary || clean.slice(0, 130)).trim();
  return summary.length > 150 ? `${summary.slice(0, 147)}…` : summary;
}

function generateSeoKeywords(title, category, content) {
  const stop = new Set(["我们","他们","以及","一个","这个","那个","目前","已经","进行","表示","指出","认为","相关","报道","消息","记者","唐人日报","中国","美国","新闻","文章","情况","问题","可以","没有","因为","但是","如果","其中","对于","通过","正在"]);
  const scores = new Map();
  const add = (term, score) => {
    const value = String(term || "").trim().replace(/^[,，。；;：:\s]+|[,，。；;：:\s]+$/g, "");
    if (!value || value.length < 2 || value.length > 18 || stop.has(value) || /^\d+$/.test(value)) return;
    scores.set(value, (scores.get(value) || 0) + score);
  };

  add(category, 12);
  String(title || "").split(/[\s,，。；;：:、|｜—\-（）()《》“”"']+/).forEach((part) => add(part, 10));

  const text = `${title || ""} ${content || ""}`.replace(/<[^>]+>/g, " ");
  (text.match(/[A-Za-z][A-Za-z0-9.'-]{2,}/g) || []).forEach((word) => add(word.toUpperCase(), 3));
  const chineseRuns = text.match(/[\u4e00-\u9fff]{2,12}/g) || [];
  chineseRuns.forEach((run) => {
    if (run.length <= 6) add(run, 4);
    for (const size of [2,3,4]) {
      for (let i = 0; i <= run.length - size; i++) add(run.slice(i, i + size), size === 2 ? 1 : 2);
    }
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([term]) => term)
    .join(", ");
}

function handleCoverSelection(event) {
  const file = event.target.files?.[0] || null;
  if (!file) {
    clearCoverSelection();
    return;
  }
  setSelectedCoverFile(file);
}

function clearCoverSelection() {
  selectedCoverFile = null;
  el("article-cover-file").value = "";
  el("article-cover-preview-wrap").classList.add("hidden");
  el("article-cover-progress").classList.add("hidden");
  el("article-cover-preview").removeAttribute("src");
  if (selectedCoverObjectUrl) URL.revokeObjectURL(selectedCoverObjectUrl);
  selectedCoverObjectUrl = "";
}

async function uploadCoverImage(file, title) {
  const progress = el("article-cover-progress");
  progress.classList.remove("hidden");
  progress.textContent = "正在压缩图片...";

  const optimized = await optimizeImage(file, 1600, 0.84);
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeTitle = makeSlug(title).slice(0, 60);
  const filePath = `${year}/${month}/${safeTitle}-${crypto.randomUUID()}.webp`;

  progress.textContent = `正在上传 ${(optimized.size / 1024).toFixed(0)}KB...`;
  const { error } = await supabaseClient.storage
    .from(ARTICLE_IMAGE_BUCKET)
    .upload(filePath, optimized, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false
    });
  if (error) {
    throw new Error(`图片上传失败：${error.message}。请先在 Supabase 执行补丁包中的 SQL。`);
  }

  const { data } = supabaseClient.storage.from(ARTICLE_IMAGE_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("图片已上传，但无法取得公开地址。");
  progress.textContent = "图片上传成功。";
  return data.publicUrl;
}

async function optimizeImage(file, maxDimension, quality) {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片压缩失败")), "image/webp", quality);
  });
  return blob;
}

async function loadRankings() {
  const { data, error } = await supabaseClient
    .from("rankings")
    .select("id,article_id,rank_order,heat_text,is_active")
    .eq("rank_type", "24h")
    .order("rank_order", { ascending: true })
    .limit(10);

  if (error) {
    console.error(error);
    el("rankings-tbody").innerHTML = `<tr><td colspan="4">热榜读取失败：${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const rankings = data || [];
  el("count-rankings").textContent = rankings.length;
  el("rankings-tbody").innerHTML = rankings.length
    ? rankings.map((item) => `
      <tr>
        <td>${item.rank_order}</td>
        <td>${escapeHtml(item.heat_text || "-")}</td>
        <td>${escapeHtml(item.article_id || "-")}</td>
        <td>${item.is_active ? "启用" : "停用"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">暂无热榜条目。</td></tr>`;
}

function setLoginMessage(text) {
  el("login-message").textContent = text || "";
}



async function loadDrafts() {
  const tbody = el("drafts-tbody");
  if (!tbody) return;
  const { data, error } = await supabaseClient.from("articles")
    .select("id,title,category_name,ai_confidence,ai_review_reason,source_name,created_at")
    .eq("status", "draft").order("created_at", { ascending: false }).limit(200);
  if (error) { tbody.innerHTML = `<tr><td colspan="5">草稿读取失败：${escapeHtml(error.message)}</td></tr>`; return; }
  tbody.innerHTML = (data || []).map(row => `<tr><td><b>${escapeHtml(row.title)}</b><br><small>${escapeHtml(row.source_name || "")}</small></td><td>${escapeHtml(row.category_name || "待分类")}</td><td>${Number(row.ai_confidence || 0)}%</td><td>${escapeHtml(row.ai_review_reason || "需要人工审核")}</td><td><button onclick="editArticle('${row.id}')">编辑</button><button onclick="publishDraft('${row.id}')">发布</button></td></tr>`).join("") || `<tr><td colspan="5">暂无待审核草稿。</td></tr>`;
}

window.publishDraft = async function(id) {
  const { error } = await supabaseClient.from("articles").update({ status: "published", published_at: new Date().toISOString(), visibility: "public" }).eq("id", id);
  if (error) return alert(`发布失败：${error.message}`);
  await Promise.all([loadDrafts(), loadArticles()]);
};

async function saveNewsSource(event) {
  event.preventDefault();
  const payload = {
    id: el("source-id").value.trim(), name: el("source-name").value.trim(), agency: el("source-agency").value.trim(),
    x_account: el("source-x").value.trim().replace(/^@/, ""), source_level: el("source-level").value,
    active: el("source-status").value === "true", updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from("news_sources").upsert(payload, { onConflict: "id" });
  if (error) return alert(`保存来源失败：${error.message}`);
  event.target.reset(); await loadNewsSources();
}

window.toggleNewsSource = async function(id, active) {
  const { error } = await supabaseClient.from("news_sources").update({ active: !active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return alert(`更新失败：${error.message}`);
  await loadNewsSources();
};

async function loadAutomationLogs() {
  const tbody = el("logs-tbody");
  if (!tbody) return;
  const { data, error } = await supabaseClient
    .from("automation_logs")
    .select("pipeline,run_at,fetched,processed,published,drafted,duplicates,failed")
    .order("run_at", { ascending: false })
    .limit(100);
  if (error) {
    tbody.innerHTML = `<tr><td colspan="8">日志暂不可用：${escapeHtml(error.message)}。请先执行 V3 SQL。</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map(row => `<tr>
    <td>${escapeHtml(row.pipeline)}</td><td>${escapeHtml(formatDate(row.run_at))}</td>
    <td>${row.fetched || 0}</td><td>${row.processed || 0}</td><td>${row.published || 0}</td>
    <td>${row.drafted || 0}</td><td>${row.duplicates || 0}</td><td>${row.failed || 0}</td>
  </tr>`).join("") || `<tr><td colspan="8">暂无自动化日志。</td></tr>`;
}

async function loadNewsSources() {
  const tbody = el("sources-tbody");
  if (!tbody) return;
  const { data, error } = await supabaseClient
    .from("news_sources")
    .select("id,name,agency,level,state,city,source_level,x_account,active,last_success_at")
    .order("source_level", { ascending: true })
    .limit(300);
  if (error) {
    tbody.innerHTML = `<tr><td colspan="8">来源表暂不可用：${escapeHtml(error.message)}。请先执行 V3 SQL。</td></tr>`;
    return;
  }
  tbody.innerHTML = (data || []).map(row => `<tr>
    <td><b>${escapeHtml(row.name)}</b><br><small>${escapeHtml(row.x_account ? "@" + row.x_account : row.id)}</small></td>
    <td>${escapeHtml(row.agency || "-")}</td><td>${escapeHtml(row.level || "-")}</td>
    <td>${escapeHtml([row.city,row.state].filter(Boolean).join(", ") || "全国")}</td>
    <td>${escapeHtml(row.source_level || "-")}</td><td>${row.active ? "启用" : "停用"}</td>
    <td>${escapeHtml(row.last_success_at ? formatDate(row.last_success_at) : "尚未记录")}</td><td><button onclick="toggleNewsSource('${escapeHtml(row.id)}', ${row.active})">${row.active ? "停用" : "启用"}</button></td>
  </tr>`).join("") || `<tr><td colspan="8">暂无来源。可执行导入脚本或在后台添加。</td></tr>`;
}

function statusLabel(status) {
  return {
    published: "已发布",
    draft: "草稿",
    hidden: "隐藏"
  }[status] || status;
}

function makeSlug(title) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\u4e00-\u9fa5a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base || "article"}-${Date.now().toString(36)}`;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

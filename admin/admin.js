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
let reviewStories = [];
let reviewFilter = "pending_review";
let activeReview = null;
let reviewPipeline = {};
let reviewDedupe = {};

document.addEventListener("DOMContentLoaded", init);

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
  if (data.session?.user) await enterAdmin(data.session.user);
}

function bindEvents() {
  el("login-form").addEventListener("submit", handleLogin);
  el("logout-btn").addEventListener("click", handleLogout);

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page, button));
  });

  el("article-form").addEventListener("submit", handleSaveArticle);
  el("refresh-articles").addEventListener("click", loadArticles);
  el("refresh-rankings").addEventListener("click", loadRankings);
  if (el("refresh-finance-monitor")) el("refresh-finance-monitor").addEventListener("click", () => window.loadFinanceHealth?.());
  document.querySelectorAll("[data-open-niulai-publisher]").forEach((button) => {
    button.addEventListener("click", () => {
      const navButton = document.querySelector('.nav-btn[data-publisher-preset="niulai"]');
      showPage("new-article", navButton);
    });
  });
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
    el("article-seo-keywords").value = generateSeoKeywords(
      el("article-title").value,
      categoryName,
      el("article-content").value
    );
  });
  el("generate-ai-cover").addEventListener("click", () => generateAiCover());

  el("refresh-review").addEventListener("click", loadReviewQueue);
  document.querySelectorAll(".review-tab").forEach((button) => {
    button.addEventListener("click", () => {
      reviewFilter = button.dataset.reviewFilter;
      document.querySelectorAll(".review-tab").forEach((item) => item.classList.toggle("active", item === button));
      renderReviewList();
    });
  });

  el("review-modal-close").addEventListener("click", closeReviewModal);
  el("review-modal-backdrop").addEventListener("click", closeReviewModal);
  el("review-cover").addEventListener("input", updateReviewCoverPreview);
  el("review-content").addEventListener("input", () => updateIceEditorialCount());
  document.querySelectorAll("[data-review-action]").forEach((button) => {
    button.addEventListener("click", () => handleReviewAction(button.dataset.reviewAction));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el("review-modal").classList.contains("hidden")) {
      closeReviewModal();
    }
  });
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
      "当前邮箱: " + (user.email || "")
    );
    return;
  }

  currentAdmin = admin;
  el("login-view").classList.add("hidden");
  el("admin-view").classList.remove("hidden");
  el("admin-info").textContent = `${user.email} · ${admin.role}`;

  await Promise.allSettled([
    loadCategories(),
    loadArticles(),
    loadRankings(),
    loadReviewQueue(),
    window.loadFinanceHealth?.()
  ]);
  showPage("dashboard");
}

async function getAdminRecord(user) {
  let { data, error } = await supabaseClient
    .from("admin_users")
    .select("id,user_id,email,role,is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) console.error("Admin check by user_id failed:", error);
  if (data && ["owner", "admin"].includes(String(data.role || "").toLowerCase())) return data;

  const fallback = await supabaseClient
    .from("admin_users")
    .select("id,user_id,email,role,is_active")
    .ilike("email", String(user.email || "").trim())
    .eq("is_active", true)
    .maybeSingle();

  if (fallback.error) console.error("Admin check by email failed:", fallback.error);
  if (fallback.data && ["owner", "admin"].includes(String(fallback.data.role || "").toLowerCase())) {
    return fallback.data;
  }

  if (user.id === OWNER_UID && String(user.email || "").trim().toLowerCase() === OWNER_EMAIL) {
    return { user_id: OWNER_UID, email: OWNER_EMAIL, role: "owner", is_active: true };
  }
  return null;
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

function configurePublisherPreset(preset = "") {
  const category = el("article-category");
  const author = el("article-author");
  if (!category || !author) return;

  category.querySelectorAll("option[data-virtual-category]").forEach((option) => option.remove());
  el("article-form").dataset.publisherPreset = preset;

  if (preset === "niulai") {
    let option = Array.from(category.options).find((item) => item.textContent.trim() === "牛来财经");
    if (!option) {
      option = document.createElement("option");
      option.value = "";
      option.textContent = "牛来财经";
      option.dataset.virtualCategory = "niulai";
      category.append(option);
    }
    category.value = option.value;
    option.selected = true;
    author.value = "牛来｜唐人财经";
    el("article-message").textContent = "人工财经发稿：发布后进入牛来财经栏目，并同步使用现有文章库。";
  } else {
    if (author.value === "牛来｜唐人财经") author.value = "Tang Ren Daily";
    el("article-message").textContent = "";
  }
}

function showPage(page, sourceButton = null) {
  const preset = sourceButton?.dataset.publisherPreset || "";
  const titles = {
    dashboard: "控制台",
    articles: "文章管理",
    "new-article": preset === "niulai" ? "牛来人工发稿" : "发布文章",
    "finance-monitor": "牛来接口监控",
    "automation-control": "机器人管理",
    "content-center": "采集内容中心",
    "asylumjudge-review": "AsylumJudge内容中心",
    rankings: "24小时热榜"
  };

  document.querySelectorAll(".page").forEach((item) => item.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", sourceButton ? button === sourceButton : button.dataset.page === page && !button.dataset.publisherPreset);
  });

  el(`${page}-page`).classList.remove("hidden");
  el("page-title").textContent = titles[page] || "控制台";
  if (page === "new-article") configurePublisherPreset(preset);
  if (page === "content-center") window.loadUnifiedContentCenter?.();
  if (page === "finance-monitor") window.loadFinanceHealth?.();
  if (page === "automation-control") window.loadAutomationControls?.();
  if (page === "asylumjudge-review") window.loadAsylumJudgeReview?.();
  document.dispatchEvent(new CustomEvent("trrb:admin-page-shown", { detail: { page, preset } }));
}

window.getAdminAccessToken = async function () {
  const { data } = await supabaseClient.auth.getSession();
  return data.session?.access_token || "";
};

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
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join("");
}

async function loadArticles() {
  const { data, error } = await supabaseClient
    .from("articles")
    .select("id,title,category_name,status,published_at,created_at")
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
    : `<tr><td colspan="5">暂无文章。</td></tr>`;
}

function renderArticleRow(article) {
  return `
    <tr>
      <td><b>${escapeHtml(article.title)}</b><br><small>${escapeHtml(article.id)}</small></td>
      <td>${escapeHtml(article.category_name || "-")}</td>
      <td><span class="status-pill status-${escapeHtml(article.status)}">${statusLabel(article.status)}</span></td>
      <td>${escapeHtml(formatDate(article.published_at || article.created_at))}</td>
      <td>
        <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','published')">发布</button>
        <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','draft')">草稿</button>
        <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','hidden')">隐藏</button>
      </td>
    </tr>
  `;
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
    if (!coverImage && status === "published" && el("auto-ai-cover").checked) {
      coverImage = await generateAiCover({ silent: true });
      el("article-cover").value = coverImage || "";
    }

    const summary = el("article-summary").value.trim() || generateSummary(content, title);
    const seoKeywords = el("article-seo-keywords").value.trim() || generateSeoKeywords(title, categoryName, content);

    const payload = {
      title,
      slug: makeSlug(title),
      summary,
      content,
      category_id: selected.value || null,
      category_name: categoryName,
      cover_image: coverImage,
      seo_keywords: seoKeywords,
      author: el("article-author").value.trim() || "Tang Ren Daily",
      status,
      published_at: status === "published" ? new Date().toISOString() : null
    };

    const { error } = await supabaseClient.from("articles").insert(payload);
    if (error) throw error;

    el("article-message").textContent = "文章已保存。";
    el("article-form").reset();
    el("article-author").value = "Tang Ren Daily";
    clearCoverSelection();
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

  if (!title) {
    if (!options.silent) alert("请先填写文章标题。");
    return "";
  }

  progress.classList.remove("hidden");
  progress.textContent = "正在生成16:9 AI新闻封面，通常需要15–60秒…";

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
    if (!response.ok) throw new Error(result.error || `AI封面生成失败（${response.status}）`);
    if (!result.url) throw new Error("AI接口没有返回图片地址。");

    el("article-cover").value = result.url;
    el("article-cover-preview").src = result.url;
    el("article-cover-preview-wrap").classList.remove("hidden");
    progress.textContent = "AI封面生成并本地化成功。";
    return result.url;
  } catch (error) {
    console.error(error);
    progress.textContent = `AI封面失败：${error.message}`;
    if (!options.silent) alert(`AI封面失败：${error.message}`);
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
    setSelectedCoverFile(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: blob.type }));
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

function handleCoverSelection(event) {
  const file = event.target.files?.[0] || null;
  if (!file) return clearCoverSelection();
  setSelectedCoverFile(file);
}

function setSelectedCoverFile(file) {
  if (!file?.type?.startsWith("image/")) {
    alert("请选择或粘贴 JPG、PNG、WebP 或 GIF 图片。");
    return;
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    alert("原图不能超过15MB，请先缩小图片。");
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

  if (error) throw new Error(`图片上传失败：${error.message}`);
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

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("图片压缩失败")),
      "image/webp",
      quality
    );
  });
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

async function reviewApi(action, payload = {}) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("登录状态已失效，请重新登录。");

  const response = await fetch("/.netlify/functions/ice-review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...payload })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `ICE审核接口失败（${response.status}）`);
  return result;
}

async function loadReviewQueue() {
  el("review-message").textContent = "正在读取ICE候选新闻…";
  try {
    const result = await reviewApi("list");
    reviewStories = result.stories || [];
    reviewPipeline = result.pipeline || {};
    reviewDedupe = result.dedupe || {};
    updateReviewCounts();
    renderReviewList();
    renderReviewPipeline();
    el("review-message").textContent = `已读取 ${reviewStories.length} 条候选记录。`;
  } catch (error) {
    console.error(error);
    el("review-message").textContent = `审核队列读取失败：${error.message}`;
    el("review-list").innerHTML = `<div class="empty-state">请确认已运行最终版SQL，并且Netlify已经设置服务端Supabase密钥。</div>`;
  }
}

function reviewTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "尚无记录";
}

function updateIceEditorialCount(story = activeReview?.story || {}) {
  const content = el("review-content")?.value || "";
  const count = Array.from(content.replace(/\s+/g, "")).length;
  const payload = story?.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  const min = Number(payload.target_min_chars || (Number(payload.source_character_count || 0) >= 300 ? 500 : 300));
  const max = Number(payload.source_character_count || 0) >= 300 ? 800 : 600;
  const counter = el("ice-editorial-count");
  const target = el("ice-editorial-target");
  if (counter) { counter.textContent = `${count}字`; counter.style.color = count >= min && count <= max ? "#166534" : "#b42318"; }
  if (target) target.textContent = `本稿发布标准：${min}-${max}字。未达到标准时可以保存，但批准和发布会被拦截。`;
}

function renderReviewPipeline() {
  const head = document.querySelector("#ice-review-page .review-head");
  if (!head) return;
  let panel = el("ice-pipeline-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "ice-pipeline-panel";
    panel.className = "panel";
    panel.style.margin = "12px 0";
    head.insertAdjacentElement("afterend", panel);
  }
  const counts = reviewPipeline.post_counts || {};
  const pending = Number(counts.collected || 0) + Number(counts.processing || 0);
  const errors = Array.isArray(reviewPipeline.recent_errors) ? reviewPipeline.recent_errors.slice(0, 3) : [];
  panel.innerHTML = `<h3>ICE采集状态</h3><p>最近运行：${escapeHtml(reviewTime(reviewPipeline.last_run_at))}　最近成功：${escapeHtml(reviewTime(reviewPipeline.last_success_at))}</p><p>待处理 ${pending}　已提取 ${Number(counts.extracted || 0)}　已归并 ${Number(counts.clustered || 0)}　失败 ${Number(counts.failed || 0)}　后台可见 ${Number(reviewDedupe.visible || 0)}</p>${errors.length ? `<p style="color:#b91c1c;margin-top:10px">当前错误：${errors.map((item) => escapeHtml(String(item.error || "").slice(0, 180))).join("；")}</p>` : ""}`;
}

function updateReviewCounts() {
  const statuses = [
    "pending_review",
    "pending_corroboration",
    "approved",
    "published",
    "rejected",
    "failed"
  ];

  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      reviewStories.filter((story) => story.status === status).length
    ])
  );

  statuses.forEach((status) => {
    const node = el(`tab-count-${status}`);
    if (node) node.textContent = counts[status] || 0;
  });

  const pending = (counts.pending_review || 0);
  el("count-review").textContent = pending;
  el("review-nav-count").textContent = pending;
  el("review-nav-count").classList.toggle("has-items", pending > 0);
}

function renderReviewList() {
  const stories = reviewStories.filter((story) => story.status === reviewFilter);
  el("review-list").innerHTML = stories.length
    ? stories.map(renderReviewCard).join("")
    : `<div class="empty-state">当前分类没有候选新闻。</div>`;
}

function renderReviewCard(story) {
  const riskItems = [];
  if (story.conflict_detected) riskItems.push("事实冲突");
  if (story.legal_risk) riskItems.push("法律风险");
  if (story.privacy_risk) riskItems.push("隐私风险");
  if (story.fabrication_risk) riskItems.push("虚构风险");

  const riskHtml = riskItems.length
    ? `<span class="risk-chip danger">${riskItems.map(escapeHtml).join(" · ")}</span>`
    : `<span class="risk-chip safe">无硬风险</span>`;

  const image = story.cover_image ? `<div class="review-item-media"><img src="${escapeAttr(story.cover_image)}" alt="" loading="lazy" /></div>` : "";
  const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  const body = String(story.final_content || story.content || story.summary || story.decision_reason || "暂无正文").trim();
  const count = Array.from(body.replace(/\s+/g, "")).length;
  const min = Number(payload.target_min_chars || (Number(payload.source_character_count || 0) >= 300 ? 500 : 300));
  const max = Number(payload.source_character_count || 0) >= 300 ? 800 : 600;
  const countHtml = `<span class="risk-chip ${count >= min && count <= max ? "safe" : "danger"}">${count}字 / ${min}-${max}字</span>`;

  return `
    <article class="review-item review-item-v2" data-story-id="${escapeAttr(story.id)}" style="grid-template-columns:${image ? "164px minmax(0,1fr) auto" : "minmax(0,1fr) auto"}">
      ${image}
      <div class="review-item-main">
        <div class="review-item-topline">
          <span class="status-pill review-status-${escapeHtml(story.status)}">${reviewStatusLabel(story.status)}</span>
          ${riskHtml}
          ${countHtml}
        </div>
        <h3>${escapeHtml(story.title || "ICE候选新闻待审核")}</h3>
        <p>${escapeHtml(body)}</p>
      </div>
      <div class="review-item-action">
        <time>${escapeHtml(formatDate(story.source_created_at || story.updated_at || story.last_seen_at))}</time>
        <button onclick="openIceReview('${escapeAttr(story.id)}')">编辑标题和正文</button>
        <button class="secondary-btn ice-delete-story" data-story-id="${escapeAttr(story.id)}" type="button">删除</button>
      </div>
    </article>
  `;
}

window.openIceReview = async function (storyId) {
  el("review-action-message").textContent = "";
  el("review-modal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  el("review-modal-title").textContent = "正在读取候选新闻…";
  el("review-evidence-list").innerHTML = `<div class="empty-state">正在加载原始信源…</div>`;

  try {
    const detail = await reviewApi("detail", { story_id: storyId });
    activeReview = detail;
    populateReviewModal(detail);
  } catch (error) {
    console.error(error);
    el("review-modal-title").textContent = "读取失败";
    el("review-action-message").textContent = error.message;
  }
};

function populateReviewModal(detail) {
  const story = detail.story;
  const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  const mediaCount = (detail.posts || []).reduce((count, post) => {
    const media = Array.isArray(post?.media) ? post.media : [];
    return count + media.filter((item) => item?.url || item?.preview_image_url).length;
  }, 0);
  const imageRequired = mediaCount > 0 || Number(payload.image_count || 0) > 0 || Boolean(story.cover_image);
  el("review-modal-title").textContent = story.title || "审核候选新闻";
  el("review-title").value = story.final_title || story.title || "";
  el("review-summary").value = story.final_summary || story.summary || "";
  el("review-content").value = story.final_content || story.content || "";
  el("review-cover").value = story.final_cover_image || story.cover_image || "";
  el("review-current-status").value = `${reviewStatusLabel(story.status)} / ${humanStatusLabel(story.human_review_status)}`;
  el("review-notes").value = story.editor_notes || "";
  el("review-decision-reason").textContent = story.decision_reason || "暂无AI审核说明。";
  el("review-schedule").value = toDateTimeLocal(story.scheduled_at || nextHalfHourIso());
  el("review-image-reviewed").checked = !imageRequired || payload.image_grounding_used === true;
  el("review-image-reviewed").disabled = !imageRequired;
  el("review-not-old").checked = payload.old_news_checked === true && payload.appears_old_news !== true;
  updateReviewCoverPreview();
  updateIceEditorialCount(story);

  const metrics = [
    ["综合评分", `${Number(story.total_score || 0)}/100`],
    ["AI可信度", `${Number(story.ai_confidence || 0)}/100`],
    ["独立信源", Number(story.independent_source_count || 0)],
    ["官方来源", Number(story.official_source_count || 0)],
    ["媒体来源", Number(story.media_source_count || 0)],
    ["专业机构", Number(story.organization_source_count || 0)]
  ];
  el("review-score-grid").innerHTML = metrics
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  const risks = [
    ["事实冲突", story.conflict_detected],
    ["法律风险", story.legal_risk],
    ["隐私风险", story.privacy_risk],
    ["虚构风险", story.fabrication_risk]
  ];
  el("review-risk-panel").innerHTML = risks
    .map(([label, active]) => `
      <span class="risk-chip ${active ? "danger" : "safe"}">
        ${active ? "⚠" : "✓"} ${escapeHtml(label)}
      </span>
    `).join("");

  renderEvidence(detail);
  renderReviewLogs(detail.logs || []);
}

function renderEvidence(detail) {
  const postsById = new Map((detail.posts || []).map((post) => [post.id, post]));
  const evidence = detail.evidence || [];
  el("review-evidence-count").textContent = `${evidence.length}条证据`;

  el("review-evidence-list").innerHTML = evidence.length
    ? evidence.map((item, index) => {
        const post = postsById.get(item.post_id) ||
          (detail.posts || []).find((candidate) => candidate.x_post_id === item.x_post_id) || {};
        const media = Array.isArray(post.media) ? post.media : [];
        const mediaUrl = media.find((entry) => entry.url || entry.preview_image_url);
        return `
          <article class="evidence-card">
            <div class="evidence-number">${index + 1}</div>
            <div class="evidence-body">
              <div class="evidence-meta">
                <b>${escapeHtml(post.source_display_name || post.source_username || item.independence_key || "未知来源")}</b>
                <span>${escapeHtml(sourceTypeLabel(post.source_type || item.source_type))}</span>
                <span>信任等级 ${Number(post.trust_tier || item.trust_tier || 5)}</span>
                <time>${escapeHtml(formatDate(post.source_created_at || item.created_at))}</time>
              </div>
              <p>${escapeHtml(post.source_text || "没有保存原始正文。")}</p>
              ${mediaUrl ? `<img class="evidence-image" src="${escapeAttr(mediaUrl.url || mediaUrl.preview_image_url)}" alt="" loading="lazy" />` : ""}
              <a href="${escapeAttr(post.x_url || item.x_url)}" target="_blank" rel="noopener">打开原始X帖子</a>
            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty-state">尚未找到交叉证据。</div>`;
}

function renderReviewLogs(logs) {
  el("review-log-list").innerHTML = logs.length
    ? logs.map((log) => `
      <div class="review-log-item">
        <b>${escapeHtml(reviewActionLabel(log.action))}</b>
        <span>${escapeHtml(log.reviewer_email || "系统")}</span>
        <time>${escapeHtml(formatDate(log.created_at))}</time>
        ${log.notes ? `<p>${escapeHtml(log.notes)}</p>` : ""}
      </div>
    `).join("")
    : `<div class="empty-state compact">暂无人工审核记录。</div>`;
}

function closeReviewModal() {
  el("review-modal").classList.add("hidden");
  document.body.classList.remove("modal-open");
  activeReview = null;
}

function updateReviewCoverPreview() {
  const url = el("review-cover").value.trim();
  if (/^https?:\/\//i.test(url)) {
    el("review-cover-preview").src = url;
    el("review-cover-preview").classList.remove("hidden");
  } else {
    el("review-cover-preview").classList.add("hidden");
    el("review-cover-preview").removeAttribute("src");
  }
}

async function handleReviewAction(action) {
  if (!activeReview?.story?.id) return;

  const labels = {
    save: "保存编辑",
    wait: "等待更多信源",
    rewrite: "重新交给AI审核",
    reject: "拒绝发布",
    approve: "批准并排期",
    publish_now: "立即发布"
  };

  if (action === "reject" && !el("review-notes").value.trim()) {
    el("review-action-message").textContent = "拒绝发布前请填写审核理由。";
    el("review-notes").focus();
    return;
  }

  if (["approve", "publish_now"].includes(action)) {
    const story = activeReview.story || {};
    const metadata = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
    const min = Number(metadata.target_min_chars || (Number(metadata.source_character_count || 0) >= 300 ? 500 : 300));
    const max = Number(metadata.source_character_count || 0) >= 300 ? 800 : 600;
    const count = Array.from(el("review-content").value.replace(/\s+/g, "")).length;
    if (count < min || count > max) {
      el("review-action-message").textContent = `当前正文${count}字，必须编辑到${min}-${max}字后才能发布。可以先点击“保存编辑”。`;
      el("review-content").focus();
      return;
    }
    if (!el("review-not-old").checked) {
      el("review-action-message").textContent = "请先查重并确认不是旧闻。";
      el("review-not-old").focus();
      return;
    }
    if (!el("review-image-reviewed").disabled && !el("review-image-reviewed").checked) {
      el("review-action-message").textContent = "原帖含图片，请先查看并核对图片。";
      el("review-image-reviewed").focus();
      return;
    }
    const confirmed = window.confirm(
      action === "publish_now"
        ? "确认立即发布到 trrb.net 前台？"
        : "确认批准并放入规律发布队列？"
    );
    if (!confirmed) return;
  }

  const buttons = [...document.querySelectorAll("[data-review-action]")];
  buttons.forEach((button) => { button.disabled = true; });
  el("review-action-message").textContent = `正在执行：${labels[action]}…`;

  try {
    const payload = {
      story_id: activeReview.story.id,
      title: el("review-title").value.trim(),
      summary: el("review-summary").value.trim(),
      content: el("review-content").value.trim(),
      cover_image: el("review-cover").value.trim(),
      scheduled_at: el("review-schedule").value
        ? new Date(el("review-schedule").value).toISOString()
        : "",
      notes: el("review-notes").value.trim(),
      image_reviewed: el("review-image-reviewed").checked,
      not_old_news_confirmed: el("review-not-old").checked
    };

    const result = await reviewApi(action, payload);
    el("review-action-message").textContent = `${labels[action]}成功。`;

    if (action === "publish_now" && result.article_id) {
      el("review-action-message").textContent = `发布成功，文章ID：${result.article_id}`;
      setTimeout(closeReviewModal, 300);
      Promise.allSettled([loadReviewQueue(), loadArticles()]);
      return;
    }

    await Promise.all([loadReviewQueue(), loadArticles()]);
    setTimeout(closeReviewModal, 650);
  } catch (error) {
    console.error(error);
    const message = `${labels[action]}失败：${error.message}`;
    el("review-action-message").textContent = message;
    el("review-action-message").scrollIntoView({ behavior: "smooth", block: "center" });
    window.alert(message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
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
  const stop = new Set([
    "我们","他们","以及","一个","这个","那个","目前","已经","进行","表示","指出",
    "认为","相关","报道","消息","记者","唐人日报","中国","美国","新闻","文章","情况",
    "问题","可以","没有","因为","但是","如果","其中","对于","通过","正在"
  ]);
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
    for (const size of [2, 3, 4]) {
      for (let i = 0; i <= run.length - size; i++) add(run.slice(i, i + size), size === 2 ? 1 : 2);
    }
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([term]) => term)
    .join(", ");
}

function setLoginMessage(text) {
  el("login-message").textContent = text || "";
}

function statusLabel(status) {
  return {
    published: "已发布",
    draft: "草稿",
    hidden: "隐藏"
  }[status] || status;
}

function reviewStatusLabel(status) {
  return {
    pending_review: "待人工审核",
    pending_corroboration: "等待交叉信源",
    approved: "已通过待发布",
    published: "已发布",
    rejected: "已拒绝",
    failed: "处理失败",
    collecting: "收集中"
  }[status] || status;
}

function humanStatusLabel(status) {
  return {
    not_reviewed: "尚未审核",
    required: "需要人工审核",
    waiting: "等待更多信源",
    editing: "人工编辑中",
    rewrite_requested: "等待AI重新审核",
    approved: "人工已批准",
    rejected: "人工已拒绝",
    not_required: "官方自动审核"
  }[status] || status || "尚未审核";
}

function sourceTypeLabel(type) {
  return {
    official: "官方机构",
    major_media: "主流媒体",
    local_media: "地方媒体",
    specialist_media: "专业媒体",
    legal_org: "法律机构",
    research_org: "研究机构",
    civic_org: "民权组织",
    discovered_individual: "发现的个人信源"
  }[type] || type || "未知来源";
}

function reviewActionLabel(action) {
  return {
    save_editorial: "保存编辑",
    approve_schedule: "批准并排期",
    publish_now: "立即发布",
    wait: "等待更多信源",
    rewrite: "重新交给AI审核",
    reject: "拒绝发布"
  }[action] || action;
}

function makeSlug(title) {
  const base = String(title || "")
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

function nextHalfHourIso() {
  const date = new Date();
  date.setSeconds(0, 0);
  if (date.getMinutes() < 30) date.setMinutes(30);
  else {
    date.setHours(date.getHours() + 1);
    date.setMinutes(0);
  }
  return date.toISOString();
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

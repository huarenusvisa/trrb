
const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const OWNER_EMAIL = "tangrenribao@gmail.com";
const OWNER_UID = "4c491ee3-a9f0-42c9-9bee-1abb52b20b01";

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
  await Promise.all([loadCategories(), loadArticles(), loadRankings()]);
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
    rankings: "24小时热榜"
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
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','published')">发布</button>
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','draft')">草稿</button>
        <button class="small-btn" onclick="changeArticleStatus('${article.id}','hidden')">隐藏</button>
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

  const payload = {
    title,
    slug: makeSlug(title),
    summary: el("article-summary").value.trim(),
    content: el("article-content").value.trim(),
    category_id: selected.value || null,
    category_name: categoryName,
    cover_image: el("article-cover").value.trim(),
    author: el("article-author").value.trim() || "Tang Ren Daily",
    status,
    published_at: status === "published" ? new Date().toISOString() : null
  };

  el("article-message").textContent = "正在保存...";

  const { error } = await supabaseClient.from("articles").insert(payload);
  if (error) {
    el("article-message").textContent = "保存失败：" + error.message;
    return;
  }

  el("article-message").textContent = "文章已保存。";
  el("article-form").reset();
  el("article-author").value = "Tang Ren Daily";
  await loadArticles();
  showPage("articles");
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

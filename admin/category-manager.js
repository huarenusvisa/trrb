(() => {
  const $ = (id) => document.getElementById(id);
  let allCategories = [];
  let advancedSchemaReady = true;

  const ADVANCED_FIELDS = [
    "show_in_navigation","show_on_homepage","auto_fetch","ai_rewrite","auto_publish",
    "include_in_sitemap","include_in_google_news","include_in_rss",
    "push_x","push_telegram","seo_title","seo_description","seo_keywords","ai_prompt"
  ];
  const SELECT_FIELDS = `id,name,slug,sort_order,is_active,${ADVANCED_FIELDS.join(",")}`;
  const defaults = (name, slug, sort, extra = {}) => ({
    name, slug, sort_order: sort, is_active: true,
    show_in_navigation: true, show_on_homepage: true,
    auto_fetch: false, ai_rewrite: true, auto_publish: false,
    include_in_sitemap: true, include_in_google_news: true, include_in_rss: true,
    push_x: false, push_telegram: false,
    ...extra
  });
  const STANDARD_CATEGORIES = [
    defaults("中国热门头条", "hot-headlines", 2),
    defaults("ICE执法与警情", "iceandpolice", 3, {auto_fetch: true, auto_publish: true}),
    defaults("美国时政", "us-politics", 4),
    defaults("中国政治", "china-politics", 5),
    defaults("移民法官通过率", "immigration-judge-approval-rate", 6),
    defaults("移民社区", "community", 8, {show_in_navigation: false, show_on_homepage: false}),
    defaults("移民美国知识库", "immigrate", 9, {show_in_navigation: false, show_on_homepage: false}),
    defaults("特朗普实时动态", "trump", 20, {show_in_navigation: false, show_on_homepage: false, auto_fetch: true, auto_publish: true}),
    defaults("美国中期选举实时追踪", "midterm-elections", 90, {show_in_navigation: false, show_on_homepage: false}),
    defaults("习近平", "xijinping", 100, {show_in_navigation: false, show_on_homepage: false})
  ];

  document.addEventListener("DOMContentLoaded", () => {
    injectAdvancedControls();
    const form = $("category-form");
    if (!form) return;
    form.addEventListener("submit", saveCategory);
    $("category-reset")?.addEventListener("click", resetCategoryForm);
    $("refresh-categories")?.addEventListener("click", loadCategoryManager);
    $("apply-standard-categories")?.addEventListener("click", applyStandardCategories);
    $("category-name")?.addEventListener("input", syncSlugFromName);
    $("category-slug")?.addEventListener("input", () => { $("category-slug").dataset.manual = "1"; });
    document.querySelectorAll('.nav-btn[data-page="categories"]').forEach((button) => button.addEventListener("click", () => setTimeout(loadCategoryManager, 0)));
  });

  function injectAdvancedControls() {
    const form = $("category-form");
    const submit = $("category-submit");
    if (!form || !submit || $("category-show-nav")) return;
    const box = document.createElement("div");
    box.className = "category-cms-extra";
    box.innerHTML = `
      <h4>栏目统一开关</h4>
      <div class="category-toggle-grid">
        ${toggle("category-show-nav","导航显示",true)}${toggle("category-show-home","首页展示",true)}
        ${toggle("category-auto-fetch","自动抓取",false)}${toggle("category-ai-rewrite","AI改写",true)}
        ${toggle("category-auto-publish","自动发布",false)}${toggle("category-sitemap","加入 Sitemap",true)}
        ${toggle("category-google-news","Google News",true)}${toggle("category-rss","RSS",true)}
        ${toggle("category-push-x","推送 X",false)}${toggle("category-push-telegram","推送 Telegram",false)}
      </div>
      <label for="category-seo-title">SEO标题</label><input id="category-seo-title" maxlength="160" />
      <label for="category-seo-description">SEO描述</label><textarea id="category-seo-description" rows="3" maxlength="500"></textarea>
      <label for="category-seo-keywords">SEO关键词</label><input id="category-seo-keywords" maxlength="500" />
      <label for="category-ai-prompt">栏目 AI Prompt</label><textarea id="category-ai-prompt" rows="5"></textarea>
      <div id="category-schema-warning" class="category-warning hidden"></div>`;
    form.insertBefore(box, submit);
  }

  function toggle(id, label, checked) { return `<label class="category-switch"><input id="${id}" type="checkbox" ${checked ? "checked" : ""}/><span>${label}</span></label>`; }
  function canManageCategories() { const role = String(currentAdmin?.role || "").toLowerCase(); return role === "owner" || role === "admin"; }
  function defaultValue(item, key, fallback = false) { return item?.[key] === undefined || item?.[key] === null ? fallback : Boolean(item[key]); }

  async function loadCategoryManager() {
    const list = $("category-list");
    if (!list) return;
    list.innerHTML = '<div class="category-empty">正在读取栏目...</div>';
    let result = await supabaseClient.from("categories").select(SELECT_FIELDS).order("sort_order", { ascending: true }).order("name", { ascending: true });
    advancedSchemaReady = !result.error;
    if (result.error) {
      result = await supabaseClient.from("categories").select("id,name,slug,sort_order,is_active").order("sort_order", { ascending: true }).order("name", { ascending: true });
      showSchemaWarning("数据库缺少栏目CMS正式字段，请运行栏目CMS数据库迁移。", true);
      setAdvancedDisabled(true);
    } else {
      showSchemaWarning("");
      setAdvancedDisabled(false);
    }
    if (result.error) { list.innerHTML = `<div class="category-error">栏目读取失败：${escapeText(result.error.message)}</div>`; return; }
    allCategories = result.data || [];
    renderCategories();
  }

  function renderCategories() {
    const list = $("category-list");
    if (!list) return;
    if (!allCategories.length) { list.innerHTML = '<div class="category-empty">暂无栏目，请新增或应用标准栏目。</div>'; return; }
    list.innerHTML = allCategories.map((item, index) => {
      const badges = [item.show_in_navigation !== false ? "导航" : "", item.show_on_homepage !== false ? "首页" : "", item.auto_fetch ? "抓取" : "", item.ai_rewrite !== false ? "AI" : "", item.auto_publish ? "自动发布" : "", item.include_in_google_news !== false ? "News" : "", item.include_in_rss !== false ? "RSS" : ""].filter(Boolean);
      if (item.slug === "ice") badges.unshift("旧采集入口 · 内容归入ICE执法与警情");
      if (["xijinping", "xi-jinping"].includes(item.slug)) badges.unshift("仅专题");
      return `<article class="category-item ${item.is_active ? "" : "is-disabled"}"><div class="category-item-main"><div class="category-item-title"><strong>${escapeText(item.name)}</strong><span class="category-state ${item.is_active ? "on" : "off"}">${item.is_active ? "已启用" : "已停用"}</span></div><div class="category-meta"><a href="/${encodeURIComponent(item.slug)}" target="_blank" rel="noopener"><code>/${escapeText(item.slug)}</code> ↗</a><span>排序 ${Number(item.sort_order || 0)}</span></div><div class="category-badges">${badges.map(x => `<span>${escapeText(x)}</span>`).join("")}</div></div><div class="category-actions"><button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}',-1)" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}',1)" ${index === allCategories.length - 1 ? "disabled" : ""}>下移</button><button type="button" onclick="TRRBCategoryManager.edit('${escapeAttr(item.id)}')">编辑</button><button type="button" onclick="TRRBCategoryManager.toggle('${escapeAttr(item.id)}',${item.is_active ? "false" : "true"})">${item.is_active ? "停用" : "启用"}</button><button type="button" class="danger" onclick="TRRBCategoryManager.remove('${escapeAttr(item.id)}')">删除</button></div></article>`;
    }).join("");
  }

  async function applyStandardCategories() {
    if (!canManageCategories()) return setStandardMessage("当前账号没有栏目管理权限。", true);
    if (!advancedSchemaReady) return setStandardMessage("请先完成栏目CMS数据库迁移。", true);
    if (!confirm("应用当前标准栏目名称、排序和显示位置？已有采集、发布和SEO设置保持不变。")) return;
    const button = $("apply-standard-categories");
    if (button) button.disabled = true;
    setStandardMessage("正在配置...");
    try {
      const read = await supabaseClient.from("categories").select("id,slug");
      if (read.error) throw read.error;
      const bySlug = new Map((read.data || []).map(x => [String(x.slug).toLowerCase(), x]));
      let created = 0, updated = 0;
      for (const standard of STANDARD_CATEGORIES) {
        const current = bySlug.get(standard.slug);
        const query = current ? supabaseClient.from("categories").update({name: standard.name, slug: standard.slug, sort_order: standard.sort_order, is_active: true, show_in_navigation: standard.show_in_navigation, show_on_homepage: standard.show_on_homepage}).eq("id", current.id) : supabaseClient.from("categories").insert(standard);
        const result = await query;
        if (result.error) throw new Error(`/${standard.slug}: ${result.error.message}`);
        current ? updated++ : created++;
      }
      await Promise.all([loadCategoryManager(), loadCategories()]);
      setStandardMessage(`完成：新增 ${created}，更新 ${updated}。`, false, true);
    } catch (error) {
      setStandardMessage("配置失败：" + (error?.message || error), true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function collectPayload() {
    const payload = { name: $("category-name").value.trim(), slug: normalizeSlug($("category-slug").value), sort_order: Number($("category-sort").value || 100), is_active: $("category-active").checked };
    if (advancedSchemaReady) Object.assign(payload, {
      show_in_navigation: $("category-show-nav").checked,
      show_on_homepage: $("category-show-home").checked,
      auto_fetch: $("category-auto-fetch").checked,
      ai_rewrite: $("category-ai-rewrite").checked,
      auto_publish: $("category-auto-publish").checked,
      include_in_sitemap: $("category-sitemap").checked,
      include_in_google_news: $("category-google-news").checked,
      include_in_rss: $("category-rss").checked,
      push_x: $("category-push-x").checked,
      push_telegram: $("category-push-telegram").checked,
      seo_title: $("category-seo-title").value.trim(),
      seo_description: $("category-seo-description").value.trim(),
      seo_keywords: $("category-seo-keywords").value.trim(),
      ai_prompt: $("category-ai-prompt").value.trim()
    });
    return payload;
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!canManageCategories()) return setMessage("没有权限。", true);
    const id = $("category-id").value.trim();
    const payload = collectPayload();
    if (!payload.name || !payload.slug) return setMessage("请填写栏目名称和有效URL。", true);
    if (allCategories.some(x => String(x.slug).toLowerCase() === payload.slug && String(x.id) !== id)) return setMessage(`/${payload.slug} 已存在。`, true);
    setMessage("正在保存...");
    const query = id ? supabaseClient.from("categories").update(payload).eq("id", id) : supabaseClient.from("categories").insert(payload);
    const result = await query;
    if (result.error) return setMessage("保存失败：" + result.error.message, true);
    resetCategoryForm();
    await Promise.all([loadCategoryManager(), loadCategories()]);
    setMessage(id ? "栏目已更新。" : "栏目已新增。", false, true);
  }

  function editCategory(id) {
    const item = allCategories.find(x => String(x.id) === String(id));
    if (!item) return;
    setValue("category-id", item.id); setValue("category-name", item.name); setValue("category-slug", item.slug);
    $("category-slug").dataset.manual = "1"; setValue("category-sort", Number(item.sort_order || 0)); setCheck("category-active", Boolean(item.is_active));
    setCheck("category-show-nav", defaultValue(item, "show_in_navigation", true)); setCheck("category-show-home", defaultValue(item, "show_on_homepage", true));
    setCheck("category-auto-fetch", defaultValue(item, "auto_fetch", false)); setCheck("category-ai-rewrite", defaultValue(item, "ai_rewrite", true)); setCheck("category-auto-publish", defaultValue(item, "auto_publish", false));
    setCheck("category-sitemap", defaultValue(item, "include_in_sitemap", true)); setCheck("category-google-news", defaultValue(item, "include_in_google_news", true)); setCheck("category-rss", defaultValue(item, "include_in_rss", true));
    setCheck("category-push-x", defaultValue(item, "push_x", false)); setCheck("category-push-telegram", defaultValue(item, "push_telegram", false));
    setValue("category-seo-title", item.seo_title); setValue("category-seo-description", item.seo_description); setValue("category-seo-keywords", item.seo_keywords); setValue("category-ai-prompt", item.ai_prompt);
    $("category-form-title").textContent = "编辑栏目"; $("category-submit").textContent = "保存修改"; window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleCategory(id, nextState) { if (!canManageCategories()) return alert("没有权限。"); const result = await supabaseClient.from("categories").update({ is_active: nextState }).eq("id", id); if (result.error) return alert(result.error.message); await Promise.all([loadCategoryManager(), loadCategories()]); }
  async function moveCategory(id, direction) { if (!canManageCategories()) return; const index = allCategories.findIndex(x => String(x.id) === String(id)), swap = index + direction; if (index < 0 || swap < 0 || swap >= allCategories.length) return; const a = allCategories[index], b = allCategories[swap], ao = Number(a.sort_order || index * 10 + 10), bo = Number(b.sort_order || swap * 10 + 10); let result = await supabaseClient.from("categories").update({ sort_order: bo }).eq("id", a.id); if (result.error) return alert(result.error.message); result = await supabaseClient.from("categories").update({ sort_order: ao }).eq("id", b.id); if (result.error) return alert(result.error.message); await Promise.all([loadCategoryManager(), loadCategories()]); }
  async function removeCategory(id) {
    if (!canManageCategories()) return;
    const item = allCategories.find(x => String(x.id) === String(id));
    if (!item) return;
    const count = await supabaseClient.from("articles").select("id", { count: "exact", head: true })
      .or(`category_id.eq.${id},category_name.eq.${JSON.stringify(item.name)}`);
    if (count.error) return alert(count.error.message);
    document.getElementById("category-transfer-dialog")?.remove();
    const dialog = document.createElement("dialog");
    dialog.id = "category-transfer-dialog";
    dialog.className = "category-transfer-dialog";
    const targets = allCategories.filter(x => x.is_active && x.id !== item.id);
    dialog.innerHTML = `<form method="dialog"><h3>删除“${escapeText(item.name)}”</h3><p>当前有 ${count.count || 0} 篇文章。选择目标栏目后，将转移全部文章并删除原栏目。</p><p>文章正文、发布时间和发布状态会保留。</p><label for="category-transfer-target">文章转移到</label><select id="category-transfer-target" ${count.count ? "required" : ""}><option value="">${count.count ? "请选择目标栏目" : "没有文章，可直接删除"}</option>${targets.map(x => `<option value="${escapeAttr(x.id)}">${escapeText(x.name)}（/${escapeText(x.slug)}）</option>`).join("")}</select><p id="category-transfer-message" role="status"></p><div class="category-transfer-actions"><button type="button" id="category-transfer-cancel" class="secondary-btn">取消</button><button type="submit" id="category-transfer-submit">${count.count ? "转移文章并删除栏目" : "删除空栏目"}</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.querySelector("#category-transfer-cancel").onclick = () => dialog.close();
    dialog.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = dialog.querySelector("#category-transfer-submit");
      button.disabled = true;
      const message = dialog.querySelector("#category-transfer-message");
      message.textContent = "正在转移并核对文章…";
      dialog.querySelector("#category-transfer-cancel").disabled = true;
      let result;
      try { result = await supabaseClient.rpc("transfer_and_delete_category", {
        source_id: item.id, target_id: dialog.querySelector("select").value || null
      }); } catch (error) { result = { error }; }
      const { data, error } = result;
      button.disabled = false;
      dialog.querySelector("#category-transfer-cancel").disabled = false;
      if (error) { message.textContent = `未能确认完成：${error.message}。请刷新栏目列表核对后再操作。`; return; }
      dialog.close(); resetCategoryForm();
      await Promise.all([loadCategoryManager(), loadCategories()]);
      setMessage(`已转移 ${data?.moved || 0} 篇文章，并删除“${item.name}”。`, false, true);
      if (typeof loadArticles === "function") await loadArticles();
    });
    dialog.addEventListener("cancel", event => { if (dialog.querySelector("#category-transfer-submit").disabled) event.preventDefault(); });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  function resetCategoryForm() { $("category-form")?.reset(); setValue("category-id", ""); if ($("category-slug")) delete $("category-slug").dataset.manual; setValue("category-sort", "100"); setCheck("category-active", true); setCheck("category-show-nav", true); setCheck("category-show-home", true); setCheck("category-auto-fetch", false); setCheck("category-ai-rewrite", true); setCheck("category-auto-publish", false); setCheck("category-sitemap", true); setCheck("category-google-news", true); setCheck("category-rss", true); setCheck("category-push-x", false); setCheck("category-push-telegram", false); if ($("category-form-title")) $("category-form-title").textContent = "新增栏目"; if ($("category-submit")) $("category-submit").textContent = "保存栏目"; setMessage(""); }
  function syncSlugFromName() { if ($("category-id")?.value || $("category-slug")?.dataset.manual === "1") return; const slug = slugify($("category-name").value); if (slug) $("category-slug").value = slug; }
  function slugify(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, ""); }
  function normalizeSlug(value) { return slugify(String(value || "").replace(/^\/+|\/+$/g, "")); }
  function setAdvancedDisabled(disabled) { document.querySelectorAll(".category-cms-extra input,.category-cms-extra textarea").forEach(x => x.disabled = disabled); }
  function showSchemaWarning(text, error = false) { const node = $("category-schema-warning"); if (!node) return; node.textContent = text; node.className = `category-warning${text ? "" : " hidden"}${error ? " error" : ""}`; }
  function setCheck(id, value) { if ($(id)) $(id).checked = Boolean(value); }
  function setValue(id, value) { if ($(id)) $(id).value = value ?? ""; }
  function setMessage(text, isError = false, isSuccess = false) { const node = $("category-message"); if (node) { node.textContent = text; node.className = `message${isError ? " error" : ""}${isSuccess ? " success" : ""}`; } }
  function setStandardMessage(text, isError = false, isSuccess = false) { const node = $("category-standard-note"); if (node) { node.textContent = text; node.className = `message${isError ? " error" : ""}${isSuccess ? " success" : ""}`; } }
  function escapeText(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function escapeAttr(value) { return escapeText(value).replace(/`/g, "&#96;"); }

  window.TRRBCategoryManager = { load: loadCategoryManager, edit: editCategory, toggle: toggleCategory, move: moveCategory, remove: removeCategory };
})();

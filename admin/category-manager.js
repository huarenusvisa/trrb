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
    defaults("ICE","ice",10,{auto_fetch:true,auto_publish:true,seo_title:"ICE执法最新新闻｜唐人日报",seo_description:"追踪美国ICE执法、拘留、遣返及移民政策动态。",seo_keywords:"ICE,美国移民执法,遣返,拘留",ai_prompt:"写成客观、写实的中文新闻，核实人物、地点、时间与执法机构；不得把指控写成定罪。"}),
    defaults("Trump","trump",20,{auto_fetch:true,auto_publish:true,seo_title:"特朗普最新动态｜唐人日报",seo_description:"特朗普政府、白宫、选举及美国政策最新动态。",seo_keywords:"特朗普,白宫,美国政治",ai_prompt:"按新闻事实改写，明确消息来源、时间和政策背景，不添加未经证实的判断。"}),
    defaults("USCIS","uscis",30,{auto_fetch:true,seo_title:"USCIS移民局最新政策｜唐人日报",seo_description:"美国移民局政策、表格、费用和案件处理动态。",seo_keywords:"USCIS,美国移民局,移民政策",ai_prompt:"准确保留政策名称、表格编号、生效日期和适用人群；法律风险内容进入人工审核。"}),
    defaults("DHS","dhs",40,{auto_fetch:true,seo_title:"DHS国土安全部动态｜唐人日报",seo_description:"美国国土安全部政策与执法动态。",seo_keywords:"DHS,国土安全部,美国执法",ai_prompt:"以官方文件和可核实信息为主，标明尚未确认的内容。"}),
    defaults("CBP","cbp",50,{auto_fetch:true,seo_title:"CBP边境与海关动态｜唐人日报",seo_description:"美国海关与边境保护局执法及口岸政策动态。",seo_keywords:"CBP,美国边境,海关",ai_prompt:"准确区分CBP、ICE、HSI等机构，保留地点、数量和官方表述。"}),
    defaults("Visa","visa",60,{seo_title:"美国签证新闻与政策｜唐人日报",seo_description:"美国签证政策、领事程序与申请动态。",seo_keywords:"美国签证,签证政策,领事馆",ai_prompt:"保留签证类别、政策日期和官方来源，不提供保证性结论。"}),
    defaults("China","china",70,{seo_title:"中国新闻｜唐人日报",seo_description:"中国社会、官场与突发新闻。",seo_keywords:"中国新闻,中国官场,社会新闻",ai_prompt:"区分官方通报、网络信息和当事人说法；未获证实内容必须明确标注。"}),
    defaults("Politics","politics",80,{seo_title:"美国政治新闻｜唐人日报",seo_description:"美国国会、白宫、州政府和选举新闻。",seo_keywords:"美国政治,国会,选举",ai_prompt:"保持政治报道中立，准确引用不同阵营观点。"}),
    defaults("World","world",90,{seo_title:"国际新闻｜唐人日报",seo_description:"全球时政、冲突与重大事件。",seo_keywords:"国际新闻,全球时政",ai_prompt:"使用可靠来源，明确事件发生时间和地点，避免夸大未经证实的伤亡或结论。"})
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
      return `<article class="category-item ${item.is_active ? "" : "is-disabled"}"><div class="category-item-main"><div class="category-item-title"><strong>${escapeText(item.name)}</strong><span class="category-state ${item.is_active ? "on" : "off"}">${item.is_active ? "已启用" : "已停用"}</span></div><div class="category-meta"><code>/${escapeText(item.slug)}</code><span>排序 ${Number(item.sort_order || 0)}</span></div><div class="category-badges">${badges.map(x => `<span>${escapeText(x)}</span>`).join("")}</div></div><div class="category-actions"><button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}',-1)" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}',1)" ${index === allCategories.length - 1 ? "disabled" : ""}>下移</button><button type="button" onclick="TRRBCategoryManager.edit('${escapeAttr(item.id)}')">编辑</button><button type="button" onclick="TRRBCategoryManager.toggle('${escapeAttr(item.id)}',${item.is_active ? "false" : "true"})">${item.is_active ? "停用" : "启用"}</button><button type="button" class="danger" onclick="TRRBCategoryManager.remove('${escapeAttr(item.id)}')">删除</button></div></article>`;
    }).join("");
  }

  async function applyStandardCategories() {
    if (!canManageCategories()) return setStandardMessage("当前账号没有栏目管理权限。", true);
    if (!advancedSchemaReady) return setStandardMessage("请先完成栏目CMS数据库迁移。", true);
    if (!confirm("应用标准栏目及全部开关配置？其他自定义栏目不会被删除。")) return;
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
        const query = current ? supabaseClient.from("categories").update(standard).eq("id", current.id) : supabaseClient.from("categories").insert(standard);
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
  async function removeCategory(id) { if (!canManageCategories()) return; const item = allCategories.find(x => String(x.id) === String(id)); if (!item) return; const count = await supabaseClient.from("articles").select("id", { count: "exact", head: true }).eq("category_id", id); if (count.error) return alert(count.error.message); if ((count.count || 0) > 0) return alert(`栏目已有 ${count.count} 篇文章，请先转移文章或停用栏目。`); if (!confirm(`永久删除“${item.name}”？`)) return; const result = await supabaseClient.from("categories").delete().eq("id", id); if (result.error) return alert(result.error.message); resetCategoryForm(); await Promise.all([loadCategoryManager(), loadCategories()]); }

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

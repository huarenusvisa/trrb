(() => {
  const $ = (id) => document.getElementById(id);
  let allCategories = [];

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("category-form");
    if (!form) return;
    form.addEventListener("submit", saveCategory);
    $("category-reset")?.addEventListener("click", resetCategoryForm);
    $("refresh-categories")?.addEventListener("click", loadCategoryManager);
    $("category-name")?.addEventListener("input", syncSlugFromName);
    $("category-slug")?.addEventListener("input", () => { $("category-slug").dataset.manual = "1"; });

    document.querySelectorAll('.nav-btn[data-page="categories"]').forEach((button) => {
      button.addEventListener("click", () => {
        if ($("page-title")) $("page-title").textContent = "栏目管理";
        setTimeout(loadCategoryManager, 0);
      });
    });
  });

  function canManageCategories() {
    const role = String(currentAdmin?.role || "").toLowerCase();
    return role === "owner" || role === "admin";
  }

  async function loadCategoryManager() {
    const list = $("category-list");
    if (!list) return;
    list.innerHTML = '<div class="category-empty">正在读取栏目...</div>';

    const { data, error } = await supabaseClient
      .from("categories")
      .select("id,name,slug,sort_order,is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      list.innerHTML = `<div class="category-error">栏目读取失败：${escapeText(error.message)}</div>`;
      return;
    }

    allCategories = data || [];
    renderCategories();
  }

  function renderCategories() {
    const list = $("category-list");
    if (!list) return;
    if (!allCategories.length) {
      list.innerHTML = '<div class="category-empty">暂无栏目，请在左侧新增。</div>';
      return;
    }

    list.innerHTML = allCategories.map((item, index) => `
      <article class="category-item ${item.is_active ? "" : "is-disabled"}">
        <div class="category-item-main">
          <div class="category-item-title"><strong>${escapeText(item.name)}</strong><span class="category-state ${item.is_active ? "on" : "off"}">${item.is_active ? "已启用" : "已停用"}</span></div>
          <div class="category-meta"><code>/${escapeText(item.slug)}</code><span>排序 ${Number(item.sort_order || 0)}</span></div>
        </div>
        <div class="category-actions">
          <button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}', -1)" ${index === 0 ? "disabled" : ""}>上移</button>
          <button type="button" onclick="TRRBCategoryManager.move('${escapeAttr(item.id)}', 1)" ${index === allCategories.length - 1 ? "disabled" : ""}>下移</button>
          <button type="button" onclick="TRRBCategoryManager.edit('${escapeAttr(item.id)}')">编辑</button>
          <button type="button" onclick="TRRBCategoryManager.toggle('${escapeAttr(item.id)}', ${item.is_active ? "false" : "true"})">${item.is_active ? "停用" : "启用"}</button>
          <button type="button" class="danger" onclick="TRRBCategoryManager.remove('${escapeAttr(item.id)}')">删除</button>
        </div>
      </article>
    `).join("");
  }

  async function saveCategory(event) {
    event.preventDefault();
    if (!canManageCategories()) return setMessage("当前账号没有栏目管理权限。", true);

    const id = $("category-id").value.trim();
    const name = $("category-name").value.trim();
    const slug = normalizeSlug($("category-slug").value);
    const sortOrder = Number($("category-sort").value || 100);
    const isActive = $("category-active").checked;

    if (!name) return setMessage("请填写栏目名称。", true);
    if (!slug) return setMessage("请填写有效的网址英文名称，例如 ice。", true);

    const duplicate = allCategories.find((item) => String(item.slug).toLowerCase() === slug && String(item.id) !== id);
    if (duplicate) return setMessage(`网址 /${slug} 已被栏目“${duplicate.name}”使用。`, true);

    setMessage("正在保存...");
    const payload = { name, slug, sort_order: sortOrder, is_active: isActive };
    const query = id
      ? supabaseClient.from("categories").update(payload).eq("id", id)
      : supabaseClient.from("categories").insert(payload);
    const { error } = await query;

    if (error) return setMessage("保存失败：" + error.message, true);
    resetCategoryForm();
    await Promise.all([loadCategoryManager(), loadCategories()]);
    setMessage(id ? "栏目已更新。" : "栏目已新增。", false, true);
  }

  function editCategory(id) {
    const item = allCategories.find((row) => String(row.id) === String(id));
    if (!item) return;
    $("category-id").value = item.id;
    $("category-name").value = item.name || "";
    $("category-slug").value = item.slug || "";
    $("category-slug").dataset.manual = "1";
    $("category-sort").value = Number(item.sort_order || 0);
    $("category-active").checked = Boolean(item.is_active);
    $("category-form-title").textContent = "编辑栏目";
    $("category-submit").textContent = "保存修改";
    $("category-name").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleCategory(id, nextState) {
    if (!canManageCategories()) return alert("当前账号没有栏目管理权限。");
    const { error } = await supabaseClient.from("categories").update({ is_active: nextState }).eq("id", id);
    if (error) return alert("更新失败：" + error.message);
    await Promise.all([loadCategoryManager(), loadCategories()]);
  }

  async function moveCategory(id, direction) {
    if (!canManageCategories()) return alert("当前账号没有栏目管理权限。");
    const index = allCategories.findIndex((item) => String(item.id) === String(id));
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= allCategories.length) return;

    const current = allCategories[index];
    const target = allCategories[swapIndex];
    const currentOrder = Number(current.sort_order || index * 10 + 10);
    const targetOrder = Number(target.sort_order || swapIndex * 10 + 10);

    const first = await supabaseClient.from("categories").update({ sort_order: targetOrder }).eq("id", current.id);
    if (first.error) return alert("排序失败：" + first.error.message);
    const second = await supabaseClient.from("categories").update({ sort_order: currentOrder }).eq("id", target.id);
    if (second.error) return alert("排序失败：" + second.error.message);
    await Promise.all([loadCategoryManager(), loadCategories()]);
  }

  async function removeCategory(id) {
    if (!canManageCategories()) return alert("当前账号没有栏目管理权限。");
    const item = allCategories.find((row) => String(row.id) === String(id));
    if (!item) return;

    const { count, error: countError } = await supabaseClient
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if (countError) return alert("无法检查栏目文章：" + countError.message);
    if ((count || 0) > 0) {
      return alert(`栏目“${item.name}”已有 ${count} 篇文章，不能直接删除。请先停用栏目，或将文章转移到其他栏目。`);
    }

    if (!confirm(`确定永久删除栏目“${item.name}”吗？此操作无法撤销。`)) return;
    const { error } = await supabaseClient.from("categories").delete().eq("id", id);
    if (error) return alert("删除失败：" + error.message);
    resetCategoryForm();
    await Promise.all([loadCategoryManager(), loadCategories()]);
  }

  function resetCategoryForm() {
    $("category-form")?.reset();
    if ($("category-id")) $("category-id").value = "";
    if ($("category-slug")) delete $("category-slug").dataset.manual;
    if ($("category-sort")) $("category-sort").value = "100";
    if ($("category-active")) $("category-active").checked = true;
    if ($("category-form-title")) $("category-form-title").textContent = "新增栏目";
    if ($("category-submit")) $("category-submit").textContent = "保存栏目";
    setMessage("");
  }

  function syncSlugFromName() {
    if ($("category-id")?.value || $("category-slug")?.dataset.manual === "1") return;
    const generated = slugify($("category-name").value);
    if (generated) $("category-slug").value = generated;
  }

  function slugify(value) {
    return String(value || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normalizeSlug(value) {
    return slugify(String(value || "").replace(/^\/+|\/+$/g, ""));
  }

  function setMessage(text, isError = false, isSuccess = false) {
    const node = $("category-message");
    if (!node) return;
    node.textContent = text;
    node.className = `message${isError ? " error" : ""}${isSuccess ? " success" : ""}`;
  }

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function escapeAttr(value) {
    return escapeText(value).replace(/`/g, "&#96;");
  }

  window.TRRBCategoryManager = {
    load: loadCategoryManager,
    edit: editCategory,
    toggle: toggleCategory,
    move: moveCategory,
    remove: removeCategory
  };
})();
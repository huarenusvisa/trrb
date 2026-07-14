(() => {
  "use strict";

  const API = "/.netlify/functions/admin-articles";
  const BACKGROUND_API = "/.netlify/functions/admin-article-ai-publish-background";
  const originalShowPage = showPage;
  let titleTimer = null;
  let titleRequestPending = false;
  let lastTitleSignature = "";

  async function authToken() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    return token;
  }

  async function publisherApi(action, payload = {}) {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await authToken()}`
      },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `文章接口失败（${response.status}）`);
    return result;
  }

  async function startBackgroundPublication(articleId) {
    const response = await fetch(BACKGROUND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await authToken()}`
      },
      body: JSON.stringify({ article_id: articleId })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `AI后台发布启动失败（${response.status}）`);
    }
  }

  showPage = function showPageWithPublisherMode(page) {
    originalShowPage(page);
    document.body.classList.toggle("publisher-mode", page === "new-article");
  };

  function categoryName() {
    return el("article-category").selectedOptions?.[0]?.textContent || "重要新闻";
  }

  function titleSignature() {
    const content = el("article-content").value.trim();
    return `${categoryName()}|${content.length}|${content.slice(0, 160)}|${content.slice(-80)}`;
  }

  function renderTitleSuggestions(titles = []) {
    const wrap = el("article-title-suggestions");
    if (!wrap) return;
    wrap.innerHTML = titles.length
      ? titles.map((title, index) => `
        <button type="button" class="title-suggestion" data-title-suggestion="${escapeAttr(title)}">
          <span>${index + 1}</span>${escapeHtml(title)}
        </button>
      `).join("")
      : `<span class="title-suggestion-empty">正文输入后，AI会自动推荐3个标题。</span>`;

    wrap.querySelectorAll("[data-title-suggestion]").forEach((button) => {
      button.addEventListener("click", () => {
        el("article-title").value = button.dataset.titleSuggestion || "";
        wrap.querySelectorAll(".title-suggestion").forEach((item) => item.classList.toggle("selected", item === button));
        el("article-title").focus();
      });
    });
  }

  async function requestTitleSuggestions(force = false) {
    const content = el("article-content").value.trim();
    const status = el("article-title-status");
    if (content.length < 50) {
      if (force && status) status.textContent = "正文至少需要50个字。";
      return;
    }
    const signature = titleSignature();
    if (!force && (signature === lastTitleSignature || titleRequestPending)) return;

    titleRequestPending = true;
    if (status) status.textContent = "AI正在生成3个标题…";
    try {
      const result = await publisherApi("suggest_titles", {
        content,
        category_name: categoryName()
      });
      renderTitleSuggestions(result.titles || []);
      lastTitleSignature = signature;
      if (status) status.textContent = "请选择一个标题，也可以继续人工修改。";
      if (!el("article-title").value.trim() && result.titles?.[0]) {
        el("article-title").value = result.titles[0];
        el("article-title-suggestions")?.querySelector(".title-suggestion")?.classList.add("selected");
      }
    } catch (error) {
      console.error(error);
      if (status) status.textContent = `标题推荐失败：${error.message}`;
    } finally {
      titleRequestPending = false;
    }
  }

  function scheduleTitleSuggestions() {
    window.clearTimeout(titleTimer);
    titleTimer = window.setTimeout(() => requestTitleSuggestions(false), 1200);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(reader.error || new Error("读取封面失败"));
      reader.readAsDataURL(blob);
    });
  }

  async function forceWebp(file) {
    if (file.type !== "image/gif") return optimizeImage(file, 1600, 0.84);
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("GIF封面转换失败")),
      "image/webp",
      0.84
    ));
  }

  uploadCoverImage = async function uploadCoverImageV2(file) {
    const progress = el("article-cover-progress");
    progress.classList.remove("hidden");
    progress.textContent = "正在压缩封面…";
    const optimized = await forceWebp(file);
    progress.textContent = `正在安全上传 ${(optimized.size / 1024).toFixed(0)}KB…`;
    const result = await publisherApi("upload_cover", {
      mime_type: optimized.type || "image/webp",
      data_base64: await blobToBase64(optimized)
    });
    if (!result.url) throw new Error("封面上传完成，但没有返回图片地址");
    progress.textContent = "封面上传成功。";
    return result.url;
  };

  generateAiCover = async function generateAiCoverV2(options = {}) {
    const title = el("article-title").value.trim();
    const content = el("article-content").value.trim();
    const progress = el("ai-cover-progress");
    if (!title || content.length < 30) {
      if (!options.silent) alert("请先填写标题和正文。");
      return "";
    }
    progress.classList.remove("hidden");
    progress.textContent = "AI正在生成16:9新闻封面…";
    try {
      const result = await publisherApi("generate_cover", {
        title,
        content: content.slice(0, 4000),
        category_name: categoryName()
      });
      if (!result.url) throw new Error("AI没有返回封面地址");
      el("article-cover").value = result.url;
      el("article-cover-preview").src = result.url;
      el("article-cover-preview-wrap").classList.remove("hidden");
      progress.textContent = "AI封面已生成。";
      return result.url;
    } catch (error) {
      progress.textContent = `AI封面失败：${error.message}`;
      if (!options.silent) alert(progress.textContent);
      return "";
    }
  };

  function renderArticleRowWithAiState(article) {
    const metadata = article.metadata && typeof article.metadata === "object" ? article.metadata : {};
    const processing = Boolean(metadata.ai_cover_processing);
    const failed = Boolean(metadata.ai_cover_error);
    const statusText = processing
      ? "AI封面生成中"
      : failed
        ? "AI封面失败"
        : statusLabel(article.status);
    const statusClass = processing ? "status-draft" : failed ? "status-hidden" : `status-${escapeHtml(article.status)}`;
    return `
      <tr>
        <td><b>${escapeHtml(article.title)}</b><br><small>${escapeHtml(article.id)}</small></td>
        <td>${escapeHtml(article.category_name || "-")}</td>
        <td><span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span>${failed ? `<br><small>${escapeHtml(metadata.ai_cover_error)}</small>` : ""}</td>
        <td>${escapeHtml(formatDate(article.published_at || article.created_at))}</td>
        <td>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','published')">发布</button>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','draft')">草稿</button>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','hidden')">隐藏</button>
        </td>
      </tr>
    `;
  }

  loadArticles = async function loadArticlesV2() {
    try {
      const result = await publisherApi("list");
      const articles = result.articles || [];
      el("count-articles").textContent = articles.length;
      el("count-published").textContent = articles.filter((item) => item.status === "published").length;
      el("count-draft").textContent = articles.filter((item) => item.status === "draft").length;
      el("articles-tbody").innerHTML = articles.length
        ? articles.map(renderArticleRowWithAiState).join("")
        : `<tr><td colspan="5">暂无文章。</td></tr>`;
    } catch (error) {
      console.error(error);
      el("articles-tbody").innerHTML = `<tr><td colspan="5">文章读取失败：${escapeHtml(error.message)}</td></tr>`;
    }
  };

  window.changeArticleStatus = async function changeArticleStatusV2(id, status) {
    try {
      await publisherApi("status", { article_id: id, status });
      await loadArticles();
    } catch (error) {
      alert(`更新失败：${error.message}`);
    }
  };

  handleSaveArticle = async function handleSaveArticleV2(event) {
    event.preventDefault();
    const selected = el("article-category");
    const title = el("article-title").value.trim();
    const content = el("article-content").value.trim();
    const status = el("article-status").value;
    const autoAiCover = el("auto-ai-cover").checked;
    const submitButton = el("article-submit");

    if (title.length < 5 || content.length < 30) {
      el("article-message").textContent = "请填写至少5个字的标题和至少30个字的正文。";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = status === "published" ? "正在发布…" : "正在保存…";
    el("article-message").textContent = selectedCoverFile
      ? "正在上传封面…"
      : (status === "published" && autoAiCover && !el("article-cover").value.trim()
        ? "正在保存文章并启动AI后台封面任务…"
        : "正在自动生成摘要、SEO并保存…");

    try {
      let coverImage = el("article-cover").value.trim();
      if (selectedCoverFile) {
        coverImage = await uploadCoverImage(selectedCoverFile, title);
        el("article-cover").value = coverImage;
      }

      const result = await publisherApi("save_article", {
        title,
        content,
        category_id: selected.value || null,
        category_name: categoryName(),
        cover_image: coverImage,
        auto_ai_cover: autoAiCover,
        author: el("article-author").value.trim() || "Tang Ren Daily",
        status
      });

      if (result.background_required && result.background_article_id) {
        await startBackgroundPublication(result.background_article_id);
        el("article-message").textContent = "文章已保存。AI正在后台生成封面，完成后会自动发布到前台。";
      } else if (result.article?.status === "published") {
        el("article-message").textContent = "发布成功。摘要和SEO已自动生成。";
      } else {
        el("article-message").textContent = "草稿保存成功，摘要和SEO已自动生成。";
      }

      el("article-form").reset();
      el("article-author").value = "Tang Ren Daily";
      el("article-status").value = "published";
      el("auto-ai-cover").checked = true;
      clearCoverSelection();
      renderTitleSuggestions([]);
      lastTitleSignature = "";
      updateSubmitLabel();
      await loadArticles();
      window.setTimeout(() => showPage("articles"), 900);
    } catch (error) {
      console.error(error);
      el("article-message").textContent = `发布失败：${error.message}`;
    } finally {
      submitButton.disabled = false;
      updateSubmitLabel();
    }
  };

  function updateSubmitLabel() {
    const button = el("article-submit");
    if (!button) return;
    button.textContent = el("article-status")?.value === "published" ? "发布文章" : "保存草稿";
  }

  function installPublisherUi() {
    renderTitleSuggestions([]);
    el("article-content")?.addEventListener("input", scheduleTitleSuggestions);
    el("article-content")?.addEventListener("blur", () => requestTitleSuggestions(false));
    el("article-category")?.addEventListener("change", () => requestTitleSuggestions(false));
    el("refresh-title-suggestions")?.addEventListener("click", () => requestTitleSuggestions(true));
    el("article-status")?.addEventListener("change", updateSubmitLabel);
    updateSubmitLabel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPublisherUi, { once: true });
  } else {
    installPublisherUi();
  }
})();

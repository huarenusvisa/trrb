(() => {
  "use strict";

  const API = "/.netlify/functions/admin-articles";
  const BACKGROUND_API = "/.netlify/functions/admin-article-ai-publish-background";
  const ICE_CATEGORIES = new Set(["ICE执法动态", "ICE执法", "驱逐快报"]);
  let titleTimer = null;
  let titleRequestPending = false;
  let lastTitleSignature = "";

  async function authToken() {
    const { data } = await supabaseClient.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("登录状态已失效，请重新登录。");
    return token;
  }

  const uploadedCovers=new WeakMap();
  async function publisherApi(action, payload = {}) {
    if(["save_article","upload_cover","publication_status"].includes(action))return window.TrrbManualPublish.call({api:API,token:await authToken(),action,payload});
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

  document.addEventListener("trrb:admin-page-shown", (event) => {
    document.body.classList.toggle("publisher-mode", event.detail?.page === "new-article");
  });

  function categoryName() {
    return el("article-category").selectedOptions?.[0]?.textContent || "美国时政";
  }

  function isIceBriefCategory() {
    return ICE_CATEGORIES.has(categoryName().trim());
  }

  function contentMeetsPublishMinimum(content) {
    const text = String(content || "").trim();
    return text.length > 0;
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
      if (force && status) status.textContent = isIceBriefCategory()
        ? "短ICE快讯可直接填写标题并发布；AI标题建议需至少50个字。"
        : "正文至少需要50个字，才能生成AI标题建议。";
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
    if (!title || !contentMeetsPublishMinimum(content)) {
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

  function focusModeLabel(mode) {
    if (mode === "force") return "首页置顶";
    if (mode === "exclude") return "不推荐";
    return "自动推荐";
  }

  function renderArticleRowWithAiState(article) {
    const metadata = article.metadata && typeof article.metadata === "object" ? article.metadata : {};
    const processing = Boolean(metadata.ai_cover_processing);
    const failed = Boolean(metadata.ai_cover_error);
    const pin=window.TrrbArticlePins.pinState(article);
    const focusMode=pin.mode;
    const statusText = processing
      ? "AI封面生成中"
      : failed
        ? "AI封面失败"
        : statusLabel(article.status);
    const statusClass = processing ? "status-draft" : failed ? "status-hidden" : `status-${escapeHtml(article.status)}`;
    return `
      <tr data-article-row="${escapeAttr(article.id)}">
        <td><b>${escapeHtml(article.title)}</b><br><small>${escapeHtml(article.id)}</small></td>
        <td>${escapeHtml(article.category_label || article.category_name || "-")}<br><small>${escapeHtml(focusModeLabel(focusMode))}</small>${pin.active?`<br><small>到期：${escapeHtml(formatDate(pin.expires_at))}（48小时）</small>`:""}</td>
        <td><span class="status-pill ${statusClass}">${escapeHtml(statusText)}</span>${failed ? `<br><small>${escapeHtml(metadata.ai_cover_error)}</small>` : ""}</td>
        <td>${escapeHtml(formatDate(article.published_at || article.created_at))}</td>
        <td>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','published')">发布</button>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','draft')">草稿</button>
          <button class="small-btn" onclick="changeArticleStatus('${escapeAttr(article.id)}','hidden')">隐藏</button>
          <br>
          ${pin.active ? `<button class="small-btn" onclick="setHomepageFocusMode('${escapeAttr(article.id)}','auto')">取消置顶</button>` : `<button class="small-btn" ${article.status!=='published'||article.visibility!=='public'?'disabled':''} onclick="setHomepageFocusMode('${escapeAttr(article.id)}','force')">置顶48小时</button>`}
          <button class="small-btn" onclick="setHomepageFocusMode('${escapeAttr(article.id)}','auto')">恢复自动推荐</button>
          <button class="small-btn" onclick="setHomepageFocusMode('${escapeAttr(article.id)}','exclude')">不推荐</button>
        </td>
      </tr>
    `;
  }

  let articleRows = new Map();
  const pendingPinActions = new Set();
  let articlePage = 1;
  let articleSearch = "";
  let articleStatus = "";
  let articleRequest = 0;
  document.addEventListener("DOMContentLoaded", () => {
    el("articles-search-form")?.addEventListener("submit", event => {
      event.preventDefault(); articleSearch = el("articles-search").value.trim(); articlePage = 1; loadArticles();
    });
    el("articles-status")?.addEventListener("change", () => {
      articleStatus = el("articles-status").value; articlePage = 1; loadArticles();
    });
    el("articles-search-clear")?.addEventListener("click", () => {
      el("articles-search").value = ""; articleSearch = ""; articlePage = 1; loadArticles();
    });
    el("articles-pagination")?.addEventListener("click", event => {
      const button = event.target.closest("[data-article-page]");
      if (button) { articlePage = Number(button.dataset.articlePage); loadArticles(); }
    });
  });

  loadArticles = async function loadArticlesV2() {
    const request = ++articleRequest;
    el("articles-list-note").textContent = "正在查询…";
    try {
      const result = await publisherApi("list", { q: articleSearch, status: articleStatus, page: articlePage, page_size: 50 });
      if (request !== articleRequest) return;
      el("articles-list-note").textContent = articleStatus === "pinned" ? `仅显示尚未到期的置顶文章，不受72小时列表限制；每条从置顶操作起算48小时，第${articlePage}页。` : articleSearch
        ? `全库搜索“${articleSearch}”，包含72小时以前的新闻；第${articlePage}页。`
        : `默认只显示最近72小时的新闻；更早新闻仍保留并正常公开，输入关键词即可查找。第${articlePage}页。`;
      if(result.search_notice)el("articles-list-note").textContent += " " + result.search_notice;
      el("articles-pagination").innerHTML = `${articlePage > 1 ? `<button type="button" data-article-page="${articlePage - 1}">上一页</button>` : ""}<span>第 ${articlePage} 页</span>${result.has_more ? `<button type="button" data-article-page="${articlePage + 1}">下一页</button>` : ""}`;
      const articles = result.articles || [];
      articleRows = new Map(articles.map(row=>[row.id,row]));
      ["articles", "published", "draft"].forEach(name => {
        const label = el(`count-${name}`)?.nextElementSibling;
        if (label) label.textContent = { articles: "本页文章", published: "本页已发布", draft: "本页草稿" }[name];
      });
      el("count-articles").textContent = articles.length;
      el("count-published").textContent = articles.filter((item) => item.status === "published").length;
      el("count-draft").textContent = articles.filter((item) => item.status === "draft").length;
      el("articles-tbody").innerHTML = articles.length
        ? articles.map(renderArticleRowWithAiState).join("")
        : `<tr><td colspan="5">暂无文章。</td></tr>`;
    } catch (error) {
      if (request !== articleRequest) return;
      console.error(error);
      el("articles-list-note").textContent = "查询失败，不代表文章不存在。";
      el("articles-pagination").innerHTML = "";
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

  window.setHomepageFocusMode = async function setHomepageFocusMode(id, mode) {
    if(pendingPinActions.has(id)||!['force','auto','exclude'].includes(mode))return;
    const article=articleRows.get(id);
    const title=article?.title || '这篇文章';
    const message=mode==='force'
      ? '确定将「'+title+'」置顶吗？从本次设置起48小时后自动取消，不会因编辑文章而延长。'
      : mode==='auto'
        ? '确定取消「'+title+'」的置顶并恢复自动推荐吗？文章仍然保留并公开。'
        : '确定取消「'+title+'」的置顶并设为不推荐吗？文章不会被删除。';
    if(!window.confirm(message))return;
    pendingPinActions.add(id);
    const notice=el('articles-pin-notice');
    const row=Array.from(document.querySelectorAll('[data-article-row]')).find(r=>r.dataset.articleRow===id);
    const buttons=Array.from(row?.querySelectorAll('button')||[]).map(b=>({button:b,disabled:b.disabled}));
    buttons.forEach(({button})=>button.disabled=true);
    notice.textContent='正在保存，请稍候…';
    try {
      const result=await publisherApi('pin',{article_id:id,mode});
      await loadArticles();
      notice.textContent=(result.message||'设置已保存')+(result.pin?.active&&result.pin.expires_at?' 到期时间：'+formatDate(result.pin.expires_at):'');
    } catch(error){notice.textContent='保存失败：'+error.message;}
    finally{pendingPinActions.delete(id);buttons.forEach(({button,disabled})=>button.disabled=disabled);}
  };

  handleSaveArticle = async function handleSaveArticleV2(event) {
    event.preventDefault();
    const selected = el("article-category");
    const title = el("article-title").value.trim();
    const content = el("article-content").value.trim();
    const status = el("article-status").value;
    const autoAiCover = el("auto-ai-cover").checked;
    const submitButton = el("article-submit");

    if (!title || !contentMeetsPublishMinimum(content)) {
      el("article-message").textContent = "请填写标题和正文。";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = status === "published" ? "正在发布…" : "正在保存…";
    el("article-message").textContent = selectedCoverFile
      ? "正在上传封面…"
      : "正在自动生成摘要、SEO并保存…";

    try {
      let coverImage = el("article-cover").value.trim();
      if (selectedCoverFile) {
        const file=selectedCoverFile;
        coverImage=uploadedCovers.get(file)||await uploadCoverImage(file,title);
        uploadedCovers.set(file,coverImage);
        el("article-cover").value=coverImage;
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

      if(!result.confirmed||!result.article?.id)throw new Error("发布结果尚未确认，请保留正文后核对。");
      if(title!==el("article-title").value.trim()||content!==el("article-content").value.trim()){
        el("article-message").textContent="刚才提交的版本已保存；你随后修改的内容仍保留在编辑框中，尚未提交。";
        return;
      }
      if (result.article?.status === "published" && result.article?.visibility === "public") {
        if (autoAiCover && !coverImage && result.article?.id) {
          startBackgroundPublication(result.article.id).catch((error) => {
            console.warn("可选AI封面生成失败，不影响文章发布", error);
          });
        }
        el("article-message").textContent = result.replayed ? "已核实文章保存成功，没有重复建稿。" : "发布成功，已收到数据库保存确认。";
      } else {
        el("article-message").textContent = "文章已保存，当前状态：" + statusLabel(result.article.status) + "。";
      }

      el("article-form").reset();
      el("article-author").value = "Tang Ren Daily";
      el("article-status").value = "published";
      el("auto-ai-cover").checked = false;
      clearCoverSelection();
      renderTitleSuggestions([]);
      lastTitleSignature = "";
      updateSubmitLabel();
      // A later list refresh failure is not a publication failure.
      loadArticles().catch(error=>console.warn("文章已保存，列表刷新暂时失败",error.message));
      window.setTimeout(() => showPage("articles"), 900);
    } catch (error) {
      console.error(error);
      el("article-message").textContent = error.message || "发布结果尚未确认，请保留正文后重试。";
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

  function suppressRetiredImportantCategory() {
    const select = el("article-category");
    if (!select) return;
    Array.from(select.options || []).forEach((option) => {
      if (["重要新闻", "ICE", "习近平"].includes(String(option.textContent || "").trim())) option.remove();
    });
    const politics = Array.from(select.options || []).find((option) => String(option.textContent || "").trim() === "美国时政");
    if (politics && !select.value) select.value = politics.value;
  }

  function installPublisherUi() {
    renderTitleSuggestions([]);
    el("article-content")?.addEventListener("input", scheduleTitleSuggestions);
    el("article-content")?.addEventListener("blur", () => requestTitleSuggestions(false));
    el("article-category")?.addEventListener("change", () => requestTitleSuggestions(false));
    el("refresh-title-suggestions")?.addEventListener("click", () => requestTitleSuggestions(true));
    el("article-status")?.addEventListener("change", updateSubmitLabel);
    const categorySelect = el("article-category");
    if (categorySelect) {
      suppressRetiredImportantCategory();
      new MutationObserver(suppressRetiredImportantCategory).observe(categorySelect, { childList: true });
    }
    updateSubmitLabel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPublisherUi, { once: true });
  } else {
    installPublisherUi();
  }
})();

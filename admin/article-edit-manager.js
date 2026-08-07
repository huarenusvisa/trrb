(function () {
  let activeArticle = null;
  let modal = null;

  const h = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function ensureModal() {
    if (modal) return modal;
    const wrap = document.createElement('div');
    wrap.id = 'article-edit-modal';
    wrap.className = 'hidden';
    wrap.innerHTML = `
      <div class="article-edit-backdrop" data-close-edit></div>
      <section class="article-edit-panel" role="dialog" aria-modal="true" aria-labelledby="article-edit-heading">
        <header class="article-edit-head">
          <h2 id="article-edit-heading">编辑文章</h2>
          <button type="button" class="icon-btn" data-close-edit>×</button>
        </header>
        <div class="article-edit-body">
          <label>标题</label>
          <input id="edit-article-title" maxlength="220" />

          <label>正文</label>
          <textarea id="edit-article-content" rows="15"></textarea>

          <label>封面图片</label>
          <input id="edit-article-cover" type="url" placeholder="https://..." />
          <input id="edit-article-cover-file" type="file" accept="image/*" />
          <div id="edit-article-cover-status" class="article-edit-note"></div>
          <img id="edit-article-cover-preview" alt="封面预览" class="article-edit-preview hidden" />

          <label>分类栏目</label>
          <select id="edit-article-category"></select>

          <label>发布状态</label>
          <select id="edit-article-status">
            <option value="published">立即发布</option>
            <option value="draft">保存草稿</option>
            <option value="hidden">隐藏 / 下线</option>
          </select>
          <div class="article-edit-note">修改栏目后直接选择“立即发布”并保存，文章会以新的栏目发布；隐藏只下线，不删除数据库记录。</div>

          <label>标签</label>
          <input id="edit-article-tags" placeholder="多个标签用逗号分隔" />

          <div id="edit-article-message" class="message"></div>
        </div>
        <footer class="article-edit-actions">
          <button type="button" class="secondary-btn" data-close-edit>取消</button>
          <button type="button" id="edit-article-save">保存修改</button>
        </footer>
      </section>`;
    document.body.appendChild(wrap);
    modal = wrap;

    if (!document.getElementById('article-edit-manager-style')) {
      const style = document.createElement('style');
      style.id = 'article-edit-manager-style';
      style.textContent = `
        #article-edit-modal{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
        #article-edit-modal.hidden{display:none}
        .article-edit-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.5)}
        .article-edit-panel{position:relative;width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25)}
        .article-edit-head,.article-edit-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid #e5e7eb}
        .article-edit-actions{border-top:1px solid #e5e7eb;border-bottom:0;justify-content:flex-end}
        .article-edit-head h2{margin:0}
        .article-edit-body{display:grid;gap:9px;padding:20px}
        .article-edit-body label{font-weight:700;margin-top:6px}
        .article-edit-body input,.article-edit-body select,.article-edit-body textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font:inherit}
        .article-edit-body textarea{resize:vertical;min-height:280px}
        .article-edit-preview{display:block;max-width:320px;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb}
        .article-edit-preview.hidden{display:none}
        .article-edit-note{font-size:13px;color:#6b7280}
        .article-edit-btn,.article-delete-btn{margin-right:5px}
        .article-delete-btn{background:#991b1b!important;color:#fff!important;border-color:#991b1b!important}
        @media (max-width:700px){#article-edit-modal{padding:0}.article-edit-panel{width:100%;height:100%;max-height:none;border-radius:0}.article-edit-body textarea{min-height:38vh}}
      `;
      document.head.appendChild(style);
    }

    wrap.querySelectorAll('[data-close-edit]').forEach((node) => node.addEventListener('click', closeEditor));
    wrap.querySelector('#edit-article-save').addEventListener('click', saveArticle);
    wrap.querySelector('#edit-article-cover').addEventListener('input', updatePreview);
    wrap.querySelector('#edit-article-cover-file').addEventListener('change', handleImageFile);
    return wrap;
  }

  function closeEditor() {
    if (!modal) return;
    modal.classList.add('hidden');
    activeArticle = null;
  }

  function fillCategories(article) {
    const select = document.getElementById('edit-article-category');
    const list = Array.isArray(window.categories) ? window.categories : (typeof categories !== 'undefined' ? categories : []);
    select.innerHTML = list.map((item) => `<option value="${h(item.id)}" data-name="${h(item.name)}">${h(item.name)}</option>`).join('');
    if (article.category_id && Array.from(select.options).some((o) => o.value === String(article.category_id))) {
      select.value = String(article.category_id);
    } else {
      const matched = Array.from(select.options).find((o) => o.dataset.name === String(article.category_name || ''));
      if (matched) select.value = matched.value;
    }
  }

  function updatePreview() {
    const url = document.getElementById('edit-article-cover').value.trim();
    const img = document.getElementById('edit-article-cover-preview');
    if (!url) {
      img.removeAttribute('src');
      img.classList.add('hidden');
      return;
    }
    img.src = url;
    img.classList.remove('hidden');
  }

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = document.getElementById('edit-article-cover-status');
    status.textContent = '正在上传图片...';
    try {
      if (typeof uploadCoverImage !== 'function') throw new Error('图片上传模块未加载');
      const title = document.getElementById('edit-article-title').value.trim() || 'article';
      const url = await uploadCoverImage(file, title);
      document.getElementById('edit-article-cover').value = url || '';
      updatePreview();
      status.textContent = '图片上传完成。';
    } catch (error) {
      status.textContent = `图片上传失败：${error?.message || error}`;
    }
  }

  async function editArticle(id) {
    ensureModal();
    const message = document.getElementById('edit-article-message');
    message.textContent = '正在读取文章...';
    modal.classList.remove('hidden');

    const { data, error } = await supabaseClient.from('articles').select('*').eq('id', id).single();
    if (error) {
      message.textContent = `读取失败：${error.message}`;
      return;
    }

    activeArticle = data;
    document.getElementById('edit-article-title').value = data.title || '';
    document.getElementById('edit-article-content').value = data.content || '';
    document.getElementById('edit-article-cover').value = data.cover_image || '';
    document.getElementById('edit-article-tags').value = ('tags' in data ? data.tags : data.seo_keywords) || '';
    document.getElementById('edit-article-status').value = ['published', 'draft', 'hidden'].includes(String(data.status || '')) ? data.status : 'draft';
    document.getElementById('edit-article-cover-file').value = '';
    document.getElementById('edit-article-cover-status').textContent = '';
    fillCategories(data);
    updatePreview();
    message.textContent = '';
  }

  async function saveArticle() {
    if (!activeArticle) return;
    const save = document.getElementById('edit-article-save');
    const message = document.getElementById('edit-article-message');
    const categorySelect = document.getElementById('edit-article-category');
    const option = categorySelect.selectedOptions?.[0];
    const title = document.getElementById('edit-article-title').value.trim();
    const content = document.getElementById('edit-article-content').value.trim();
    const cover = document.getElementById('edit-article-cover').value.trim();
    const tags = document.getElementById('edit-article-tags').value.trim();
    const status = document.getElementById('edit-article-status').value;

    if (!title || !content) {
      message.textContent = '标题和正文不能为空。';
      return;
    }

    const patch = {
      title,
      content,
      cover_image: cover,
      category_id: categorySelect.value || null,
      category_name: option?.textContent?.trim() || activeArticle.category_name || '',
      status
    };
    if ('tags' in activeArticle) patch.tags = tags;
    else patch.seo_keywords = tags;
    if ('updated_at' in activeArticle) patch.updated_at = new Date().toISOString();
    if (status === 'published' && activeArticle.status !== 'published') patch.published_at = new Date().toISOString();

    save.disabled = true;
    message.textContent = status === 'published' ? '正在保存并发布到新栏目...' : '正在保存...';
    const { error } = await supabaseClient.from('articles').update(patch).eq('id', activeArticle.id);
    save.disabled = false;
    if (error) {
      message.textContent = `保存失败：${error.message}`;
      return;
    }
    message.textContent = status === 'published' ? '修改已保存，并按当前所选栏目发布。' : '修改已保存。';
    if (typeof loadArticles === 'function') await loadArticles();
    setTimeout(closeEditor, 450);
  }

  async function deleteArticle(id, title) {
    const safeTitle = String(title || '').trim();
    const confirmed = window.confirm(`永久删除这篇文章？\n\n${safeTitle || id}\n\n删除后将从数据库中移除，前台无法恢复。若只是暂时下线，请使用“隐藏”。`);
    if (!confirmed) return;

    const finalConfirmed = window.confirm('再次确认：这是永久删除，不是隐藏。确定继续吗？');
    if (!finalConfirmed) return;

    try {
      const { error } = await supabaseClient.from('articles').delete().eq('id', id);
      if (error) throw error;
      if (typeof loadArticles === 'function') await loadArticles();
      alert('文章已从数据库永久删除。站点地图会在下一次构建时自动移除该文章URL。');
    } catch (error) {
      alert(`删除失败：${error?.message || error}\n\n如果提示权限不足，需要为 articles 表补充管理员 DELETE 策略。`);
    }
  }

  function injectButtons() {
    document.querySelectorAll('#articles-tbody tr').forEach((row) => {
      const id = row.querySelector('small')?.textContent?.trim();
      const box = row.querySelector('td:last-child');
      if (!id || !box) return;
      const title = row.querySelector('td:first-child b')?.textContent?.trim() || '';

      if (!row.querySelector('.article-edit-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'small-btn article-edit-btn';
        button.textContent = '编辑';
        button.addEventListener('click', () => editArticle(id));
        box.prepend(button);
      }

      if (!row.querySelector('.article-delete-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'small-btn article-delete-btn';
        button.textContent = '删除';
        button.title = '永久从数据库删除';
        button.addEventListener('click', () => deleteArticle(id, title));
        box.appendChild(button);
      }
    });
  }

  window.editArticle = editArticle;
  window.deleteArticle = deleteArticle;
  const observer = new MutationObserver(injectButtons);
  document.addEventListener('DOMContentLoaded', () => {
    ensureModal();
    const tbody = document.getElementById('articles-tbody');
    if (tbody) observer.observe(tbody, { childList: true, subtree: true });
    injectButtons();
  });
})();

(function () {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  let rows = [];

  async function load() {
    const body = document.getElementById('asylum-review-body');
    const message = document.getElementById('asylum-review-message');
    if (!body || typeof supabaseClient === 'undefined') return;
    message.textContent = '正在读取待审核内容…';
    const { data, error } = await supabaseClient.from('articles')
      .select('id,title,summary,category_name,status,visibility,metadata,created_at')
      .like('category_name', '移民美国·人道主义庇护·政治庇护·%')
      .eq('status', 'draft').order('created_at', { ascending: false }).limit(200);
    if (error) { message.textContent = `读取失败：${error.message}`; return; }
    rows = (data || []).filter((row) => row.metadata?.generated_by === 'asylum-official-knowledge-sync');
    document.getElementById('asylum-review-count').textContent = String(rows.length);
    message.textContent = rows.length ? `共有 ${rows.length} 条官方资料等待人工审核。` : '暂无待审核内容。';
    body.innerHTML = rows.length ? rows.map((row) => {
      const meta = row.metadata || {};
      const source = meta.source_type === 'bia_precedent' ? 'BIA先例判决' : 'USCIS官方知识';
      return `<tr><td><b>${esc(row.title)}</b><br><small>${esc(row.summary || '')}</small><br><a href="${esc(meta.official_url || '#')}" target="_blank" rel="noopener">查看官方原文 ↗</a></td><td>${esc(source)}<br><small>置信度 ${Math.round(Number(meta.confidence || 0) * 100)}%</small>${meta.citation ? `<br><small>${esc(meta.citation)}</small>` : ''}</td><td>${esc(meta.review_reason || '请核对官方原文、适用范围及是否被后续裁决修改。')}</td><td><button class="small-btn" data-asylum-action="publish" data-id="${esc(row.id)}">审核通过并发布三端</button> <button class="small-btn" data-asylum-action="reject" data-id="${esc(row.id)}">拒绝</button></td></tr>`;
    }).join('') : '<tr><td colspan="4">暂无待审核内容。</td></tr>';
  }

  async function act(button) {
    const row = rows.find((item) => String(item.id) === button.dataset.id);
    if (!row) return;
    const publish = button.dataset.asylumAction === 'publish';
    const verb = publish ? '发布到唐人日报电脑端、手机端和 AsylumJudge.com' : '拒绝并隐藏';
    if (!confirm(`确认${verb}“${row.title}”？`)) return;
    button.disabled = true;
    const metadata = { ...(row.metadata || {}), review_status: publish ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() };
    const patch = publish
      ? { status: 'published', visibility: 'public', published_at: new Date().toISOString(), metadata }
      : { status: 'hidden', visibility: 'private', metadata };
    const { error } = await supabaseClient.from('articles').update(patch).eq('id', row.id);
    button.disabled = false;
    if (error) return alert(`审核失败：${error.message}`);
    await load();
    if (typeof loadArticles === 'function') await loadArticles();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-asylum-action][data-id]');
    if (button) act(button);
  });
  document.getElementById('refresh-asylum-review')?.addEventListener('click', load);
  window.loadAsylumJudgeReview = load;
})();

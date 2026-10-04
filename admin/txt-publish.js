(() => {
  let raw = '', receipt = '', sending = false, generation = 0;
  const file = document.getElementById('txt-publish-file');
  const preview = document.getElementById('txt-publish-preview');
  const submit = document.getElementById('txt-publish-submit');
  const message = document.getElementById('txt-publish-message');
  async function api(action, txt) {
    const { data } = await window.supabaseClient.auth.getSession();
    if (!data.session) throw Error('请先登录后台');
    const response = await fetch('/.netlify/functions/admin-txt-publish', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ action, txt }), signal: AbortSignal.timeout(45000) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '请求失败');
    return result;
  }
  file.addEventListener('change', async () => {
    const current = ++generation; raw = ''; submit.disabled = true; preview.textContent = ''; message.textContent = '';
    const selected = file.files[0];
    if (!selected) return;
    try {
      if (!/\.txt$/i.test(selected.name) || selected.size > 200000) throw Error('请选择小于 200KB 的 TXT 文件');
      const txt = await selected.text();
      const result = await api('preview', txt);
      if (current !== generation) return;
      receipt = `trrb:admin-txt:${result.receipt}`;
      if (localStorage.getItem(receipt)) throw Error('这篇内容已有提交记录，请先检查目标账号内容，避免重复提交');
      raw = txt;
      preview.textContent = `${result.target === 'community' ? '社区 · ' + result.category : '个人主页动态'}\n${result.title}\n\n${result.content}`;
      submit.disabled = false;
    } catch (error) { if (current === generation) message.textContent = error.message; }
    finally { file.value = ''; }
  });
  submit.addEventListener('click', async () => {
    if (sending || !raw) return;
    try { localStorage.setItem(receipt, JSON.stringify({ state: 'sending', at: Date.now() })); }
    catch { message.textContent = '无法保存防重复提交记录，暂不发送。'; return; }
    sending = true; submit.disabled = true; file.disabled = true;
    const txt = raw; raw = ''; message.textContent = '正在提交…';
    try { const result = await api('publish', txt); localStorage.setItem(receipt, JSON.stringify({ state: 'sent', id: result.id, at: Date.now() })); message.textContent = `${result.pending ? '已提交，等待审核' : '已发布'} · ${result.id}`; }
    catch (error) { message.textContent = `${error.message} 请先检查目标账号内容，避免重复发布。`; }
    finally { sending = false; file.disabled = false; preview.textContent = ''; }
  });
  window.addEventListener('pagehide', () => { raw = ''; generation++; });
})();

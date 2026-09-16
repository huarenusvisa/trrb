(() => {
  const dialog = document.querySelector('#reader-tip-dialog');
  if (!dialog) return;
  let opener;
  const close = () => { if (!dialog.querySelector('form')?.dataset.sending) { dialog.close(); opener?.focus(); } };
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-reader-tip-open], a[href="#submit"]');
    if (!trigger) return;
    event.preventDefault(); opener = trigger;
    if (!dialog.open) dialog.showModal();
  });
  dialog.querySelector('[data-reader-tip-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (dialog.querySelector('form')?.dataset.sending) event.preventDefault(); });
  if (location.hash === '#submit') dialog.showModal();
  for (const form of document.querySelectorAll('form[name="daily-subscribe"], form[name="news-tip"]')) {
    const status = document.createElement('p');
    status.className = 'reader-form-status'; status.setAttribute('role', 'status');
    form.after(status);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (form.dataset.sending || !form.reportValidity()) return;
      const data = new FormData(form);
      const formName = form.getAttribute('name');
      data.set('form-name', formName);
      const tip = formName === 'news-tip';
      if (tip && !String(data.get('message') || '').trim()) { status.textContent = '请填写线索内容。'; return; }
      const file = data.get('attachment');
      if (file instanceof File && file.size > 7 * 1024 * 1024) { status.textContent = '附件请小于7MB，文字内容已保留。'; return; }
      form.dataset.sending = 'true';
      const controls = [...form.querySelectorAll('input,textarea,button')];
      controls.forEach(control => control.disabled = true);
      status.textContent = '正在提交…';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(form.action, {method:'POST',body:tip ? data : new URLSearchParams(data),signal:controller.signal});
        if (!response.ok) throw new Error('Submission failed');
        form.reset(); status.textContent = tip ? '线索已收到，将由编辑核实。' : '订阅登记成功。';
      } catch { status.textContent = '暂未确认提交成功，填写内容已保留，请稍后再试。'; }
      finally { clearTimeout(timeout); delete form.dataset.sending; controls.forEach(control => control.disabled = false); }
    });
  }
})();

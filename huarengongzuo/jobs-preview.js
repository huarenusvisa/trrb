(() => {
  if (!/^(www\.)?huarengongzuo\.com$/i.test(location.hostname)) return;
  const root = document.getElementById('jobs-results');
  if (!root) return;
  let timer;
  const pending = new WeakSet();
  function enhance(card, row) {
    if (!card.isConnected || card.dataset.hwPreview === 'true') return;
    const template = document.createElement('template');
    template.innerHTML = window.HWJobPreview.card(row);
    const content = template.content.firstElementChild;
    const foot = card.querySelector('.job-card-foot');
    const distance = [...card.querySelectorAll('.pill')].find(node => node.textContent.includes('miles'));
    const age = card.querySelector('.job-age');
    card.dataset.hwPreview = 'true';
    card.dataset.unifiedReady = 'true';
    card.classList.add('job-card', 'hw-preview-card');
    card.replaceChildren(...content.childNodes);
    if (distance) card.querySelector('.job-meta').append(distance);
    if (age) card.firstElementChild.append(age);
    if (foot) card.append(foot);
  }
  async function hydrate() {
    // The existing search owns filtering, ordering, pagination and map state.
    // Only enrich the current cards with the public, contactable job payload.
    root.querySelectorAll('.hw-preview-card .job-card-cta').forEach(link => {
      link.dataset.jobOpen = link.closest('[data-job-id]').dataset.jobId;
      if (link.textContent === '查看并联系') link.textContent = '查看完整详情';
    });
    const cards = [...root.querySelectorAll('.result-card[data-job-id]')]
      .filter(card => card.dataset.hwPreview !== 'true' && !pending.has(card));
    for (let offset = 0; offset < cards.length; offset += 60) {
      const batch = cards.slice(offset, offset + 60);
      batch.forEach(card => pending.add(card));
      try {
        const payload = await window.HWJobPreview.feed({limit:String(batch.length), ids:batch.map(card => card.dataset.jobId).join(',')});
        const rows = new Map(window.HWJobPreview.remember(payload.items).map(row => [String(row.id), row]));
        batch.forEach(card => {
          const row = rows.get(card.dataset.jobId);
          if (row) enhance(card, row);
          else if (card.isConnected) card.remove();
        });
      } catch {
        // Retain the original links if the preview service is unavailable.
      } finally { batch.forEach(card => pending.delete(card)); }
    }
  }
  function boot() {
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(hydrate, 50); })
      .observe(root, {childList:true, subtree:true});
    hydrate();
  }
  if (window.HWJobPreview) boot();
  else {
    window.addEventListener('hw:preview-ready', boot, {once:true});
    const script = document.createElement('script');
    script.src = '/huarengongzuo/site.js?v=20260914-search1';
    document.head.appendChild(script);
  }
})();

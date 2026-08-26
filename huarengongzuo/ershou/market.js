(() => {
  const panel = document.getElementById('publish-panel');
  const openers = document.querySelectorAll('[data-open-publish]');
  const closers = document.querySelectorAll('[data-close-publish]');
  const open = () => { panel.hidden = false; document.body.classList.add('modal-open'); panel.querySelector('input[name="title"]')?.focus(); };
  const close = () => { panel.hidden = true; document.body.classList.remove('modal-open'); };
  openers.forEach((button) => button.addEventListener('click', open));
  closers.forEach((button) => button.addEventListener('click', close));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) close(); });

  const keyword = document.getElementById('search-keyword');
  const place = document.getElementById('search-place');
  const filterCopy = document.getElementById('filter-copy');
  const params = new URLSearchParams(location.search);
  keyword.value = params.get('q') || '';
  place.value = params.get('place') || '';
  const selectedCategory = params.get('category') || '';
  document.querySelectorAll('[data-category]').forEach((link) => {
    const url = new URL(link.href, location.href);
    if (place.value) url.searchParams.set('place', place.value);
    link.href = `${url.pathname}${url.search}`;
    if (url.searchParams.get('category') === selectedCategory) link.classList.add('active');
  });
  const describeFilter = () => {
    const parts = [keyword.value.trim(), place.value.trim()].filter(Boolean);
    if (selectedCategory) parts.unshift(document.querySelector('.category-grid a.active b')?.textContent || '所选分类');
    if (parts.length) filterCopy.textContent = `已选择：${parts.join(' · ')}。首批商品审核通过后会在这里展示。`;
  };
  describeFilter();
  document.getElementById('market-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (keyword.value.trim()) next.set('q', keyword.value.trim());
    if (place.value.trim()) next.set('place', place.value.trim());
    if (selectedCategory) next.set('category', selectedCategory);
    location.search = next.toString();
  });
  document.querySelectorAll('[data-place]').forEach((button) => button.addEventListener('click', () => {
    place.value = button.dataset.place || '';
    document.getElementById('market-search').requestSubmit();
  }));
})();

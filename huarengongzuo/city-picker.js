(() => {
  const input = document.getElementById('place-q');
  const trigger = document.getElementById('choose-cities');
  if (!input || !trigger) return;
  const esc = value => String(value).replace(/[&<>"']/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase().trim();
  let catalog, selected = new Map(), state = 'ALL', sort = 'popular', query = '';
  const dialog = document.createElement('dialog');
  dialog.className = 'city-dialog';
  dialog.setAttribute('aria-labelledby','city-picker-title');
  dialog.innerHTML = `<header><h2 id="city-picker-title">地区选择</h2><button type="button" data-dismiss aria-label="关闭地区选择">关闭 ×</button></header><div class="city-search"><input type="search" id="city-search" placeholder="搜索中文、英文城市或州" aria-label="搜索城市"><p>可多选常用城市，或选择全州；地址和邮编可直接在首页输入。</p></div><div class="city-sort"><strong>常用城市</strong><div><button type="button" data-sort="popular" aria-pressed="true">常用顺序</button><button type="button" data-sort="alpha" aria-pressed="false">按字母</button></div></div><div class="city-columns"><nav class="city-states" aria-label="选择州"></nav><section class="city-options" aria-label="选择城市"></section></div><footer><div class="city-selections" aria-label="已选地区"></div><div class="city-confirm-row"><span id="city-selection-count" role="status"></span><button type="button" data-clear>清除</button><button type="button" data-confirm>确认地区</button></div></footer>`;
  document.body.append(dialog);
  const note = document.createElement('p'); note.className = 'city-limit-note'; note.setAttribute('role','status'); dialog.querySelector('footer').prepend(note);
  function render() {
    if (!catalog) return;
    dialog.querySelector('.city-states').innerHTML = [{code:'ALL',zh:'全美'},...catalog.states].map(row => `<button type="button" data-state="${row.code}" aria-pressed="${state === row.code}">${esc(row.code === 'ALL' ? 'ALL 全美' : row.code+' '+row.zh)} <span>›</span></button>`).join('');
    const search = normalize(query);
    const matchingStates = catalog.states.filter(row => [row.code,row.zh].some(value => normalize(value).includes(search)));
    let cities = catalog.cities.filter(city => (state === 'ALL' || city.state === state) && (!search || [city.en,city.zh,...city.aliases].some(value => normalize(value).includes(search)) || matchingStates.some(row => row.code === city.state)));
    if (sort === 'alpha') cities = [...cities].sort((a,b) => a.en.localeCompare(b.en));
    const cityButton = city => `<button type="button" data-select="${esc(city.en)}" data-label="${esc(city.zh)}" aria-pressed="${selected.has(city.en)}"><span><strong>${esc(city.zh)}</strong><small>${esc(city.en)} · ${esc(city.state)}</small></span><b>${selected.has(city.en) ? '✓' : '+'}</b></button>`;
    const allState = catalog.states.find(row => row.code === state);
    const statewide = allState ? `<button type="button" data-select="${esc(allState.zh)}" data-label="${esc('全'+allState.zh)}" aria-pressed="${selected.has(allState.zh)}"><span><strong>${esc('全'+allState.zh)}</strong><small>All ${esc(state)}</small></span><b>${selected.has(allState.zh) ? '✓' : '+'}</b></button>` : '';
    const laCities = ['Los Angeles','Monterey Park','San Gabriel','Rosemead','Rowland Heights','Pasadena','Walnut','West Covina','Baldwin Park'];
    let groups = '';
    if (state === 'CA' && !search) {
      groups = `<details class="city-county"><summary>洛杉矶县 <small>Los Angeles County</small></summary><div>${cities.filter(city => laCities.includes(city.en)).map(cityButton).join('')}</div></details>`;
      cities = cities.filter(city => !laCities.includes(city.en));
    }
    dialog.querySelector('.city-options').innerHTML = statewide + groups + cities.map(cityButton).join('') + (!cities.length && !groups ? '<p class="city-no-results">暂无匹配的常用城市。可选择全州，或在首页直接输入城市、地址或邮编。</p>' : '');
    dialog.querySelector('.city-selections').innerHTML = [...selected].map(([value,label]) => `<button type="button" data-remove="${esc(value)}" aria-label="移除${esc(label)}">${esc(label)} ×</button>`).join('');
    dialog.querySelector('#city-selection-count').textContent = `已选：${selected.size}`;
    dialog.querySelectorAll('[data-sort]').forEach(button => button.setAttribute('aria-pressed',button.dataset.sort === sort));
  }
  trigger.addEventListener('click',async () => {
    selected = new Map(); query = ''; state = 'ALL'; dialog.querySelector('#city-search').value = ''; note.textContent = '';
    dialog.showModal(); dialog.querySelector('.city-options').textContent = '正在加载城市…';
    try {
      if (!catalog) {const response = await fetch('/huarengongzuo/regions.json?v=20261002');if (!response.ok) throw new Error();catalog = await response.json();}
      input.value.split(';').map(value => value.trim()).filter(Boolean).slice(0,10).forEach(value => {
        const city = catalog.cities.find(row => [row.id,row.en,row.zh,...row.aliases].some(alias => normalize(alias) === normalize(value)));
        const region = catalog.states.find(row => normalize(row.code) === normalize(value) || row.zh === value);
        selected.set(city?.en || region?.zh || value,city?.zh || region?.zh || value);
      });
      render(); dialog.querySelector('#city-search').focus();
    } catch {dialog.querySelector('.city-options').textContent = '城市列表暂时未能载入，请关闭后重试。';}
  });
  dialog.querySelector('#city-search').addEventListener('input',event => {query=event.target.value;if (query) state='ALL';render();});
  dialog.addEventListener('click',event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-dismiss')) dialog.close();
    if (button.dataset.state) {state = button.dataset.state;render();}
    if (button.dataset.sort) {sort = button.dataset.sort;render();}
    if (button.dataset.select) {
      const value = button.dataset.select;
      if (selected.has(value)) selected.delete(value);
      else if (selected.size < 10) selected.set(value,button.dataset.label);
      else note.textContent = '一次最多选择 10 个地区，请先移除已选地区。';
      render();
    }
    if (button.dataset.remove) {selected.delete(button.dataset.remove);note.textContent = '';render();}
    if (button.hasAttribute('data-clear')) {selected.clear();note.textContent = '';render();}
    if (button.hasAttribute('data-confirm')) {
      input.value = [...selected.keys()].join(';');
      dialog.close();window.dispatchEvent(new Event('hw:cities-selected'));
    }
  });
  dialog.addEventListener('click',event => {if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();}});
  dialog.addEventListener('close',()=>trigger.focus({preventScroll:true}));
})();

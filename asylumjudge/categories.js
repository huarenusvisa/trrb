
(() => {
  const stateSlugs = {"AZ":"arizona","CA":"california","CO":"colorado","CT":"connecticut","FL":"florida","GA":"georgia","GU":"guam","HI":"hawaii","IL":"illinois","IN":"indiana","LA":"louisiana","MA":"massachusetts","MD":"maryland","MI":"michigan","MN":"minnesota","MO":"missouri","MP":"northern-mariana-islands","NC":"north-carolina","NE":"nebraska","NJ":"new-jersey","NM":"new-mexico","NV":"nevada","NY":"new-york","OH":"ohio","OR":"oregon","PA":"pennsylvania","PR":"puerto-rico","TN":"tennessee","TX":"texas","UT":"utah","VA":"virginia","WA":"washington"};
  const prefix = location.pathname.startsWith('/en/') ? '/en' : '';
  window.asylumJudgeStateUrl = (code, year) => stateSlugs[code]
    ? prefix + '/states/' + stateSlugs[code] + '/' + (year ? '?fy=' + encodeURIComponent(year) : '')
    : prefix + '/states/';
  if (!document.body.hasAttribute('data-category-page')) return;
  const panels = [...document.querySelectorAll('[data-year-panel]')];
  const years = panels.map(panel => panel.dataset.yearPanel);
  const search = document.querySelector('[data-category-search]');
  const minimum = document.querySelector('[data-category-minimum]');
  const sort = document.querySelector('[data-category-sort]');
  const status = document.querySelector('[data-category-status]');
  const en = document.documentElement.lang === 'en';
  let year = document.body.dataset.defaultYear;
  function filter() {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let shown = 0;
    for (const row of document.querySelectorAll('[data-category-filter-row]')) {
      row.hidden = (query && !row.textContent.toLocaleLowerCase().includes(query)) ||
        (minimum && row.hasAttribute('data-sample') && Number(row.dataset.sample) < Number(minimum.value));
      const panel = row.closest('[data-year-panel]');
      if (!row.hidden && (!panel || panel.dataset.yearPanel === year)) shown++;
    }
    if (sort) for (const body of document.querySelectorAll('[data-category-ranking] tbody')) {
      const field = sort.value === 'sample' ? 'sample' : 'rate';
      [...body.rows].sort((a,b)=>Number(b.dataset[field])-Number(a.dataset[field]) ||
        Number(b.dataset.sample)-Number(a.dataset.sample) || a.textContent.localeCompare(b.textContent)).forEach(row=>body.append(row));
    }
    if (status) status.textContent = shown ? (en ? shown + ' results' : '找到 ' + shown + ' 条结果') :
      (en ? 'No results. Try a different name or a lower sample threshold.' : '没有匹配结果，请更换关键词或降低样本门槛。');
  }
  function activate(next) {
    year = years.includes(String(next)) ? String(next) : document.body.dataset.defaultYear;
    panels.forEach(panel => { panel.hidden = panel.dataset.yearPanel !== year; });
    document.querySelectorAll('[data-category-year]').forEach(link => {
      if (link.dataset.categoryYear === year) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    });
    filter();
  }
  function sync() {
    const params = new URLSearchParams(location.search);
    if (search) search.value = params.get('q') || '';
    if (sort) sort.value = params.get('sort') === 'sample' ? 'sample' : 'rate';
    if (minimum) minimum.value = ['100','200','500'].includes(params.get('minimum')) ? params.get('minimum') : '100';
    activate(location.hash.match(/^#fy-(\d+)$/)?.[1] || params.get('fy') || document.body.dataset.defaultYear);
  }
  function updateURL(push) {
    const url = new URL(location.href);
    url.searchParams.set('fy', year);
    for (const [key,value] of [['q',search?.value.trim()],['minimum',minimum?.value],['sort',sort?.value]]) {
      if (value && !(key === 'minimum' && value === '100') && !(key === 'sort' && value === 'rate')) url.searchParams.set(key,value);
      else url.searchParams.delete(key);
    }
    url.hash = '';
    history[push ? 'pushState' : 'replaceState']({},'',url.pathname+url.search);
  }
  document.querySelectorAll('[data-category-year]').forEach(link=>link.addEventListener('click',event=>{
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); activate(link.dataset.categoryYear); updateURL(true);
  }));
  search?.addEventListener('input',()=>{filter();updateURL(false);});
  minimum?.addEventListener('change',()=>{filter();updateURL(false);});
  sort?.addEventListener('change',()=>{filter();updateURL(false);});
  window.addEventListener('popstate',sync);
  window.addEventListener('hashchange',sync);
  sync();
})();

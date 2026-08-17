(() => {
  const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
  let areas = [];

  function ensurePicker() {
    let picker = $('human-area-picker');
    if (picker) return picker;
    picker = document.createElement('section');
    picker.id = 'human-area-picker';
    picker.className = 'human-area-picker hidden';
    picker.setAttribute('aria-label','按熟悉地区选择找工地点');
    picker.innerHTML = '<div class="human-area-head"><strong>按熟悉地区选</strong><span>不用理解州 / County / Borough 的行政层级</span></div><div id="human-area-groups" class="human-area-groups"><span class="discovery-empty">正在加载常用地区…</span></div>';
    const panel = $('location-panel');
    const note = panel?.querySelector('.location-note');
    if (note) note.insertAdjacentElement('afterend', picker); else panel?.appendChild(picker);
    return picker;
  }

  function applyArea(row) {
    window.dispatchEvent(new CustomEvent('jobs:r2-search-area-selected', { detail: row }));
    if ($('location-panel')) $('location-panel').classList.add('hidden');
    if ($('human-area-picker')) $('human-area-picker').classList.add('hidden');
  }

  function render() {
    const box = $('human-area-groups');
    if (!box) return;
    const metros = areas.filter((row) => row.area_type === 'metro');
    if (!metros.length) {
      box.innerHTML = '<span class="discovery-empty">常用地区暂时不可用，你仍可使用ZIP或高级地区筛选。</span>';
      return;
    }
    box.innerHTML = metros.map((metro) => {
      const children = areas.filter((row) => row.area_type !== 'metro' && row.metro_slug === metro.slug && ['city','borough','neighborhood','region'].includes(row.area_type));
      if (!children.length) return '';
      return `<div class="human-area-group"><strong>${esc(metro.label_zh)}</strong><div class="human-area-buttons">${children.map((row) => `<button type="button" data-human-area="${esc(row.slug)}">${esc(row.label_zh)}</button>`).join('')}</div></div>`;
    }).join('');
  }

  async function loadAreas() {
    ensurePicker();
    const {data,error} = await client.from('job_discovery_areas').select('slug,label_zh,label_en,area_type,state_code,city,county,borough,neighborhood,metro_slug,center_latitude,center_longitude,default_radius_miles,sort_order').eq('is_active',true).order('sort_order');
    if (!error && data) areas = data;
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const picker = ensurePicker();
    const choose = $('choose-region');
    choose?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      picker.classList.toggle('hidden');
    }, true);
    picker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-human-area]');
      if (!button) return;
      const row = areas.find((item) => item.slug === button.dataset.humanArea);
      if (row) applyArea(row);
    });
    loadAreas();
  });
})();

(() => {
  const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
  const SUPABASE_KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const $=(id)=>document.getElementById(id);
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  function coarseArea(row){
    return [row.neighborhood,row.borough,row.city,row.county,row.state_code].filter(Boolean).slice(0,3).join(' · ') || row.public_label || '未标注';
  }

  function modeLabel(mode){
    return ({current_location:'跟随当前位置',fixed_location:'固定找工中心',zip:'ZIP',region:'固定地区',all_us:'全美国'})[mode] || mode || '未知';
  }

  function sourceLabel(source){
    return ({device_geolocation:'设备授权定位',manual_zip:'手动ZIP',manual_region:'手选地区',manual_map:'地图选区',ip_coarse:'IP粗定位',all_us:'全美国'})[source] || source || '未知';
  }

  function ensurePanel(){
    if($('jobs-location-governance-panel')) return;
    const jobsPage=$('jobs-admin-page');
    if(!jobsPage) return;
    const panel=document.createElement('div');
    panel.className='panel';
    panel.id='jobs-location-governance-panel';
    panel.innerHTML=`<div class="category-form-head"><div><h3>找工位置与推荐治理</h3><p>查看账号的找工模式、来源、公开地区和同步状态。为降低隐私暴露，后台不显示原始经纬度或家庭住址。</p></div><button type="button" id="refresh-job-locations">刷新位置状态</button></div><div id="job-locations-message" class="message"></div><div class="table-wrap"><table><thead><tr><th>账号</th><th>找工模式</th><th>来源</th><th>公开地区</th><th>位置精度</th><th>同步</th><th>更新时间</th></tr></thead><tbody id="job-locations-body"></tbody></table></div>`;
    jobsPage.appendChild(panel);
    $('refresh-job-locations')?.addEventListener('click',loadLocations);
  }

  async function isAdmin(){
    const {error}=await client.rpc('assert_jobs_admin');
    return !error;
  }

  async function loadLocations(){
    ensurePanel();
    const body=$('job-locations-body'), msg=$('job-locations-message');
    if(!body||!msg) return;
    msg.textContent='正在读取统一账号的找工位置状态…';
    const ok=await isAdmin();
    if(!ok){ msg.textContent='当前账号没有招聘求职管理权限。'; body.innerHTML=''; return; }
    const {data,error}=await client.from('job_search_locations').select('user_id,mode,source,public_label,state_code,city,county,borough,neighborhood,follow_current_location,latitude,longitude,updated_at').order('updated_at',{ascending:false}).limit(200);
    if(error){ msg.textContent=`读取失败：${error.message}`; body.innerHTML=''; return; }
    const rows=data||[];
    msg.textContent=`共 ${rows.length} 条找工位置偏好。这里只显示治理所需的最小信息。`;
    body.innerHTML=rows.length?rows.map((row)=>{
      const hasCenter=row.latitude!=null&&row.longitude!=null;
      const precision=row.source==='device_geolocation'?'已授权精确找工中心':(hasCenter?'已保存固定找工中心':'无精确坐标');
      return `<tr><td><code>${esc(String(row.user_id||'').slice(0,8))}…</code></td><td>${esc(modeLabel(row.mode))}</td><td>${esc(sourceLabel(row.source))}</td><td>${esc(row.public_label||coarseArea(row))}</td><td>${esc(precision)}</td><td>${row.follow_current_location?'跟随当前位置':'固定/手选'}</td><td>${esc(row.updated_at?new Date(row.updated_at).toLocaleString('zh-CN'):'—')}</td></tr>`;
    }).join(''):'<tr><td colspan="7">暂时没有找工位置偏好。</td></tr>';
  }

  function init(){
    ensurePanel();
    $('refresh-jobs-admin')?.addEventListener('click',()=>setTimeout(loadLocations,80));
    document.querySelector('[data-page="jobs-admin"]')?.addEventListener('click',()=>setTimeout(loadLocations,120));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
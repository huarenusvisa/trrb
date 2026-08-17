(function () {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const contactText = (row) => row.contact_method === 'platform' || !row.contact_method ? '站内联系' : `${row.contact_method}${row.contact_public && row.contact_value ? ` · ${row.contact_value}` : ' · 未公开'}`;

  async function loadJobsAdmin() {
    const message = document.getElementById('jobs-admin-message');
    const listingsBody = document.getElementById('jobs-listings-body');
    const seekersBody = document.getElementById('jobs-seekers-body');
    if (!message || !listingsBody || !seekersBody || typeof supabaseClient === 'undefined') return;
    message.textContent = '正在读取统一招聘求职数据…';

    const [listingsResult, seekersResult, profilesResult] = await Promise.all([
      supabaseClient.from('job_listings').select('id,employer_user_id,title,category_slug,employment_type,state_code,city,status,contact_method,contact_value,contact_public,created_at').order('created_at',{ascending:false}).limit(200),
      supabaseClient.from('job_seeker_posts').select('id,seeker_user_id,headline,state_code,city,status,created_at').order('created_at',{ascending:false}).limit(200),
      supabaseClient.from('job_seeker_profiles').select('user_id,display_name,experience,bio,target_role,target_state_code,target_city,target_county,target_borough,target_neighborhood,phone_public,email_public,updated_at').order('updated_at',{ascending:false}).limit(200)
    ]);

    if (listingsResult.error || seekersResult.error || profilesResult.error) {
      const error = listingsResult.error || seekersResult.error || profilesResult.error;
      message.textContent = `招聘求职数据读取失败：${error.message}`;
      return;
    }

    const listings = listingsResult.data || [];
    const seekers = seekersResult.data || [];
    const profiles = profilesResult.data || [];
    const profileByUser = new Map(profiles.map((row) => [row.user_id, row]));
    message.textContent = `已读取招聘 ${listings.length} 条、求职 ${seekers.length} 条、求职档案 ${profiles.length} 条。这里直接管理与 Web/APP 相同的正式数据表，不使用影子后台。`;

    listingsBody.innerHTML = listings.length ? listings.map((row) => `
      <tr><td><b>${esc(row.title)}</b><br><small>${esc(row.id)}</small><br><small>${esc(row.category_slug)} · ${esc(row.employment_type)} · ${esc(contactText(row))}</small></td><td><small>${esc(row.employer_user_id)}</small></td><td>${esc(row.state_code)} ${esc(row.city)}</td><td>${esc(row.status)}</td><td>
        <button class="small-btn" data-jobs-kind="listing" data-jobs-id="${esc(row.id)}" data-jobs-status="open">开放</button>
        <button class="small-btn" data-jobs-kind="listing" data-jobs-id="${esc(row.id)}" data-jobs-status="paused">暂停</button>
        <button class="small-btn" data-jobs-kind="listing" data-jobs-id="${esc(row.id)}" data-jobs-status="unlisted">下架</button>
      </td></tr>`).join('') : '<tr><td colspan="5">暂无招聘记录。</td></tr>';

    seekersBody.innerHTML = seekers.length ? seekers.map((row) => {
      const profile = profileByUser.get(row.seeker_user_id);
      const profileText = profile
        ? `${profile.display_name || '未填写姓名'} · 目标：${profile.target_role || row.headline || '未填写'}<br><small>经历：${esc((profile.experience || '').slice(0,180)) || '未填写'}${(profile.experience || '').length > 180 ? '…' : ''}</small><br><small>简介：${esc((profile.bio || '').slice(0,180)) || '未填写'}${(profile.bio || '').length > 180 ? '…' : ''}</small><br><small>公开电话：${profile.phone_public ? '是' : '否'} · 公开Email：${profile.email_public ? '是' : '否'}</small>`
        : '尚无对应求职档案';
      return `
      <tr><td><b>${esc(row.headline)}</b><br><small>${esc(row.id)}</small><br>${profileText}</td><td><small>${esc(row.seeker_user_id)}</small></td><td>${esc(row.state_code)} ${esc(row.city)}</td><td>${esc(row.status)}</td><td>
        <button class="small-btn" data-jobs-kind="seeker" data-jobs-id="${esc(row.id)}" data-jobs-status="seeking">求职中</button>
        <button class="small-btn" data-jobs-kind="seeker" data-jobs-id="${esc(row.id)}" data-jobs-status="paused">暂停</button>
        <button class="small-btn" data-jobs-kind="seeker" data-jobs-id="${esc(row.id)}" data-jobs-status="unlisted">下架</button>
        ${profile?.phone_public ? `<button class="small-btn" data-jobs-profile-user="${esc(row.seeker_user_id)}" data-jobs-profile-action="hide_phone">关闭电话公开</button>` : ''}
        ${profile?.email_public ? `<button class="small-btn" data-jobs-profile-user="${esc(row.seeker_user_id)}" data-jobs-profile-action="hide_email">关闭Email公开</button>` : ''}
      </td></tr>`;
    }).join('') : '<tr><td colspan="5">暂无求职记录。</td></tr>';
  }

  async function govern(event) {
    const statusButton = event.target.closest('[data-jobs-kind][data-jobs-id][data-jobs-status]');
    if (statusButton && typeof supabaseClient !== 'undefined') {
      const table = statusButton.dataset.jobsKind === 'listing' ? 'job_listings' : 'job_seeker_posts';
      const id = statusButton.dataset.jobsId;
      const status = statusButton.dataset.jobsStatus;
      statusButton.disabled = true;
      const { error } = await supabaseClient.from(table).update({status,updated_at:new Date().toISOString()}).eq('id',id);
      statusButton.disabled = false;
      if (error) {
        alert(`更新失败：${error.message}`);
        return;
      }
      await loadJobsAdmin();
      return;
    }

    const profileButton = event.target.closest('[data-jobs-profile-user][data-jobs-profile-action]');
    if (!profileButton || typeof supabaseClient === 'undefined') return;
    const userId = profileButton.dataset.jobsProfileUser;
    const action = profileButton.dataset.jobsProfileAction;
    const patch = action === 'hide_phone' ? {phone_public:false} : action === 'hide_email' ? {email_public:false} : null;
    if (!patch) return;
    profileButton.disabled = true;
    const { error } = await supabaseClient.from('job_seeker_profiles').update({...patch,updated_at:new Date().toISOString()}).eq('user_id',userId);
    profileButton.disabled = false;
    if (error) {
      alert(`档案治理失败：${error.message}`);
      return;
    }
    await loadJobsAdmin();
  }

  document.addEventListener('click', govern);
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('refresh-jobs-admin')?.addEventListener('click', loadJobsAdmin);
    document.querySelector('[data-page="jobs-admin"]')?.addEventListener('click', loadJobsAdmin);
  });
  window.TRRB_loadJobsAdmin = loadJobsAdmin;
})();

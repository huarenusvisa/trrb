(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const client = globalThis.supabaseClient;
  const listingActions = [['open','招聘中/重新发布'],['filled','已招满'],['paused','暂停'],['unlisted','下架']];
  const seekerActions = [['seeking','求职中/重新发布'],['found','已找到'],['paused','暂停'],['unlisted','下架']];
  let user = null;
  let listings = [];

  function actionButtons(kind, id, actions) {
    return actions.map(([status,label]) => `<button data-kind="${kind}" data-id="${esc(id)}" data-status="${status}">${label}</button>`).join('');
  }

  async function login() {
    $('login').disabled = true;
    $('auth-status').textContent = '正在登录；新账号会自动创建…';
    try {
      const result = await globalThis.TRUnifiedAccount.loginOrRegister(client, $('identifier').value, $('password').value);
      await signedIn(result.user);
      $('auth-status').textContent = result.created ? '账号已自动创建并登录。' : '登录成功。';
    } catch (error) { $('auth-status').textContent = error.message; }
    finally { $('login').disabled = false; }
  }

  async function signedIn(nextUser) {
    user = nextUser || null;
    $('auth-card').classList.toggle('hidden', Boolean(user));
    $('manage').classList.toggle('hidden', !user);
    if (user) await load();
  }

  async function load() {
    const [listingResult, seekerResult, conversationResult] = await Promise.all([
      client.from('job_listings').select('id,title,description,company_name,status,state_code,city,expires_at,contact_method,contact_value,contact_public,application_url,updated_at').eq('employer_user_id', user.id).order('updated_at',{ascending:false}),
      client.from('job_seeker_posts').select('id,headline,status,state_code,city,updated_at').eq('seeker_user_id', user.id).order('updated_at',{ascending:false}),
      client.from('job_conversations').select('id').eq('employer_user_id', user.id)
    ]);
    if (listingResult.error || seekerResult.error) { $('jobs-manage-message').textContent = `读取失败：${(listingResult.error || seekerResult.error).message}`; return; }
    listings = listingResult.data || [];
    const conversationIds = (conversationResult.data || []).map((item) => item.id);
    let unread = 0;
    if (conversationIds.length) {
      const unreadResult = await client.from('job_messages').select('id', {count:'exact', head:true}).in('conversation_id', conversationIds).neq('sender_user_id', user.id).is('read_at', null);
      unread = unreadResult.count || 0;
    }
    $('unread-count').textContent = unread;
    $('unread-count').classList.toggle('hidden', unread === 0);
    $('jobs-manage-message').textContent = '可以修改招聘、下架、标记已招满或重新发布。重新发布时，过期岗位会自动延长30天。';
    $('jobs-manage-listings').innerHTML = listings.map((item) => `<article class="listing"><h3>${esc(item.title)}</h3><span class="badge">${esc(item.status)}</span> ${esc(item.state_code)} ${esc(item.city)}<p class="muted">${esc((item.description || '').slice(0,150))}</p><div class="actions"><button data-edit="${esc(item.id)}">修改</button>${actionButtons('listing', item.id, listingActions)}<a href="/jobs/listing.html?id=${encodeURIComponent(item.id)}">查看页面</a></div></article>`).join('') || '<p>暂无招聘记录。</p>';
    $('jobs-manage-seekers').innerHTML = (seekerResult.data || []).map((item) => `<article class="listing"><h3>${esc(item.headline)}</h3><span class="badge">${esc(item.status)}</span> ${esc(item.state_code)} ${esc(item.city)}<div class="actions">${actionButtons('seeker', item.id, seekerActions)}</div></article>`).join('') || '<p>暂无求职记录。</p>';
  }

  function openEdit(id) {
    const item = listings.find((row) => row.id === id);
    if (!item) return;
    $('edit-id').value = item.id;
    $('edit-title').value = item.title || '';
    $('edit-company').value = item.company_name || '';
    $('edit-description').value = item.description || '';
    $('edit-state').value = item.state_code || '';
    $('edit-city').value = item.city || '';
    $('edit-expires').value = item.expires_at ? new Date(item.expires_at).toISOString().slice(0,16) : '';
    $('edit-contact-method').value = item.contact_method || 'platform';
    $('edit-contact-value').value = item.contact_value || '';
    $('edit-contact-public').checked = Boolean(item.contact_public);
    $('edit-application-url').value = item.application_url || '';
    $('edit-status').textContent = '';
    $('edit-dialog').showModal();
  }

  async function saveEdit(event) {
    event.preventDefault();
    $('edit-status').textContent = '正在保存…';
    const patch = {
      title:$('edit-title').value.trim(), company_name:$('edit-company').value.trim() || null,
      description:$('edit-description').value.trim(), state_code:$('edit-state').value.trim().toUpperCase(), city:$('edit-city').value.trim(),
      expires_at:$('edit-expires').value ? new Date($('edit-expires').value).toISOString() : null,
      contact_method:$('edit-contact-method').value, contact_value:$('edit-contact-value').value.trim() || null,
      contact_public:$('edit-contact-public').checked, application_url:$('edit-application-url').value.trim() || null,
      updated_at:new Date().toISOString()
    };
    const result = await client.from('job_listings').update(patch).eq('id', $('edit-id').value);
    if (result.error) { $('edit-status').textContent = `保存失败：${result.error.message}`; return; }
    $('edit-dialog').close();
    await load();
  }

  async function changeStatus(button) {
    const table = button.dataset.kind === 'listing' ? 'job_listings' : 'job_seeker_posts';
    const status = button.dataset.status;
    const patch = {status, status_reason:'owner_action', updated_at:new Date().toISOString()};
    if ((status === 'open' || status === 'seeking')) patch.expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
    button.disabled = true;
    const result = await client.from(table).update(patch).eq('id', button.dataset.id);
    button.disabled = false;
    if (result.error) { alert(`更新失败：${result.error.message}`); return; }
    await load();
  }

  $('login').addEventListener('click', login);
  $('edit-close').addEventListener('click', () => $('edit-dialog').close());
  $('edit-form').addEventListener('submit', saveEdit);
  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]'); if (edit) { openEdit(edit.dataset.edit); return; }
    const action = event.target.closest('[data-kind][data-id][data-status]'); if (action) changeStatus(action);
  });
  document.addEventListener('DOMContentLoaded', async () => {
    if (!client) { $('auth-status').textContent = '账号服务未初始化。'; return; }
    const {data} = await client.auth.getSession();
    await signedIn(data.session?.user || null);
  });
})();

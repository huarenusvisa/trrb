(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const client = globalThis.supabaseClient;
  const listingId = new URLSearchParams(location.search).get('id');
  let user = null;
  let listing = null;
  let conversation = null;

  async function loadListing() {
    if (!listingId || !client) { $('contact-state').textContent = '岗位参数无效。'; return; }
    const result = await client.from('job_listings').select('id,employer_user_id,title,state_code,city,contact_method,contact_value,contact_public,status,moderation_hold').eq('id', listingId).maybeSingle();
    if (result.error || !result.data) { $('contact-state').textContent = '岗位不存在或不可访问。'; return; }
    listing = result.data;
    $('contact-title').textContent = listing.title;
    $('contact-location').textContent = `${listing.state_code} ${listing.city}`;
    $('contact-card').classList.remove('hidden');
    await renderActions();
  }

  async function renderActions() {
    if (!listing) return;
    const actions = [];
    const ownsListing = user && listing.employer_user_id === user.id;
    if (listing.employer_user_id && !ownsListing) actions.push('<button type="button" data-method="platform">发送站内信</button>');
    if (listing.contact_public && listing.contact_value && listing.contact_method === 'phone') {
      actions.push(`<a data-method="phone" href="tel:${encodeURIComponent(listing.contact_value)}">拨打电话</a>`, `<a data-method="sms" href="sms:${encodeURIComponent(listing.contact_value)}">发送短信</a>`);
    }
    if (listing.contact_public && listing.contact_value && listing.contact_method === 'email') actions.push(`<a data-method="email" href="mailto:${encodeURIComponent(listing.contact_value)}">发送Email</a>`);
    if (ownsListing) actions.push('<a href="/jobs/messages.html">查看收到的站内信</a>');
    $('contact-actions').innerHTML = actions.join(' ') || '<span class="muted">该招聘暂未提供公开联系方式。</span>';
    $('auth-card').classList.toggle('hidden', Boolean(user) || !listing.employer_user_id || ownsListing);
    $('contact-state').textContent = ownsListing ? '这是你发布的招聘，可进入站内信回复求职者。' : (user ? '可以发送站内信或使用招聘方公开的联系方式。' : '登录后可向招聘方发送站内信。');
  }

  async function login() {
    $('login').disabled = true;
    $('auth-status').textContent = '正在登录；新账号会自动创建…';
    try {
      const result = await globalThis.TRUnifiedAccount.loginOrRegister(client, $('identifier').value, $('password').value);
      user = result.user;
      $('auth-status').textContent = result.created ? '账号已自动创建并登录。' : '登录成功。';
      await renderActions();
    } catch (error) { $('auth-status').textContent = error.message; }
    finally { $('login').disabled = false; }
  }

  async function ensureConversation() {
    if (!user) throw new Error('请先登录');
    if (!listing?.employer_user_id) throw new Error('该招聘没有可接收站内信的用户账号');
    if (listing.employer_user_id === user.id) throw new Error('不能给自己发送站内信');
    const found = await client.from('job_conversations').select('id,status').eq('listing_id', listing.id).eq('employer_user_id', listing.employer_user_id).eq('seeker_user_id', user.id).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) { conversation = found.data; return conversation; }
    const created = await client.from('job_conversations').insert({listing_id:listing.id, employer_user_id:listing.employer_user_id, seeker_user_id:user.id}).select('id,status').single();
    if (created.error) throw created.error;
    conversation = created.data;
    await client.from('job_contact_events').insert({listing_id:listing.id, actor_user_id:user.id, employer_user_id:listing.employer_user_id, method:'platform', conversation_id:conversation.id});
    return conversation;
  }

  async function loadMessages() {
    await ensureConversation();
    $('message-section').classList.remove('hidden');
    const result = await client.from('job_messages').select('id,sender_user_id,body,created_at,read_at').eq('conversation_id', conversation.id).order('created_at');
    if (result.error) throw result.error;
    $('messages').innerHTML = (result.data || []).map((message) => `<div class="bubble ${message.sender_user_id === user.id ? 'mine' : ''}">${esc(message.body)}<small>${new Date(message.created_at).toLocaleString()}</small></div>`).join('') || '<p class="muted">还没有消息，请输入第一条站内信。</p>';
    await client.from('job_messages').update({read_at:new Date().toISOString()}).eq('conversation_id', conversation.id).neq('sender_user_id', user.id).is('read_at', null);
  }

  async function openPlatform() {
    if (!user) { $('auth-card').classList.remove('hidden'); $('identifier').focus(); return; }
    try { await loadMessages(); $('message-body').focus(); } catch (error) { alert(error.message); }
  }

  async function send(event) {
    event.preventDefault();
    try {
      await ensureConversation();
      const body = $('message-body').value.trim();
      if (!body) return;
      const result = await client.from('job_messages').insert({conversation_id:conversation.id, sender_user_id:user.id, body});
      if (result.error) throw result.error;
      $('message-body').value = '';
      await loadMessages();
    } catch (error) { alert(error.message || '发送失败'); }
  }

  $('login').addEventListener('click', login);
  $('contact-actions').addEventListener('click', async (event) => {
    const target = event.target.closest('[data-method]');
    if (!target) return;
    if (target.dataset.method === 'platform') { event.preventDefault(); await openPlatform(); return; }
    if (user && listing?.employer_user_id) await client.from('job_contact_events').insert({listing_id:listing.id, actor_user_id:user.id, employer_user_id:listing.employer_user_id, method:target.dataset.method});
  });
  $('message-form').addEventListener('submit', send);
  document.addEventListener('DOMContentLoaded', async () => {
    const session = await client?.auth.getSession();
    user = session?.data?.session?.user || null;
    await loadListing();
  });
})();

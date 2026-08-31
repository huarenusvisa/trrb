(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const client = globalThis.supabaseClient;
  let user = null;
  let conversations = [];
  let listingById = new Map();
  let profileById = new Map();
  let selected = null;
  let channel = null;

  function otherUserId(conversation) {
    return conversation.employer_user_id === user.id ? conversation.seeker_user_id : conversation.employer_user_id;
  }

  async function login() {
    $('login').disabled = true;
    $('auth-status').textContent = '正在登录；新账号会自动创建…';
    try {
      const result = await globalThis.TRUnifiedAccount.loginOrRegister(client, $('identifier').value, $('password').value);
      await signedIn(result.user);
      $('auth-status').textContent = result.created ? '账号已自动创建并登录。' : '登录成功。';
    } catch (error) {
      $('auth-status').textContent = error.message;
    } finally {
      $('login').disabled = false;
    }
  }

  async function signedIn(nextUser) {
    user = nextUser || null;
    $('auth-card').classList.toggle('hidden', Boolean(user));
    $('inbox').classList.toggle('hidden', !user);
    $('logout').classList.toggle('hidden', !user);
    if (user) await loadConversations();
  }

  async function loadConversations() {
    $('inbox-status').textContent = '正在读取站内信…';
    const result = await client.from('job_conversations')
      .select('id,listing_id,employer_user_id,seeker_user_id,status,updated_at,last_message_at')
      .order('updated_at', { ascending: false });
    if (result.error) {
      $('inbox-status').textContent = `读取失败：${result.error.message}`;
      return;
    }
    conversations = result.data || [];
    const listingIds = [...new Set(conversations.map((item) => item.listing_id))];
    const profileIds = [...new Set(conversations.flatMap((item) => [item.employer_user_id, item.seeker_user_id]))];
    const [listingResult, profileResult, messageResult] = await Promise.all([
      listingIds.length ? client.from('job_listings').select('id,title,status').in('id', listingIds) : Promise.resolve({data:[]}),
      profileIds.length ? client.from('profiles').select('id,display_name,avatar_key').in('id', profileIds) : Promise.resolve({data:[]}),
      conversations.length ? client.from('job_messages').select('conversation_id,sender_user_id,body,created_at,read_at').in('conversation_id', conversations.map((item) => item.id)).order('created_at', {ascending:false}).limit(1000) : Promise.resolve({data:[]})
    ]);
    listingById = new Map((listingResult.data || []).map((item) => [item.id, item]));
    profileById = new Map((profileResult.data || []).map((item) => [item.id, item]));
    const latest = new Map();
    const unread = new Map();
    for (const message of messageResult.data || []) {
      if (!latest.has(message.conversation_id)) latest.set(message.conversation_id, message);
      if (message.sender_user_id !== user.id && !message.read_at) unread.set(message.conversation_id, (unread.get(message.conversation_id) || 0) + 1);
    }
    $('inbox-status').textContent = conversations.length ? `${conversations.length} 个对话` : '目前没有站内信。可从招聘详情的“联系招聘方”发起对话。';
    $('conversation-list').innerHTML = conversations.map((conversation) => {
      const other = profileById.get(otherUserId(conversation));
      const listing = listingById.get(conversation.listing_id);
      const preview = latest.get(conversation.id)?.body || '尚未发送消息';
      return `<button class="conversation ${selected?.id === conversation.id ? 'active' : ''}" data-conversation="${esc(conversation.id)}">${unread.get(conversation.id) ? `<span class="unread">${unread.get(conversation.id)}</span>` : ''}<b>${esc(other?.display_name || '对方用户')}</b><small>${esc(listing?.title || '招聘对话')} · ${esc(conversation.status)}</small><small>${esc(preview.slice(0,60))}</small></button>`;
    }).join('');
    const requested = new URLSearchParams(location.search).get('conversation');
    const next = conversations.find((item) => item.id === (requested || selected?.id));
    if (next) await openConversation(next.id);
  }

  async function openConversation(id) {
    selected = conversations.find((item) => item.id === id);
    if (!selected) return;
    const other = profileById.get(otherUserId(selected));
    const listing = listingById.get(selected.listing_id);
    $('thread-title').textContent = listing?.title || '招聘对话';
    $('thread-party').textContent = `与 ${other?.display_name || '对方用户'} 的站内信`;
    $('close-conversation').classList.toggle('hidden', selected.status !== 'open');
    $('send-form').classList.toggle('hidden', selected.status !== 'open');
    const result = await client.from('job_messages').select('id,sender_user_id,body,created_at,read_at').eq('conversation_id', id).order('created_at');
    if (result.error) {
      $('message-list').textContent = `消息读取失败：${result.error.message}`;
      return;
    }
    $('message-list').innerHTML = (result.data || []).map((message) => `<div class="bubble ${message.sender_user_id === user.id ? 'mine' : ''}">${esc(message.body)}<small>${new Date(message.created_at).toLocaleString()}${message.sender_user_id === user.id && message.read_at ? ' · 已读' : ''}</small></div>`).join('') || '<p class="muted">还没有消息。</p>';
    $('message-list').scrollTop = $('message-list').scrollHeight;
    await client.from('job_messages').update({read_at:new Date().toISOString()}).eq('conversation_id', id).neq('sender_user_id', user.id).is('read_at', null);
    $('conversation-list').querySelectorAll('[data-conversation]').forEach((button) => button.classList.toggle('active', button.dataset.conversation === id));
    if (channel) await client.removeChannel(channel);
    channel = client.channel(`job-messages-${id}`).on('postgres_changes', {event:'INSERT', schema:'public', table:'job_messages', filter:`conversation_id=eq.${id}`}, async () => {
      await openConversation(id);
    }).subscribe();
  }

  async function send(event) {
    event.preventDefault();
    if (!selected || selected.status !== 'open') return;
    const body = $('message-body').value.trim();
    if (!body) return;
    $('send-status').textContent = '正在发送…';
    const result = await client.from('job_messages').insert({conversation_id:selected.id, sender_user_id:user.id, body});
    if (result.error) {
      $('send-status').textContent = `发送失败：${result.error.message}`;
      return;
    }
    $('message-body').value = '';
    $('send-status').textContent = '已发送。';
    await openConversation(selected.id);
    await loadConversations();
  }

  $('login').addEventListener('click', login);
  $('logout').addEventListener('click', async () => { await client.auth.signOut(); await signedIn(null); });
  $('conversation-list').addEventListener('click', (event) => { const button = event.target.closest('[data-conversation]'); if (button) openConversation(button.dataset.conversation); });
  $('send-form').addEventListener('submit', send);
  $('close-conversation').addEventListener('click', async () => { if (!selected) return; const result = await client.from('job_conversations').update({status:'closed'}).eq('id', selected.id); if (result.error) $('send-status').textContent = result.error.message; else await loadConversations(); });
  document.addEventListener('DOMContentLoaded', async () => {
    if (!client) { $('auth-status').textContent = '账号服务未初始化。'; return; }
    const {data} = await client.auth.getSession();
    await signedIn(data.session?.user || null);
  });
})();

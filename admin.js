const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let currentAdmin = null;
let cachedArticles = [];
let cachedCategories = [];

const $ = (selector) => document.querySelector(selector);

init();

async function init() {
  bindEvents();
  const { data } = await db.auth.getSession();
  if (data.session) await enterAdmin(data.session.user);
}

function bindEvents() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#logout-btn').addEventListener('click', handleLogout);
  $('#refresh-btn').addEventListener('click', loadDashboard);
  $('#article-form').addEventListener('submit', saveArticle);
  $('#article-title').addEventListener('input', () => {
    if (!$('#article-slug').value.trim()) $('#article-slug').value = slugify($('#article-title').value);
  });
  $('#article-status-filter').addEventListener('change', renderArticlesTable);
  $('#save-rankings-btn').addEventListener('click', saveRankings);
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}

async function handleLogin(event) {
  event.preventDefault();
  setMessage('#login-message', '正在登录...');
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) return setMessage('#login-message', '登录失败：' + error.message);
  await enterAdmin(data.user);
}

async function enterAdmin(user) {
  currentUser = user;
  const { data: admin, error } = await db
    .from('admin_users')
    .select('email, role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !admin || !admin.is_active) {
    await db.auth.signOut();
    return setMessage('#login-message', '这个账号没有后台权限。');
  }

  currentAdmin = admin;
  $('#login-view').classList.add('is-hidden');
  $('#admin-view').classList.remove('is-hidden');
  $('#admin-info').textContent = `${admin.email} · ${admin.role}`;
  await loadAll();
}

async function handleLogout() {
  await db.auth.signOut();
  location.reload();
}

function switchTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('is-hidden'));
  $(`#tab-${tab}`).classList.remove('is-hidden');
  const titles = { dashboard: '控制台', articles: '文章管理', 'new-article': '发布文章', rankings: '24小时热榜' };
  $('#page-title').textContent = titles[tab] || '后台';
  if (tab === 'rankings') renderRankingsEditor();
}

async function loadAll() {
  await Promise.all([loadCategories(), loadArticles(), loadRankingsCount()]);
  loadDashboard();
  renderArticlesTable();
  renderRankingsEditor();
}

async function loadCategories() {
  const { data, error } = await db.from('categories').select('*').order('sort_order');
  if (error) return alert('栏目读取失败：' + error.message);
  cachedCategories = data || [];
  $('#article-category').innerHTML = cachedCategories.map((cat) => `<option value="${escapeHtml(cat.id)}" data-name="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('');
}

async function loadArticles() {
  const { data, error } = await db
    .from('articles')
    .select('id,title,slug,summary,category_name,status,is_breaking,is_ranked,rank_score,cover_image,published_at,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return alert('文章读取失败：' + error.message);
  cachedArticles = data || [];
}

async function loadRankingsCount() {
  const { count } = await db.from('rankings').select('*', { count: 'exact', head: true }).eq('is_active', true);
  $('#stat-rankings').textContent = count || 0;
}

function loadDashboard() {
  $('#stat-articles').textContent = cachedArticles.length;
  $('#stat-published').textContent = cachedArticles.filter((a) => a.status === 'published').length;
  $('#stat-drafts').textContent = cachedArticles.filter((a) => a.status === 'draft').length;
  $('#recent-articles').innerHTML = cachedArticles.slice(0, 8).map((a) => `
    <div>
      <a href="../article.html?id=${encodeURIComponent(a.id)}" target="_blank">${escapeHtml(a.title)}</a>
      <span class="badge ${a.status}">${statusText(a.status)}</span>
    </div>
  `).join('') || '<p>暂无文章。</p>';
}

function renderArticlesTable() {
  const status = $('#article-status-filter').value;
  const list = cachedArticles.filter((a) => !status || a.status === status);
  $('#articles-table').innerHTML = `
    <table>
      <thead><tr><th>标题</th><th>栏目</th><th>状态</th><th>发布时间</th><th>操作</th></tr></thead>
      <tbody>
        ${list.map((a) => `
          <tr>
            <td><strong>${escapeHtml(a.title)}</strong><br><small>${escapeHtml(a.slug || '')}</small></td>
            <td>${escapeHtml(a.category_name || '')}</td>
            <td><span class="badge ${a.status}">${statusText(a.status)}</span></td>
            <td>${escapeHtml(formatTime(a.published_at || a.created_at))}</td>
            <td class="actions">
              <button data-id="${a.id}" data-status="published">发布</button>
              <button data-id="${a.id}" data-status="draft">草稿</button>
              <button data-id="${a.id}" data-status="hidden">隐藏</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  $('#articles-table').querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', async () => updateArticleStatus(button.dataset.id, button.dataset.status));
  });
}

async function saveArticle(event) {
  event.preventDefault();
  setMessage('#article-message', '正在保存...');
  const selected = $('#article-category').selectedOptions[0];
  const status = $('#article-status').value;
  const payload = {
    title: $('#article-title').value.trim(),
    slug: $('#article-slug').value.trim() || slugify($('#article-title').value),
    summary: $('#article-summary').value.trim(),
    content: $('#article-content').value.trim(),
    category_id: $('#article-category').value,
    category_name: selected ? selected.dataset.name : '',
    cover_image: $('#article-cover').value.trim(),
    source_url: $('#article-source').value.trim(),
    status,
    published_at: status === 'published' ? new Date().toISOString() : null
  };
  const { error } = await db.from('articles').insert(payload);
  if (error) return setMessage('#article-message', '保存失败：' + error.message);
  $('#article-form').reset();
  setMessage('#article-message', '文章已保存。');
  await loadAll();
  switchTab('articles');
}

async function updateArticleStatus(id, status) {
  const payload = { status };
  if (status === 'published') payload.published_at = new Date().toISOString();
  const { error } = await db.from('articles').update(payload).eq('id', id);
  if (error) return alert('更新失败：' + error.message);
  await loadAll();
  renderArticlesTable();
}

async function renderRankingsEditor() {
  const published = cachedArticles.filter((a) => a.status === 'published');
  let { data: rows } = await db.from('rankings').select('*').eq('rank_type', '24h').order('rank_order');
  rows = rows || [];
  const html = Array.from({ length: 10 }, (_, i) => {
    const row = rows.find((r) => r.rank_order === i + 1) || {};
    return `
      <div class="rank-row">
        <b>${i + 1}</b>
        <select data-rank-article="${i + 1}">
          <option value="">选择文章</option>
          ${published.map((a) => `<option value="${a.id}" ${row.article_id === a.id ? 'selected' : ''}>${escapeHtml(a.title)}</option>`).join('')}
        </select>
        <input data-rank-heat="${i + 1}" value="${escapeAttribute(row.heat_text || '')}" placeholder="2.6万" />
      </div>`;
  }).join('');
  $('#rankings-editor').innerHTML = html || '<p>请先发布文章。</p>';
}

async function saveRankings() {
  setMessage('#rankings-message', '正在保存...');
  for (let i = 1; i <= 10; i += 1) {
    const articleId = document.querySelector(`[data-rank-article="${i}"]`)?.value || null;
    const heatText = document.querySelector(`[data-rank-heat="${i}"]`)?.value || '';
    if (!articleId) continue;
    const { error } = await db.from('rankings').upsert({
      rank_type: '24h', rank_order: i, article_id: articleId, heat_text: heatText, is_active: true
    }, { onConflict: 'rank_type,rank_order' });
    if (error) return setMessage('#rankings-message', '保存失败：' + error.message);
  }
  setMessage('#rankings-message', '热榜已保存。');
  await loadRankingsCount();
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '-')
    .replace(/[，。！？、：；“”‘’（）()\[\]{}<>]/g, '')
    .slice(0, 90) || `article-${Date.now()}`;
}

function statusText(status) {
  return { published: '已发布', draft: '草稿', hidden: '隐藏' }[status] || status;
}

function formatTime(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleString('zh-CN'); } catch { return value; }
}

function setMessage(selector, message) {
  $(selector).textContent = message || '';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function env(name) { return Netlify.env.get(name) || ''; }
function json(status, body) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || body?.message || `请求失败（${response.status}）`), { statusCode: response.status });
  return body;
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const authApiKey = env('SUPABASE_ANON_KEY') || serviceKey;
    if (!supabaseUrl || !serviceKey || !authApiKey) return json(503, { error: '账号服务暂不可用' });
    const token = String(request.headers.get('authorization') || '').trim().slice(0, 4000).replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: '请先登录唐人日报账号' });
    const user = await requestJson(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: authApiKey, Authorization: `Bearer ${token}` } });
    if (!user?.id) return json(401, { error: '登录状态已失效，请重新登录' });
    const body = await request.json();
    const currentPassword = String(body.current_password || '');
    const newPassword = String(body.new_password || '');
    if (currentPassword.length < 8 || currentPassword.length > 128) return json(400, { error: '当前密码不正确' });
    if (newPassword.length < 8 || newPassword.length > 128) return json(400, { error: '新密码需要 8–128 位' });
    if (currentPassword === newPassword) return json(400, { error: '新密码不能与当前密码相同' });
    if (!user.email) return json(400, { error: '这个账号暂时无法验证密码，请联系客服' });

    const signIn = (password) => requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: authApiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    try { await signIn(currentPassword); } catch { return json(401, { error: '当前密码不正确' }); }
    await requestJson(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'PUT', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }) });
    return json(200, { session: await signIn(newPassword) });
  } catch (error) {
    console.error('Unified account password change error:', error);
    return json(error?.statusCode || 500, { error: error?.message || '修改密码失败' });
  }
};

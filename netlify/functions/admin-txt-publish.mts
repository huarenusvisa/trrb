import admin from './_shared/supabase-admin.js';
import login from './unified-account-login.js';
import community from './community-api.js';
import { parseTxtPost } from '../../apps/mobile/src/social/txt-publish-core.ts';
import { normalizeProfilePostTags } from '../../apps/mobile/src/social/profile-tags-core.ts';
import { createHash } from 'node:crypto';
import { txtReceiptInput } from '../../apps/mobile/src/social/txt-publish-core.ts';

export default async (request: Request) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
  if (request.method !== 'POST') return reply(405, { error: '仅支持 POST' });
  const event = { httpMethod: 'POST', headers: { authorization: request.headers.get('authorization') || '' } };
  let submitted = false;
  try {
    await admin.authenticateAdmin(event);
    const body = await request.json();
    if (typeof body.txt !== 'string') return reply(400, { error: '请选择 TXT 文件' });
    const post = parseTxtPost(body.txt);
    const tags = normalizeProfilePostTags(post.content);
    const receipt = createHash('sha256').update(txtReceiptInput(post)).digest('hex');
    if (body.action === 'preview') return reply(200, { target: post.target, category: post.category, title: post.title, content: post.content, tags, receipt });
    if (body.action !== 'publish') return reply(400, { error: '操作无效' });
    const authResult = await login.handler({ ...event, body: JSON.stringify({ identifier: post.identifier, password: post.password, login_only: true }) });
    post.password = '';
    if (authResult.statusCode !== 200) return reply(401, { error: '目标账号验证失败，内容未提交' });
    const session = JSON.parse(authResult.body).session;
    const token = session.access_token;
    const publicKey = Netlify.env.get('SUPABASE_ANON_KEY');
    const identity = await admin.requestJson(`${admin.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: `Bearer ${token}` } });
    submitted = true;
    if (post.target === 'community') {
      const result = await community.handler({ httpMethod: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'create_post', category: post.category, title: post.title, content: post.content, content_label: 'personal_experience' }) });
      const data = JSON.parse(result.body);
      if (result.statusCode >= 400) return reply(result.statusCode, { error: '提交未成功，请检查对应账号内容后再重试' });
      return reply(200, { id: data.post.id, target: post.target, pending: data.post.status === 'pending' });
    }
    // Owner-scoped target token, never service-role insertion into user content.
    const rows = await admin.requestJson(`${admin.SUPABASE_URL}/rest/v1/profile_posts?select=id,status`, {
      method: 'POST', headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: identity.id, caption: post.content, tags, status: 'published' }),
    });
    return reply(200, { id: rows[0].id, target: post.target, pending: false });
  } catch (error: any) {
    return reply(submitted ? 502 : Number(error.statusCode) || 400, { error: submitted ? '提交结果尚未确认，请先检查目标账号内容，不要重复提交。' : '无法提交，请检查管理员权限及 TXT 格式。' });
  }
};

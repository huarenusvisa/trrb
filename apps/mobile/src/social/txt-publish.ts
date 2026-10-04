import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import { isAuthConfigured, publicConfig } from '../auth/supabase';
import { loginOrRegister } from '../auth/unified-account';
import { createCommunityApi } from '../api/community-core';
import { txtReceiptInput, type TxtPost } from './txt-publish-core';

export async function publishTxtPost(post: TxtPost, progress: (text: string) => void) {
  if (!isAuthConfigured) throw new Error('账号服务尚未配置。');
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, txtReceiptInput(post));
  const key = `trrb:txt-publish:${digest}`;
  const previous = await AsyncStorage.getItem(key);
  if (previous) throw new Error('这篇内容已有发送记录。请先在对应账号检查结果，避免重复发布。');
  const client = createClient(publicConfig.url, publicConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let dispatched = false;
  try {
    progress('正在验证 TXT 中的账号…');
    const login = await loginOrRegister(post.identifier, post.password, { loginOnly: true });
    const { error: sessionError } = await client.auth.setSession(login.session);
    if (sessionError) throw new Error('登录状态无效，请重新导入。');
    const { data: identity, error: identityError } = await client.auth.getUser();
    if (identityError || !identity.user) throw new Error('无法验证发布账号。');
    // Save the dispatch marker before sending; never automatically retry an uncertain write.
    await AsyncStorage.setItem(key, JSON.stringify({ state: 'sending', at: Date.now() }));
    dispatched = true;
    progress('账号已验证，正在提交内容…');
    let id: string;
    let status: string;
    if (post.target === 'community') {
      const api = createCommunityApi({ getAccessToken: async () => login.session.access_token });
      const result = await api.createPost({ category: post.category, content_label: 'personal_experience', title: post.title, content: post.content });
      if (!result.post?.id || result.post.user_id !== identity.user.id) throw new Error('发布结果尚未确认。');
      id = result.post.id;
      status = result.post.status;
    } else {
      const { data, error } = await client.from('profile_posts').insert({ user_id: identity.user.id, caption: post.content, tags: [], status: 'published' }).select('id,user_id,status,caption').single();
      if (error || !data?.id || data.user_id !== identity.user.id || data.caption !== post.content) throw new Error('动态发布结果尚未确认。');
      id = data.id;
      status = data.status;
    }
    await AsyncStorage.setItem(key, JSON.stringify({ state: status, id, at: Date.now() }));
    return { id, target: post.target, pending: status === 'pending' };
  } catch (error) {
    if (dispatched) throw new Error('提交结果尚未确认，请先查看对应账号的内容。系统不会自动重复发送。');
    // Auth errors can include server details; never show credential-bearing payloads.
    throw new Error('未提交内容：请检查账号、密码及网络后重新导入。');
  } finally {
    // Local-only sign-out must not invalidate this user's other devices.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    client.auth.stopAutoRefresh();
  }
}

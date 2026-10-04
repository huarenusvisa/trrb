import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { parseTxtPost, TXT_TEMPLATE, type TxtPost } from '../src/social/txt-publish-core';
import { publishTxtPost } from '../src/social/txt-publish';

export default function TxtPublishScreen() {
  const draft = useRef<TxtPost | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const [preview, setPreview] = useState<{ target: string; title: string; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => () => { mounted.current = false; if (draft.current) draft.current.password = ''; draft.current = null; }, []);

  async function pick() {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage(''); setPreview(null);
    if (draft.current) draft.current.password = '';
    draft.current = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/plain', 'public.plain-text'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      let raw = '';
      try {
        if (!asset.name.toLowerCase().endsWith('.txt') || (asset.size || file.size || 0) > 200000) throw new Error('请选择小于 200KB 的 TXT 文件。');
        raw = await file.text();
      } finally { try { file.delete(); } catch { /* The OS may already have removed the temporary copy. */ } }
      const post = parseTxtPost(raw); raw = '';
      if (!mounted.current) { post.password = ''; return; }
      draft.current = post;
      setPreview({ target: post.target === 'community' ? `社区 · ${post.category}` : '个人主页动态', title: post.title, content: post.content });
      setMessage('已读取。点击发布后，系统会自动登录 TXT 中的账号并提交内容。');
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '无法读取 TXT，请重试。');
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  async function publish() {
    if (running.current || !draft.current) return;
    running.current = true; setBusy(true);
    const post = draft.current;
    try {
      const result = await publishTxtPost(post, text => { if (mounted.current) setMessage(text); });
      if (mounted.current) setMessage(`${result.pending ? '已提交，等待社区审核' : '已发布'}。内容编号：${result.id}`);
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '提交结果尚未确认。');
    } finally {
      post.password = ''; draft.current = null; running.current = false;
      if (mounted.current) { setBusy(false); setPreview(null); }
    }
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Stack.Screen options={{ title: 'TXT 导入发布', headerShown: true }} />
    <Text style={styles.heading}>TXT 导入发布</Text>
    <Text style={styles.text}>每个 TXT 文件放一篇内容。填写唐人日报登录邮箱或手机号、密码和目标界面。导入后可预览正文，再点击发布。</Text>
    <Text style={styles.text}>密码不会显示或保存。发布不会切换 App 当前账号。社区内容仍按现有规则审核。</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pick()} style={styles.button}><Text style={styles.buttonText}>选择 TXT 文件</Text></Pressable>
    {busy ? <ActivityIndicator /> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {preview ? <><Text style={styles.heading}>{preview.target}</Text><Text style={styles.text}>{preview.title}</Text><Text style={styles.text}>{preview.content}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void publish()} style={styles.button}><Text style={styles.buttonText}>使用 TXT 账号发布</Text></Pressable></> : null}
    <Text style={styles.heading}>填写模板</Text><Text selectable style={styles.template}>{TXT_TEMPLATE}</Text>
    <Text style={styles.text}>社区栏目：热门讨论、移民互助、法庭经历、庇护面谈、ICE经历、律师评价、爆料。发布到个人主页时，把目标改为“个人主页动态”，正文最多 2000 字。</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#fff' }, content: { padding: 20, gap: 16, paddingBottom: 50 }, heading: { fontSize: 22, fontWeight: '800', color: '#101828' }, text: { fontSize: 16, lineHeight: 25, color: '#344054' }, button: { backgroundColor: '#c8211e', padding: 16, borderRadius: 12, alignItems: 'center' }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' }, message: { fontSize: 16, lineHeight: 24, color: '#344054', backgroundColor: '#f2f4f7', padding: 14, borderRadius: 10 }, template: { fontSize: 15, lineHeight: 26, backgroundColor: '#f8fafc', padding: 14, color: '#344054' } });

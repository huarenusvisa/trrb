import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { listProfilePostsByTag } from '../../src/social/posts';
import type { ProfilePost } from '../../src/social/types';
import { ProfilePostList } from '../../src/components/ProfilePostList';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { withUiTimeout } from '../../src/utils/async-state-core';

export default function ProfileTopicScreen() {
  const { tag: param } = useLocalSearchParams<{ tag: string }>();
  const tag = String(param || '');
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPosts(await withUiTimeout(listProfilePostsByTag(tag), '话题加载超时，请重试。', 16000)); }
    catch (error) { setError(error instanceof Error ? error.message : '加载失败'); }
    finally { setLoading(false); }
  }, [tag]);
  useEffect(() => { void load(); }, [load]);
  return <ScrollView style={{ flex: 1, backgroundColor: '#f5f6f8' }} contentContainerStyle={{ padding: 14, gap: 14 }}>
    <Stack.Screen options={{ headerShown: true, title: `#${tag}`, headerBackTitle: '返回' }} />
    <Text style={{ fontSize: 22, fontWeight: '800', color: '#175cd3' }}>#{tag}</Text>
    <Text style={{ color: '#667085' }}>关联动态</Text>
    {loading || error ? <AsyncStatePanel title={loading ? '正在加载…' : '加载失败'} message={error || '正在查找关联动态'} busy={loading} tone={error ? 'error' : 'neutral'} actionLabel={error ? '重试' : undefined} onAction={() => void load()} /> : <ProfilePostList posts={posts} columns={2} />}
  </ScrollView>;
}

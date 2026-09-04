import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { CommentRow, listOwnComments } from '../src/api/comments';
import { AsyncStatePanel } from '../src/components/AsyncStatePanel';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../src/utils/async-state-core';

const statusLabel: Record<CommentRow['status'], string> = { published: '已发布', pending: '审核中', hidden: '已隐藏', deleted: '已删除' };

export default function MyCommentsScreen() {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setItems(await withUiTimeout(listOwnComments(), '评论读取超时，请检查网络后重试。'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '评论加载失败');
    } finally {
      refresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useForegroundRetry(Boolean(error), () => void load(true));

  return <><Stack.Screen options={{ title: '我的评论', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
    {loading ? <AsyncStatePanel testID="my-comments-loading" title="正在读取评论" message="正在同步评论内容和审核状态。" busy /> : error ? <AsyncStatePanel testID="my-comments-error" tone="error" title="评论暂时无法读取" message={error} actionLabel="重新读取" onAction={() => void load(true)} busy={refreshing} /> : items.length === 0 ? <AsyncStatePanel testID="my-comments-empty" title="还没有评论" message="阅读新闻后可以在文章底部参与讨论，评论状态会显示在这里。" /> : items.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`打开评论对应新闻，状态：${statusLabel[item.status]}`} key={item.id} style={styles.card} onPress={() => router.push(`/article/${item.article_id}`)}>
      <View style={styles.row}><Text style={styles.status}>{statusLabel[item.status]}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
      <Text style={[styles.body, item.status !== 'published' && styles.mutedBody]}>{item.status === 'deleted' ? '[已删除]' : item.content}</Text>
      <Text style={styles.open}>打开对应新闻 ›</Text>
    </Pressable>)}
  </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:40},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:12},row:{flexDirection:'row',justifyContent:'space-between',gap:10},status:{fontWeight:'800',color:'#c8211e'},time:{fontSize:12,color:'#98a2b3'},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:10},mutedBody:{color:'#98a2b3'},open:{marginTop:12,color:'#c8211e',fontWeight:'800'}});

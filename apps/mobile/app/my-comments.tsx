import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { CommentRow, listOwnComments } from '../src/api/comments';

const statusLabel: Record<CommentRow['status'], string> = { published: '已发布', pending: '审核中', hidden: '已隐藏', deleted: '已删除' };

export default function MyCommentsScreen() {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listOwnComments().then(setItems).catch((e) => setError(e instanceof Error ? e.message : '加载失败')).finally(() => setLoading(false));
  }, []);

  return <><Stack.Screen options={{ title: '我的评论', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    {loading ? <ActivityIndicator /> : error ? <Text style={styles.muted}>{error}</Text> : items.length === 0 ? <Text style={styles.muted}>还没有评论。</Text> : items.map((item) => <Pressable key={item.id} style={styles.card} onPress={() => router.push(`/article/${item.article_id}`)}>
      <View style={styles.row}><Text style={styles.status}>{statusLabel[item.status]}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
      <Text style={[styles.body, item.status !== 'published' && styles.mutedBody]}>{item.status === 'deleted' ? '[已删除]' : item.content}</Text>
      <Text style={styles.open}>打开对应新闻 ›</Text>
    </Pressable>)}
  </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingBottom:40},card:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:12},row:{flexDirection:'row',justifyContent:'space-between',gap:10},status:{fontWeight:'800',color:'#c8211e'},time:{fontSize:12,color:'#98a2b3'},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:10},mutedBody:{color:'#98a2b3'},open:{marginTop:12,color:'#c8211e',fontWeight:'800'},muted:{color:'#667085',textAlign:'center',paddingVertical:28}});

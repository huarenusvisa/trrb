import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchArticles, NewsArticle, sortNewestFirst } from '../../src/api/trrb';

const feeds = ['美国时政', '美国警情'];

export default function AmericaScreen() {
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all(feeds.map((category) => fetchArticles({ category, limit: 60 }))).then((rows) => setItems(sortNewestFirst(rows.flat()))).finally(() => setLoading(false)); }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>美国</Text><Text style={styles.sub}>美国时政 · 美国警情</Text></>} data={items} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <Pressable style={styles.row} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}><Text style={styles.cat}>{item.category_name}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at ? new Date(item.published_at).toLocaleString('zh-CN') : ''}</Text></Pressable>} />;
}

const styles = StyleSheet.create({ page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8} });

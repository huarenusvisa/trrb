import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchArticles, NewsArticle, sortNewestFirst } from '../../src/api/trrb';

const feeds = ['移民美国', '庇护百科'];

export default function ImmigrationScreen() {
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const rows = await Promise.all(feeds.map((category) => fetchArticles({ category, limit: 80 }).catch(() => [])));
      const seen = new Set<string>();
      setItems(sortNewestFirst(rows.flat()).filter((item) => { const key=String(item.id); if(seen.has(key)) return false; seen.add(key); return true; }));
    } catch (e) { setError(e instanceof Error ? e.message : '移民频道加载失败'); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  return <FlatList
    style={styles.page}
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    ListHeaderComponent={<View><Text style={styles.h1}>移民</Text><Text style={styles.sub}>移民美国 · 庇护百科</Text><View style={styles.chips}>{feeds.map((name)=><Pressable key={name} style={styles.chip} onPress={()=>router.push({pathname:'/category/[name]',params:{name}})}><Text style={styles.chipText}>{name}</Text></Pressable>)}</View>{error?<Text style={styles.error}>{error}</Text>:null}</View>}
    data={items}
    keyExtractor={(item) => String(item.id)}
    ListEmptyComponent={<Text style={styles.empty}>暂无最新内容</Text>}
    renderItem={({ item }) => <Pressable style={styles.row} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}><Text style={styles.cat}>{item.category_name}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at ? new Date(item.published_at).toLocaleString('zh-CN') : ''}</Text></Pressable>}
  />;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:14},chips:{flexDirection:'row',gap:10,marginBottom:18},chip:{backgroundColor:'#fff',borderRadius:999,paddingHorizontal:15,paddingVertical:10},chipText:{color:'#c8211e',fontWeight:'900'},error:{color:'#b42318',marginBottom:12},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8},empty:{color:'#667085',textAlign:'center',marginTop:40}});

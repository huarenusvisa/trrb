import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { fetchArticles, NewsArticle } from '../../src/api/trrb';

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArticles({ limit: 200 })
      .then((rows) => setArticle(rows.find((item) => String(item.id) === String(id)) || null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  if (!article) return <View style={styles.center}><Text style={styles.muted}>这篇文章暂未进入移动端缓存。</Text><Text style={styles.link} onPress={() => Linking.openURL('https://trrb.net')}>打开唐人日报网站</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.category}>{article.category_name || '新闻'}</Text>
      <Text style={styles.title}>{article.title}</Text>
      <Text style={styles.meta}>{article.author || '唐人日报'} · {article.published_at ? new Date(article.published_at).toLocaleString('zh-CN') : ''}</Text>
      {article.cover_image ? <Image source={{ uri: article.cover_image }} style={styles.image} /> : null}
      {article.summary ? <Text style={styles.summary}>{article.summary}</Text> : null}
      <Text style={styles.body}>{article.content || '正文正在同步。'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingTop:58,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28},muted:{color:'#667085'},link:{color:'#c8211e',fontWeight:'800',marginTop:14},category:{color:'#c8211e',fontWeight:'800'},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},meta:{color:'#98a2b3',marginTop:12,marginBottom:20},image:{width:'100%',height:230,borderRadius:16,backgroundColor:'#eaecf0',marginBottom:22},summary:{fontSize:18,lineHeight:29,fontWeight:'700',color:'#344054',marginBottom:20},body:{fontSize:18,lineHeight:32,color:'#1d2939'}});

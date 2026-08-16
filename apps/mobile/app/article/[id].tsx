import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { fetchArticle, NewsArticle } from '../../src/api/trrb';
import { addHistory, isFavorite, toggleFavorite } from '../../src/storage/library';
import { CommentThread } from '../../src/components/CommentThread';

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorite,setFavorite]=useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true); setError('');
    fetchArticle(id).then(async (row)=>{
      if (!row) {
        setArticle(null);
        setError('文章可能尚未发布或已经下线。');
        return;
      }
      setArticle(row);
      await addHistory(row);
      setFavorite(await isFavorite(row.id));
    }).catch((e) => setError(e instanceof Error ? e.message : '文章加载失败')).finally(() => setLoading(false));
  }, [id]);

  const webUrl = useMemo(() => {
    if (!article) return 'https://trrb.net';
    if (article.slug && article.category_name) {
      const sections: Record<string, string> = {'重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime','中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport'};
      const section = article.topic_key === 'trump' ? 'trump' : article.topic_key === 'ice' ? 'ice' : sections[article.category_name] || 'news';
      return `https://trrb.net/${section}/${article.slug}`;
    }
    return `https://trrb.net/article.html?id=${encodeURIComponent(String(article.id))}`;
  }, [article]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>正在读取正文…</Text></View>;
  if (!article) return <View style={styles.center}><Text style={styles.errorTitle}>暂时无法读取这篇文章</Text><Text style={styles.muted}>{error || '文章可能尚未发布或已经下线。'}</Text><Pressable style={styles.outlineButton} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.outlineButtonText}>打开唐人日报网站</Text></Pressable></View>;

  return <><Stack.Screen options={{ title: '新闻详情', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.category}>{article.category_name || '新闻'}</Text><Text style={styles.title}>{article.title}</Text><Text style={styles.meta}>{article.author || '唐人日报'} · {article.published_at ? new Date(article.published_at).toLocaleString('zh-CN') : ''}</Text>
    {article.cover_image ? <Image source={{ uri: article.cover_image }} style={styles.image} resizeMode="cover" /> : null}{article.summary ? <Text style={styles.summary}>{article.summary}</Text> : null}<Text style={styles.body}>{article.content || '正文暂不可用。'}</Text>
    <View style={styles.actions}><Pressable style={favorite?styles.savedButton:styles.primaryButton} onPress={async()=>setFavorite(await toggleFavorite(article))}><Text style={styles.primaryButtonText}>{favorite?'已收藏':'收藏新闻'}</Text></Pressable><Pressable style={styles.primaryButton} onPress={() => Share.share({ title: article.title, message: `${article.title}\n${webUrl}`, url: webUrl })}><Text style={styles.primaryButtonText}>分享新闻</Text></Pressable><Pressable style={styles.outlineButton} onPress={() => Linking.openURL(webUrl)}><Text style={styles.outlineButtonText}>在网站打开</Text></Pressable></View>
    <CommentThread articleId={String(article.id)} />
  </ScrollView></>;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingTop:26,paddingBottom:60},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},muted:{color:'#667085',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#101828'},category:{color:'#c8211e',fontWeight:'800'},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},meta:{color:'#98a2b3',marginTop:12,marginBottom:20},image:{width:'100%',height:230,borderRadius:16,backgroundColor:'#eaecf0',marginBottom:22},summary:{fontSize:18,lineHeight:29,fontWeight:'700',color:'#344054',marginBottom:20},body:{fontSize:18,lineHeight:32,color:'#1d2939'},actions:{gap:12,marginTop:30},primaryButton:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,alignItems:'center'},savedButton:{backgroundColor:'#344054',borderRadius:12,paddingVertical:14,alignItems:'center'},primaryButtonText:{color:'#fff',fontWeight:'800',fontSize:16},outlineButton:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingVertical:13,paddingHorizontal:18,alignItems:'center'},outlineButtonText:{color:'#344054',fontWeight:'800',fontSize:16}});

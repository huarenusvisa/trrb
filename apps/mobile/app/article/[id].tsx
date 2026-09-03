import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { fetchArticle, fetchRelatedArticles, NewsArticle } from '../../src/api/trrb';
import { addHistory, isFavorite, toggleFavorite } from '../../src/storage/library';
import { getReadingPreferences, ReadingPreferences, subscribeReadingPreferences } from '../../src/storage/reading-preferences';
import { cacheArticle, readCachedArticle, removeCachedArticle } from '../../src/storage/articleCache';
import { CommentThread } from '../../src/components/CommentThread';

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [related, setRelated] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [fontScale, setFontScale] = useState<ReadingPreferences['fontScale']>(1);

  useEffect(() => {
    void getReadingPreferences().then((p) => setFontScale(p.fontScale));
    return subscribeReadingPreferences((p) => setFontScale(p.fontScale));
  }, []);

  async function load() {
    if (!id) return;
    setLoading(true); setError(''); setRelated([]); setOffline(false);
    try {
      const row = await fetchArticle(id);
      if (!row) {
        await removeCachedArticle(id);
        setArticle(null);
        setError('文章可能尚未发布或已经下线。');
        return;
      }
      setArticle(row);
      await cacheArticle(row);
      await addHistory(row);
      setFavorite(await isFavorite(row.id));
      setRelated(await fetchRelatedArticles(row, 4).catch(() => []));
    } catch (e) {
      const cached = await readCachedArticle(id, true);
      if (cached) {
        setArticle(cached);
        setOffline(true);
        setFavorite(await isFavorite(cached.id));
        setError('网络不可用，正在显示此前读取的离线副本。恢复网络后请重试。');
      } else {
        setArticle(null);
        setError(e instanceof Error ? e.message : '文章加载失败');
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  const webUrl = useMemo(() => {
    if (!article) return 'https://trrb.net';
    if (article.slug && article.category_name) {
      const sections: Record<string, string> = {'重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime','中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport'};
      const section = article.topic_key === 'trump' ? 'trump' : article.topic_key === 'ice' ? 'ice' : sections[article.category_name] || 'news';
      return `https://trrb.net/${section}/${article.slug}`;
    }
    return `https://trrb.net/article.html?id=${encodeURIComponent(String(article.id))}`;
  }, [article]);

  const copyLink = async () => { await Clipboard.setStringAsync(webUrl); Alert.alert('已复制', '文章链接已经复制到剪贴板。'); };

  const openArticleSection = () => {
    if (!article) return;
    const category = article.category_name || '新闻';
    if (category === '移民美国') {
      router.push('/immigration');
      return;
    }
    if (category === 'ICE执法动态' || category === 'ICE执法' || category === '驱逐快报') {
      router.push({ pathname: '/category/[name]', params: { name: 'ICE执法动态' } });
      return;
    }
    router.push({ pathname: '/category/[name]', params: { name: category } });
  };

  if (loading) return <View style={styles.skeleton}><View style={styles.sk1}/><View style={styles.sk2}/><View style={styles.sk3}/><View style={styles.sk4}/><View style={styles.sk5}/><View style={styles.sk5}/></View>;
  if (!article) return <View style={styles.center}><Text style={styles.errorTitle}>暂时无法读取这篇文章</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primaryButton} onPress={() => void load()}><Text style={styles.primaryButtonText}>重试</Text></Pressable></View>;

  return <><Stack.Screen options={{ title: '', headerShown: true, headerBackTitle: '返回', headerShadowVisible: false, gestureEnabled: true }} /><ScrollView style={styles.page} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
    {offline ? <View style={styles.offline}><Text style={styles.offlineText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>重新连接</Text></Pressable></View> : null}
    <Pressable testID="article-category-button" style={styles.categoryButton} onPress={openArticleSection} accessibilityRole="button" accessibilityLabel={`进入${article.category_name || '新闻'}栏目`}>
      <Text style={styles.category}>{article.category_name || '新闻'}</Text>
      <Text style={styles.categoryArrow}>›</Text>
    </Pressable>
    <Text style={styles.title}>{article.title}</Text>
    <Text style={styles.meta}>{article.author || '唐人日报'} · {article.published_at ? new Date(article.published_at).toLocaleString('zh-CN') : ''}</Text>
    {article.cover_image ? <Image source={{ uri: article.cover_image, cache: 'force-cache' }} style={styles.image} resizeMode="cover" /> : null}
    {article.summary ? <Text style={[styles.summary,{fontSize:18*fontScale,lineHeight:29*fontScale}]}>{article.summary}</Text> : null}
    <Text style={[styles.body,{fontSize:18*fontScale,lineHeight:32*fontScale}]}>{article.content || '正文暂不可用。'}</Text>
    <View style={styles.actions}>
      <Pressable style={favorite?styles.savedButton:styles.primaryButton} onPress={async()=>setFavorite(await toggleFavorite(article))}><Text style={styles.primaryButtonText}>{favorite?'已收藏':'收藏新闻'}</Text></Pressable>
      <Pressable style={styles.primaryButton} onPress={()=>Share.share({title:article.title,message:`${article.title}\n${webUrl}`,url:webUrl})}><Text style={styles.primaryButtonText}>分享新闻</Text></Pressable>
      <Pressable style={styles.outlineButton} onPress={copyLink}><Text style={styles.outlineButtonText}>复制链接</Text></Pressable>
      <Pressable style={styles.outlineButton} onPress={()=>Linking.openURL(webUrl)}><Text style={styles.outlineButtonText}>在网站打开</Text></Pressable>
    </View>
    {related.length ? <View style={styles.related}><Text style={styles.relatedTitle}>相关文章</Text>{related.map((item)=><Pressable key={String(item.id)} style={styles.relatedItem} onPress={()=>router.push(`/article/${item.id}`)}><Text style={styles.relatedItemTitle}>{item.title}</Text><Text style={styles.relatedMeta}>{item.category_name || '新闻'}</Text></Pressable>)}</View> : null}
    {!offline ? <CommentThread articleId={String(article.id)} /> : null}
  </ScrollView></>;
}

const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingTop:20,paddingBottom:60},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},muted:{color:'#667085',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#101828'},categoryButton:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#fff1f0',borderRadius:999,paddingHorizontal:11,paddingVertical:7},category:{color:'#c8211e',fontWeight:'900',fontSize:14},categoryArrow:{color:'#c8211e',fontWeight:'900',fontSize:18,lineHeight:18},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},meta:{color:'#98a2b3',marginTop:12,marginBottom:20},image:{width:'100%',height:230,borderRadius:16,backgroundColor:'#eaecf0',marginBottom:22},summary:{fontWeight:'700',color:'#344054',marginBottom:20},body:{color:'#1d2939'},actions:{gap:12,marginTop:30},primaryButton:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,paddingHorizontal:18,alignItems:'center'},savedButton:{backgroundColor:'#344054',borderRadius:12,paddingVertical:14,alignItems:'center'},primaryButtonText:{color:'#fff',fontWeight:'800',fontSize:16},outlineButton:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingVertical:13,paddingHorizontal:18,alignItems:'center'},outlineButtonText:{color:'#344054',fontWeight:'800',fontSize:16},related:{marginTop:36,paddingTop:24,borderTopWidth:1,borderTopColor:'#eaecf0'},relatedTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:10},relatedItem:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},relatedItemTitle:{fontSize:17,lineHeight:24,fontWeight:'800',color:'#1d2939'},relatedMeta:{fontSize:12,color:'#98a2b3',marginTop:5},offline:{backgroundColor:'#fffaeb',borderWidth:1,borderColor:'#fedf89',borderRadius:12,padding:12,marginBottom:18},offlineText:{color:'#93370d'},retry:{color:'#b54708',fontWeight:'900',marginTop:8},skeleton:{flex:1,padding:20,paddingTop:70,backgroundColor:'#fff'},sk1:{height:14,width:70,backgroundColor:'#eaecf0',borderRadius:7,marginBottom:18},sk2:{height:34,width:'92%',backgroundColor:'#eaecf0',borderRadius:8,marginBottom:12},sk3:{height:14,width:'48%',backgroundColor:'#f2f4f7',borderRadius:7,marginBottom:24},sk4:{height:220,width:'100%',backgroundColor:'#eaecf0',borderRadius:16,marginBottom:24},sk5:{height:18,width:'100%',backgroundColor:'#f2f4f7',borderRadius:7,marginBottom:12}});

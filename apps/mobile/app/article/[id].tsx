import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { fetchArticle, fetchRelatedArticles, NewsArticle } from '../../src/api/trrb';
import { addHistory, isFavorite, toggleFavorite } from '../../src/storage/library';
import { getReadingPreferences, ReadingPreferences, setReadingFontScale } from '../../src/storage/reading-preferences';
import { CommentThread } from '../../src/components/CommentThread';

const FONT_SCALES: ReadingPreferences['fontScale'][] = [0.9, 1, 1.15, 1.3];

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [related, setRelated] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [fontScale, setFontScale] = useState<ReadingPreferences['fontScale']>(1);

  useEffect(() => { void getReadingPreferences().then((p) => setFontScale(p.fontScale)); }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true); setError(''); setRelated([]);
    fetchArticle(id).then(async (row) => {
      if (!row) {
        setArticle(null);
        setError('文章可能尚未发布或已经下线。');
        return;
      }
      setArticle(row);
      await addHistory(row);
      setFavorite(await isFavorite(row.id));
      setRelated(await fetchRelatedArticles(row, 4).catch(() => []));
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

  const changeFont = async (next: ReadingPreferences['fontScale']) => {
    setFontScale(next);
    await setReadingFontScale(next);
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(webUrl);
    Alert.alert('已复制', '文章链接已经复制到剪贴板。');
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>正在读取正文…</Text></View>;
  if (!article) return <View style={styles.center}><Text style={styles.errorTitle}>暂时无法读取这篇文章</Text><Text style={styles.muted}>{error || '文章可能尚未发布或已经下线。'}</Text><Pressable style={styles.outlineButton} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.outlineButtonText}>打开唐人日报网站</Text></Pressable></View>;

  return <><Stack.Screen options={{ title: '新闻详情', headerBackTitle: '返回' }} /><ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.category}>{article.category_name || '新闻'}</Text>
    <Text style={styles.title}>{article.title}</Text>
    <Text style={styles.meta}>{article.author || '唐人日报'} · {article.published_at ? new Date(article.published_at).toLocaleString('zh-CN') : ''}</Text>
    {article.cover_image ? <Image source={{ uri: article.cover_image }} style={styles.image} resizeMode="cover" /> : null}
    {article.summary ? <Text style={[styles.summary, { fontSize: 18 * fontScale, lineHeight: 29 * fontScale }]}>{article.summary}</Text> : null}

    <View style={styles.fontBar}><Text style={styles.fontLabel}>正文字号</Text>{FONT_SCALES.map((scale) => <Pressable key={scale} onPress={() => changeFont(scale)} style={[styles.fontButton, fontScale === scale && styles.fontButtonActive]}><Text style={[styles.fontButtonText, fontScale === scale && styles.fontButtonTextActive]}>A</Text></Pressable>)}</View>
    <Text style={[styles.body, { fontSize: 18 * fontScale, lineHeight: 32 * fontScale }]}>{article.content || '正文暂不可用。'}</Text>

    <View style={styles.actions}>
      <Pressable style={favorite ? styles.savedButton : styles.primaryButton} onPress={async () => setFavorite(await toggleFavorite(article))}><Text style={styles.primaryButtonText}>{favorite ? '已收藏' : '收藏新闻'}</Text></Pressable>
      <Pressable style={styles.primaryButton} onPress={() => Share.share({ title: article.title, message: `${article.title}\n${webUrl}`, url: webUrl })}><Text style={styles.primaryButtonText}>分享新闻</Text></Pressable>
      <Pressable style={styles.outlineButton} onPress={copyLink}><Text style={styles.outlineButtonText}>复制链接</Text></Pressable>
      <Pressable style={styles.outlineButton} onPress={() => Linking.openURL(webUrl)}><Text style={styles.outlineButtonText}>在网站打开</Text></Pressable>
    </View>

    {related.length ? <View style={styles.related}><Text style={styles.relatedTitle}>相关文章</Text>{related.map((item) => <Pressable key={String(item.id)} style={styles.relatedItem} onPress={() => router.push(`/article/${item.id}`)}><Text style={styles.relatedItemTitle}>{item.title}</Text><Text style={styles.relatedMeta}>{item.category_name || '新闻'} · {item.published_at ? new Date(item.published_at).toLocaleDateString('zh-CN') : ''}</Text></Pressable>)}</View> : null}
    <CommentThread articleId={String(article.id)} />
  </ScrollView></>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingTop:26,paddingBottom:60},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},muted:{color:'#667085',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#101828'},category:{color:'#c8211e',fontWeight:'800'},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},meta:{color:'#98a2b3',marginTop:12,marginBottom:20},image:{width:'100%',height:230,borderRadius:16,backgroundColor:'#eaecf0',marginBottom:22},summary:{fontWeight:'700',color:'#344054',marginBottom:20},body:{color:'#1d2939'},fontBar:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:18},fontLabel:{color:'#667085',fontWeight:'700',marginRight:4},fontButton:{width:38,height:38,borderRadius:19,borderWidth:1,borderColor:'#d0d5dd',alignItems:'center',justifyContent:'center'},fontButtonActive:{backgroundColor:'#c8211e',borderColor:'#c8211e'},fontButtonText:{color:'#344054',fontWeight:'900'},fontButtonTextActive:{color:'#fff'},actions:{gap:12,marginTop:30},primaryButton:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,alignItems:'center'},savedButton:{backgroundColor:'#344054',borderRadius:12,paddingVertical:14,alignItems:'center'},primaryButtonText:{color:'#fff',fontWeight:'800',fontSize:16},outlineButton:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingVertical:13,paddingHorizontal:18,alignItems:'center'},outlineButtonText:{color:'#344054',fontWeight:'800',fontSize:16},related:{marginTop:36,paddingTop:24,borderTopWidth:1,borderTopColor:'#eaecf0'},relatedTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:10},relatedItem:{paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},relatedItemTitle:{fontSize:17,lineHeight:24,fontWeight:'800',color:'#1d2939'},relatedMeta:{fontSize:12,color:'#98a2b3',marginTop:5}
});

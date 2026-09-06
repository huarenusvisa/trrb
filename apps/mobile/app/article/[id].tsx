import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArticleNavigation, ArticleTranslation, fetchArticle, fetchArticleNavigation, fetchArticleTranslation, fetchRelatedArticles, NewsArticle } from '../../src/api/trrb';
import { addHistory, isFavorite, toggleFavorite } from '../../src/storage/library';
import { getReadingPreferences, ReadingPreferences, subscribeReadingPreferences } from '../../src/storage/reading-preferences';
import { cacheArticle, readCachedArticle, removeCachedArticle } from '../../src/storage/articleCache';
import { CommentThread } from '../../src/components/CommentThread';
import { NewsImage } from '../../src/components/NewsImage';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, newsCategoryName } from '../../src/i18n/i18n-core';

const REQUEST_TIMEOUT_MS = 12_000;

async function withTimeout<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('request-timeout')), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function ArticleDetailScreen() {
  const { locale, t } = useI18n();
  const { width, fontScale: systemFontScale } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [related, setRelated] = useState<NewsArticle[]>([]);
  const [navigation, setNavigation] = useState<ArticleNavigation>({ previous: null, next: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [readingScale, setReadingScale] = useState<ReadingPreferences['fontScale']>(1);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const requestVersion = useRef(0);
  const articleRef = useRef<NewsArticle | null>(null);
  const stackedLayout = width < 380 || systemFontScale >= 1.3;

  useEffect(() => {
    void getReadingPreferences().then((p) => setReadingScale(p.fontScale));
    return subscribeReadingPreferences((p) => setReadingScale(p.fontScale));
  }, []);

  const load = useCallback(async (preferCache = true, showRefresh = false) => {
    if (!id) return;
    const version = ++requestVersion.current;
    if (showRefresh) setRefreshing(true);
    setError('');
    if (!articleRef.current) {
      setRelated([]);
      setNavigation({ previous: null, next: null });
    }

    const cached = preferCache ? await readCachedArticle(id, true) : null;
    if (version !== requestVersion.current) return;
    if (cached) {
      setArticle(cached);
      setLoading(false);
      setFavorite(await isFavorite(cached.id));
    } else {
      setLoading(!articleRef.current);
    }

    try {
      const row = await withTimeout(fetchArticle(id));
      if (version !== requestVersion.current) return;
      if (!row) {
        await removeCachedArticle(id);
        setArticle(null);
        setError(t('article.unavailableBody'));
        return;
      }
      setArticle(row);
      setOffline(false);
      setError('');
      setLoading(false);
      await cacheArticle(row).catch(() => {});
      await addHistory(row).catch(() => {});
      setFavorite(await isFavorite(row.id));
      const [relatedResult, navigationResult] = await Promise.allSettled([
        withTimeout(fetchRelatedArticles(row, 4)),
        withTimeout(fetchArticleNavigation(row.id)),
      ]);
      if (version !== requestVersion.current) return;
      if (relatedResult.status === 'fulfilled') setRelated(relatedResult.value);
      if (navigationResult.status === 'fulfilled') setNavigation(navigationResult.value);
    } catch {
      if (version !== requestVersion.current) return;
      const fallback = cached || await readCachedArticle(id, true);
      if (fallback) {
        setArticle(fallback);
        setOffline(true);
        setFavorite(await isFavorite(fallback.id));
        setError(t('article.offline'));
      } else {
        setArticle(null);
        setError(t('article.loadFailed'));
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [id, t]);

  useEffect(() => {
    articleRef.current = null;
    setArticle(null);
    setOffline(false);
    void load(true);
    return () => { requestVersion.current += 1; };
  }, [id, load]);

  useEffect(() => { articleRef.current = article; }, [article]);

  const retryArticle = useCallback(() => { void load(false); }, [load]);
  useForegroundRetry(Boolean(error), retryArticle);

  useEffect(() => {
    let active = true;
    setTranslation(null);
    setShowTranslation(false);
    setTranslationLoading(false);
    if (!article || offline || (locale !== 'en' && locale !== 'zh-TW')) return () => { active = false; };

    setTranslationLoading(true);
    void fetchArticleTranslation(article.id, locale)
      .then((row) => {
        if (!active) return;
        setTranslation(row);
        setShowTranslation(Boolean(row));
      })
      .catch(() => {
        if (active) setTranslation(null);
      })
      .finally(() => {
        if (active) setTranslationLoading(false);
      });
    return () => { active = false; };
  }, [article?.id, locale, offline]);

  const webUrl = useMemo(() => {
    if (!article) return 'https://trrb.net';
    if (article.slug && article.category_name) {
      const sections: Record<string, string> = {'重要新闻':'important-news','热门头条':'hot-headlines','美国时政':'us-politics','美国警情':'us-crime','中国官场':'china-officialdom','移民美国':'immigration','庇护百科':'asylum','驱逐快报':'deport'};
      const section = article.topic_key === 'trump' ? 'trump' : article.topic_key === 'ice' ? 'ice' : sections[article.category_name] || 'news';
      return `https://trrb.net/${section}/${article.slug}`;
    }
    return `https://trrb.net/article.html?id=${encodeURIComponent(String(article.id))}`;
  }, [article]);

  const copyLink = async () => { await Clipboard.setStringAsync(webUrl); Alert.alert(t('article.copiedTitle'), t('article.copiedBody')); };

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

  if (loading) return <View accessible accessibilityRole="progressbar" accessibilityLabel={t('news.loading')} style={styles.skeleton}><View style={styles.sk1}/><View style={styles.sk2}/><View style={styles.sk3}/><View style={styles.sk4}/><View style={styles.sk5}/><View style={styles.sk5}/></View>;
  if (!article) return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.center}><Text accessibilityRole="header" style={styles.errorTitle}>{t('article.unavailableTitle')}</Text><Text style={styles.muted}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('article.retry')} style={styles.primaryButton} onPress={() => void load(false)}><Text style={styles.primaryButtonText}>{t('article.retry')}</Text></Pressable></View>;

  const categoryName = newsCategoryName(locale, article.category_name);
  const displayedTitle = showTranslation && translation ? translation.title : article.title;
  const displayedSummary = showTranslation && translation ? translation.summary : article.summary;
  const displayedContent = showTranslation && translation ? translation.content : article.content;
  return <><Stack.Screen options={{ title: '', headerShown: true, headerBackTitle: t('common.back'), headerShadowVisible: false, gestureEnabled: true }} /><ScrollView style={styles.page} contentContainerStyle={[styles.content, stackedLayout && styles.contentNarrow]} contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(false, true)} accessibilityLabel={t('article.retry')} />}>
    {offline ? <View testID="article-offline-banner" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.offline}><Text style={styles.offlineText}>{error}</Text><Pressable testID="article-offline-retry" accessibilityRole="button" accessibilityLabel={t('article.reconnect')} style={styles.inlineRetry} onPress={() => void load(false)}><Text style={styles.retry}>{t('article.reconnect')}</Text></Pressable></View> : null}
    <Pressable testID="article-category-button" style={styles.categoryButton} onPress={openArticleSection} accessibilityRole="button" accessibilityLabel={t('article.openCategory', { category: categoryName })}>
      <Text style={styles.category}>{categoryName}</Text>
      <Text style={styles.categoryArrow}>›</Text>
    </Pressable>
    <Text accessibilityRole="header" style={[styles.title, stackedLayout && styles.titleNarrow]}>{displayedTitle}</Text>
    <Text style={styles.meta}>{article.author || t('article.authorFallback')} · {article.published_at ? new Date(article.published_at).toLocaleString(localeDateTag(locale)) : ''}</Text>
    {article.cover_image ? <NewsImage testID="article-cover-image" uri={article.cover_image} style={[styles.image, stackedLayout && styles.imageNarrow]} /> : null}
    {displayedSummary ? <Text style={[styles.summary,{fontSize:18*readingScale,lineHeight:29*readingScale}]}>{displayedSummary}</Text> : null}
    <Text style={[styles.body,{fontSize:18*readingScale,lineHeight:32*readingScale}]}>{displayedContent || t('article.contentUnavailable')}</Text>
    {translation ? <View style={styles.translationControls}>
      <Text testID="article-reviewed-translation-note" style={styles.translationNote}>{t('article.reviewedTranslation')}</Text>
      <Pressable testID="article-translation-toggle" accessibilityRole="button" accessibilityLabel={showTranslation ? t('article.showOriginal') : t('article.showTranslation')} style={styles.translationButton} onPress={() => setShowTranslation((value) => !value)}>
        <Text style={styles.translationButtonText}>{showTranslation ? t('article.showOriginal') : t('article.showTranslation')}</Text>
      </Pressable>
    </View> : locale !== 'zh-CN' ? <Text testID="article-original-language-note" style={styles.languageNote}>{translationLoading ? t('article.checkingTranslation') : t('article.originalLanguage')}</Text> : null}
    {!offline && (navigation.previous || navigation.next) ? <View style={styles.navigation}>
      <Text accessibilityRole="header" style={styles.navigationTitle}>{t('article.continueReading')}</Text>
      <View style={[styles.navigationRow, stackedLayout && styles.navigationRowStacked]}>
        {navigation.previous ? <Pressable testID="article-previous" accessibilityRole="button" accessibilityLabel={t('article.previousA11y', { title: navigation.previous.title })} style={styles.navigationItem} onPress={()=>router.push(`/article/${navigation.previous!.id}`)}><Text style={styles.navigationLabel}>{t('article.previous')}</Text><Text style={styles.navigationItemTitle} numberOfLines={stackedLayout ? undefined : 3}>{navigation.previous.title}</Text></Pressable> : stackedLayout ? null : <View style={styles.navigationSpacer} />}
        {navigation.next ? <Pressable testID="article-next" accessibilityRole="button" accessibilityLabel={t('article.nextA11y', { title: navigation.next.title })} style={styles.navigationItem} onPress={()=>router.push(`/article/${navigation.next!.id}`)}><Text style={[styles.navigationLabel,styles.navigationLabelNext]}>{t('article.next')}</Text><Text style={styles.navigationItemTitle} numberOfLines={stackedLayout ? undefined : 3}>{navigation.next.title}</Text></Pressable> : stackedLayout ? null : <View style={styles.navigationSpacer} />}
      </View>
    </View> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={favorite?t('article.saved'):t('article.save')} accessibilityState={{ selected: favorite }} style={favorite?styles.savedButton:styles.primaryButton} onPress={async()=>setFavorite(await toggleFavorite(article))}><Text style={styles.primaryButtonText}>{favorite?t('article.saved'):t('article.save')}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('article.share')} style={styles.primaryButton} onPress={()=>Share.share({title:article.title,message:`${article.title}\n${webUrl}`,url:webUrl})}><Text style={styles.primaryButtonText}>{t('article.share')}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t('article.copyLink')} style={styles.outlineButton} onPress={copyLink}><Text style={styles.outlineButtonText}>{t('article.copyLink')}</Text></Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={t('article.openWebsite')} style={styles.outlineButton} onPress={()=>Linking.openURL(webUrl)}><Text style={styles.outlineButtonText}>{t('article.openWebsite')}</Text></Pressable>
    </View>
    {related.length ? <View style={styles.related}><Text accessibilityRole="header" style={styles.relatedTitle}>{t('article.related')}</Text>{related.map((item)=><Pressable key={String(item.id)} accessibilityRole="button" accessibilityLabel={t('news.openArticle', { title: item.title })} style={styles.relatedItem} onPress={()=>router.push(`/article/${item.id}`)}><Text style={styles.relatedItemTitle}>{item.title}</Text><Text style={styles.relatedMeta}>{newsCategoryName(locale, item.category_name)}</Text></Pressable>)}</View> : null}
    {!offline ? <CommentThread articleId={String(article.id)} /> : null}
  </ScrollView></>;
}

const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingTop:20,paddingBottom:60},contentNarrow:{paddingHorizontal:16},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},muted:{color:'#667085',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#101828'},categoryButton:{alignSelf:'flex-start',minHeight:44,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#fff1f0',borderRadius:999,paddingHorizontal:12,paddingVertical:8},category:{color:'#c8211e',fontWeight:'900',fontSize:14,flexShrink:1},categoryArrow:{color:'#c8211e',fontWeight:'900',fontSize:18,lineHeight:18},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},titleNarrow:{fontSize:27,lineHeight:36},meta:{color:'#667085',marginTop:12,marginBottom:20,flexShrink:1},image:{width:'100%',aspectRatio:16/9,borderRadius:16,backgroundColor:'#eaecf0',marginBottom:22},imageNarrow:{borderRadius:12},summary:{fontWeight:'700',color:'#344054',marginBottom:20,flexShrink:1},body:{color:'#1d2939',flexShrink:1},languageNote:{color:'#667085',fontSize:13,lineHeight:19,marginTop:18},translationControls:{marginTop:18,gap:10,alignItems:'flex-start'},translationNote:{color:'#027a48',fontSize:13,lineHeight:19,fontWeight:'700',flexShrink:1},translationButton:{minHeight:48,borderWidth:1,borderColor:'#d0d5dd',borderRadius:999,paddingHorizontal:14,paddingVertical:10,justifyContent:'center'},translationButtonText:{color:'#344054',fontSize:13,fontWeight:'800',flexShrink:1},navigation:{marginTop:30,paddingTop:22,borderTopWidth:1,borderTopColor:'#eaecf0'},navigationTitle:{fontSize:20,fontWeight:'900',color:'#101828',marginBottom:12},navigationRow:{flexDirection:'row',gap:10},navigationRowStacked:{flexDirection:'column'},navigationItem:{flex:1,minHeight:126,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:13,backgroundColor:'#f9fafb'},navigationSpacer:{flex:1},navigationLabel:{color:'#c8211e',fontWeight:'900',fontSize:13,marginBottom:8},navigationLabelNext:{textAlign:'right'},navigationItemTitle:{color:'#1d2939',fontWeight:'800',fontSize:15,lineHeight:21,flexShrink:1},actions:{gap:12,marginTop:30},primaryButton:{minHeight:48,backgroundColor:'#c8211e',borderRadius:12,paddingVertical:12,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},savedButton:{minHeight:48,backgroundColor:'#344054',borderRadius:12,paddingVertical:12,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},primaryButtonText:{color:'#fff',fontWeight:'800',fontSize:16,textAlign:'center',flexShrink:1},outlineButton:{minHeight:48,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,paddingVertical:12,paddingHorizontal:18,alignItems:'center',justifyContent:'center'},outlineButtonText:{color:'#344054',fontWeight:'800',fontSize:16,textAlign:'center',flexShrink:1},related:{marginTop:36,paddingTop:24,borderTopWidth:1,borderTopColor:'#eaecf0'},relatedTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:10},relatedItem:{minHeight:48,paddingVertical:14,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},relatedItemTitle:{fontSize:17,lineHeight:24,fontWeight:'800',color:'#1d2939',flexShrink:1},relatedMeta:{fontSize:12,color:'#667085',marginTop:5},offline:{backgroundColor:'#fffaeb',borderWidth:1,borderColor:'#fedf89',borderRadius:12,padding:12,marginBottom:18},offlineText:{color:'#93370d',flexShrink:1},inlineRetry:{minHeight:44,alignSelf:'flex-start',justifyContent:'center'},retry:{color:'#b54708',fontWeight:'900'},skeleton:{flex:1,padding:20,paddingTop:70,backgroundColor:'#fff'},sk1:{height:14,width:70,backgroundColor:'#eaecf0',borderRadius:7,marginBottom:18},sk2:{height:34,width:'92%',backgroundColor:'#eaecf0',borderRadius:8,marginBottom:12},sk3:{height:14,width:'48%',backgroundColor:'#f2f4f7',borderRadius:7,marginBottom:24},sk4:{height:220,width:'100%',backgroundColor:'#eaecf0',borderRadius:16,marginBottom:24},sk5:{height:18,width:'100%',backgroundColor:'#f2f4f7',borderRadius:7,marginBottom:12}});

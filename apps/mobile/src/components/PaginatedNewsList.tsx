import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ListRenderItemInfo, ViewToken } from 'react-native';
import { router } from 'expo-router';
import { fetchArticlePage, NewsArticle } from '../api/trrb';
import { useI18n } from '../i18n/I18nProvider';
import { localeDateTag } from '../i18n/i18n-core';
import { useForegroundRetry } from '../hooks/useForegroundRetry';
import { cacheNewsPage, readCachedNewsPage } from '../storage/newsFeedCache';
import { NewsImage, prefetchNewsImages } from './NewsImage';
import { nextNewsImagePrefetchWindow } from './news-image-prefetch-core';

type Props = {
  title: string;
  category?: string;
  q?: string;
  emptyText?: string;
};

export function PaginatedNewsList({ title, category, q, emptyText }: Props) {
  const { locale, t } = useI18n();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360;
  const largeText = fontScale >= 1.3;
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState('');
  const itemsRef = useRef<NewsArticle[]>([]);
  const prefetchedThroughRef = useRef(-1);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 120 }).current;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { prefetchedThroughRef.current = -1; }, [category, q]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<NewsArticle>[] }) => {
    const next = nextNewsImagePrefetchWindow(
      itemsRef.current,
      viewableItems.map((token) => token.index),
      prefetchedThroughRef.current,
    );
    if (!next) return;
    prefetchedThroughRef.current = next.prefetchedThrough;
    void prefetchNewsImages(next.uris, 4);
  }).current;

  const load = useCallback(async (reset = false) => {
    const offset = reset ? 0 : nextOffset;
    if (offset == null) return;
    try {
      setError('');
      if (!reset) setLoadingMore(true);
      const page = await fetchArticlePage({ category, q, offset, limit: 24 });
      setItems((current) => {
        const source = reset ? page.articles : [...current, ...page.articles];
        const seen = new Set<string>();
        return source.filter((item) => {
          const key = String(item.id);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setNextOffset(page.has_more ? page.next_offset : null);
      if (reset) void cacheNewsPage(category, q, page.articles, page.has_more ? page.next_offset : null).catch(() => undefined);
    } catch (e) {
      setError(reset && items.length > 0 ? t('news.offline') : (e instanceof Error ? e.message : t('news.loadFailed')));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [category, items.length, nextOffset, q, t]);

  useEffect(() => {
    let active = true;
    setLoading(true); setItems([]); setNextOffset(0); setError('');
    void (async () => {
      let restored = false;
      const cached = await readCachedNewsPage(category, q).catch(() => null);
      if (!active) return;
      if (cached) {
        restored = true;
        setItems(cached.articles);
        setNextOffset(cached.nextOffset ?? null);
        setLoading(false);
      }
      try {
        const page = await fetchArticlePage({ category, q, offset: 0, limit: 24 });
        if (!active) return;
        const next = page.has_more ? page.next_offset : null;
        setItems(page.articles);
        setNextOffset(next);
        setError('');
        void cacheNewsPage(category, q, page.articles, next).catch(() => undefined);
      } catch (e) {
        if (!active) return;
        setError(restored ? t('news.offline') : (e instanceof Error ? e.message : t('news.loadFailed')));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [category, q]);

  const retryList = () => {
    setRefreshing(true);
    void load(true);
  };

  useForegroundRetry(Boolean(error), retryList);

  const renderArticle = useCallback(({ item, index }: ListRenderItemInfo<NewsArticle>) => (
    <Pressable
      testID={`category-article-${index}`}
      accessibilityRole="button"
      accessibilityLabel={t('news.openArticle', { title: item.title })}
      style={[styles.card, compact && styles.compactCard, largeText && styles.largeTextCard]}
      onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}
    >
      <NewsImage uri={item.cover_image} style={styles.thumb} testID={`category-article-image-${index}`} priority="low" />
      <View style={styles.body}>
        <Text style={styles.articleTitle} numberOfLines={largeText ? undefined : 3}>{item.title}</Text>
        <Text style={styles.meta}>{item.published_at ? new Date(item.published_at).toLocaleString(localeDateTag(locale)) : ''}</Text>
      </View>
    </Pressable>
  ), [compact, largeText, locale, t]);

  if (loading) return <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={t('news.loading')}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>{t('news.loading')}</Text></View>;

  return (
    <FlatList
      testID="category-news-list"
      style={styles.page}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
      data={items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderArticle}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      removeClippedSubviews={!largeText}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retryList} />}
      onEndReachedThreshold={0.45}
      onEndReached={() => { if (!loadingMore && nextOffset != null) load(false); }}
      ListHeaderComponent={<View style={styles.header}><Text accessibilityRole="header" testID="category-screen-title" style={[styles.title, compact && styles.compactTitle]}>{title}</Text>{error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorPanel}><Text style={styles.error}>{error}</Text><Pressable testID="category-network-retry" accessibilityRole="button" accessibilityLabel={t('news.retry')} accessibilityState={{ disabled: refreshing }} disabled={refreshing} style={[styles.retryButton, refreshing && styles.retryButtonDisabled]} onPress={retryList}><Text style={styles.retryButtonText}>{refreshing ? t('news.retrying') : t('news.retry')}</Text></Pressable></View> : null}</View>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.muted}>{emptyText || t('news.empty')}</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="#c8211e" /> : nextOffset == null && items.length ? <Text style={styles.end}>{t('news.end')}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:38},compactContent:{paddingHorizontal:9},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},muted:{color:'#667085',lineHeight:21,textAlign:'center'},header:{marginBottom:18},title:{fontSize:30,lineHeight:39,fontWeight:'900',color:'#101828'},compactTitle:{fontSize:26,lineHeight:35},errorPanel:{marginTop:12,backgroundColor:'#fef3f2',borderRadius:10,padding:12,alignItems:'flex-start'},error:{color:'#b42318',lineHeight:21},retryButton:{minHeight:44,borderRadius:8,backgroundColor:'#c8211e',paddingHorizontal:16,paddingVertical:10,marginTop:10,alignItems:'center',justifyContent:'center'},retryButtonDisabled:{opacity:0.58},retryButtonText:{color:'#fff',fontSize:13,fontWeight:'800',textAlign:'center'},empty:{paddingVertical:80,alignItems:'center'},card:{minHeight:118,flexDirection:'row',backgroundColor:'#fff',borderRadius:14,overflow:'hidden',marginBottom:12},compactCard:{minHeight:108},largeTextCard:{minHeight:144},thumb:{width:126,minHeight:118,alignSelf:'stretch',backgroundColor:'#e4e7ec'},body:{flex:1,minWidth:0,padding:12,justifyContent:'center'},articleTitle:{fontSize:17,lineHeight:23,fontWeight:'800',color:'#101828'},meta:{fontSize:12,lineHeight:18,color:'#667085',marginTop:7},footer:{marginVertical:20},end:{textAlign:'center',color:'#667085',marginVertical:20,lineHeight:21}
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { router } from 'expo-router';
import { fetchArticlePage, NewsArticle } from '../api/trrb';
import { useI18n } from '../i18n/I18nProvider';
import { localeDateTag } from '../i18n/i18n-core';
import { cacheNewsPage, readCachedNewsPage } from '../storage/newsFeedCache';
import { NewsImage } from './NewsImage';

type Props = {
  title: string;
  category?: string;
  q?: string;
  emptyText?: string;
};

export function PaginatedNewsList({ title, category, q, emptyText }: Props) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState('');

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

  const renderArticle = useCallback(({ item, index }: ListRenderItemInfo<NewsArticle>) => (
    <Pressable
      testID={`category-article-${index}`}
      accessibilityRole="button"
      accessibilityLabel={t('news.openArticle', { title: item.title })}
      style={styles.card}
      onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}
    >
      <NewsImage uri={item.cover_image} style={styles.thumb} testID={`category-article-image-${index}`} />
      <View style={styles.body}>
        <Text style={styles.articleTitle} numberOfLines={3}>{item.title}</Text>
        <Text style={styles.meta}>{item.published_at ? new Date(item.published_at).toLocaleString(localeDateTag(locale)) : ''}</Text>
      </View>
    </Pressable>
  ), [locale, t]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>{t('news.loading')}</Text></View>;

  return (
    <FlatList
      testID="category-news-list"
      style={styles.page}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderArticle}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      removeClippedSubviews
      getItemLayout={(_, index) => ({ length: 130, offset: 130 * index, index })}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
      onEndReachedThreshold={0.45}
      onEndReached={() => { if (!loadingMore && nextOffset != null) load(false); }}
      ListHeaderComponent={<View style={styles.header}><Text testID="category-screen-title" style={styles.title}>{title}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.muted}>{emptyText || t('news.empty')}</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="#c8211e" /> : nextOffset == null && items.length ? <Text style={styles.end}>{t('news.end')}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:38},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},muted:{color:'#667085'},header:{marginBottom:18},title:{fontSize:30,fontWeight:'900',color:'#101828'},error:{marginTop:10,color:'#b42318'},empty:{paddingVertical:80,alignItems:'center'},card:{height:118,flexDirection:'row',backgroundColor:'#fff',borderRadius:14,overflow:'hidden',marginBottom:12},thumb:{width:126,height:118,backgroundColor:'#e4e7ec'},body:{flex:1,padding:12,justifyContent:'center'},articleTitle:{fontSize:17,lineHeight:23,fontWeight:'800',color:'#101828'},meta:{fontSize:12,color:'#98a2b3',marginTop:7},footer:{marginVertical:20},end:{textAlign:'center',color:'#98a2b3',marginVertical:20}
});

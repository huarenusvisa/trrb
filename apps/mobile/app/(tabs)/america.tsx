import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { fetchArticlePage, NewsArticle, sortNewestFirst } from '../../src/api/trrb';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, newsCategoryName } from '../../src/i18n/i18n-core';
import { cacheNewsPage, readCachedNewsPage } from '../../src/storage/newsFeedCache';

const feeds = ['美国时政', '美国警情'] as const;

function mergeUnique(rows: NewsArticle[]) {
  const seen = new Set<string>();
  return sortNewestFirst(rows).filter((item) => {
    const key = String(item.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AmericaScreen() {
  const { locale, t } = useI18n();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360;
  const largeText = fontScale >= 1.3;
  const [items, setItems] = useState<NewsArticle[]>([]);
  const itemsRef = useRef<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const updateItems = useCallback((next: NewsArticle[]) => {
    const merged = mergeUnique(next);
    itemsRef.current = merged;
    setItems(merged);
  }, []);

  const load = useCallback(async () => {
    const results = await Promise.allSettled(feeds.map((category) => fetchArticlePage({ category, limit: 60, offset: 0 })));
    const successful = results.flatMap((result, index) => {
      if (result.status !== 'fulfilled') return [];
      const category = feeds[index];
      const page = result.value;
      void cacheNewsPage(category, undefined, page.articles, page.has_more ? page.next_offset : null).catch(() => undefined);
      return page.articles;
    });
    const failed = results.flatMap((result, index) => result.status === 'rejected' ? [feeds[index]] : []);

    if (successful.length || failed.length < feeds.length) {
      const retained = itemsRef.current.filter((item) => failed.includes(item.category_name as typeof feeds[number]));
      updateItems([...successful, ...retained]);
      setError(failed.length ? t('america.partial') : '');
    } else {
      setError(itemsRef.current.length ? t('america.offline') : t('america.loadFailed'));
    }
    setLoading(false);
    setRefreshing(false);
  }, [t, updateItems]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await Promise.all(feeds.map((category) => readCachedNewsPage(category).catch(() => null)));
      if (!active) return;
      const restored = mergeUnique(cached.flatMap((snapshot) => snapshot?.articles ?? []));
      if (restored.length) {
        updateItems(restored);
        setLoading(false);
      }
      await load();
    })();
    return () => { active = false; };
  }, [load, updateItems]);

  const retry = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  useForegroundRetry(Boolean(error), retry);

  if (loading) return (
    <View testID="screen-america" accessibilityLiveRegion="polite" accessibilityLabel={t('news.loading')} style={styles.center}>
      <ActivityIndicator color="#c8211e" />
      <Text style={styles.muted}>{t('news.loading')}</Text>
    </View>
  );

  return <FlatList
    testID="screen-america"
    style={styles.page}
    contentContainerStyle={[styles.content, compact && styles.compactContent]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={retry} />}
    initialNumToRender={8}
    maxToRenderPerBatch={8}
    windowSize={7}
    removeClippedSubviews={!largeText}
    ListHeaderComponent={<View style={styles.header}>
      <Text accessibilityRole="header" style={[styles.h1, compact && styles.compactHeading]}>{t('america.heading')}</Text>
      <Text style={styles.sub}>{t('america.subtitle')}</Text>
      <View style={styles.chips}>{feeds.map((name) => {
        const label = newsCategoryName(locale, name);
        return <Pressable key={name} accessibilityRole="button" accessibilityLabel={t('america.openCategoryA11y', { category: label })} style={styles.chip} onPress={() => router.push({ pathname: '/category/[name]', params: { name } })}><Text style={styles.chipText}>{label}</Text></Pressable>;
      })}</View>
      {error ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorPanel}>
        <Text style={styles.error}>{error}</Text>
        <Pressable testID="america-network-retry" accessibilityRole="button" accessibilityLabel={t('news.retry')} accessibilityState={{ disabled: refreshing }} disabled={refreshing} style={[styles.retryButton, refreshing && styles.retryButtonDisabled]} onPress={retry}><Text style={styles.retryText}>{refreshing ? t('news.retrying') : t('news.retry')}</Text></Pressable>
      </View> : null}
    </View>}
    data={items}
    keyExtractor={(item) => String(item.id)}
    ListEmptyComponent={<Text style={styles.empty}>{t('america.empty')}</Text>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={t('news.openArticle', { title: item.title })} style={styles.row} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at ? new Date(item.published_at).toLocaleString(localeDateTag(locale)) : ''}</Text></Pressable>}
  />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' }, content: { padding: 16, paddingTop: 58, paddingBottom: 30 }, compactContent: { paddingHorizontal: 10 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: '#667085', lineHeight: 21 }, header: { marginBottom: 4 }, h1: { fontSize: 32, lineHeight: 40, fontWeight: '900', color: '#101828' }, compactHeading: { fontSize: 28, lineHeight: 36 }, sub: { color: '#667085', lineHeight: 21, marginTop: 6, marginBottom: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }, chip: { minHeight: 44, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }, chipText: { color: '#c8211e', lineHeight: 20, fontWeight: '900', textAlign: 'center' }, errorPanel: { backgroundColor: '#fef3f2', borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'flex-start' }, error: { color: '#b42318', lineHeight: 21 }, retryButton: { minHeight: 44, backgroundColor: '#c8211e', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 10, marginTop: 10, alignItems: 'center', justifyContent: 'center' }, retryButtonDisabled: { opacity: 0.58 }, retryText: { color: '#fff', fontSize: 13, lineHeight: 19, fontWeight: '800' }, row: { minHeight: 88, backgroundColor: '#fff', padding: 16, borderRadius: 14, marginBottom: 10, justifyContent: 'center' }, title: { fontSize: 18, lineHeight: 26, fontWeight: '800', color: '#101828' }, date: { fontSize: 12, lineHeight: 18, color: '#667085', marginTop: 8 }, empty: { color: '#667085', lineHeight: 21, textAlign: 'center', marginTop: 40 }
});

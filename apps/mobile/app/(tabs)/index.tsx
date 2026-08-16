import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchArticles, NewsArticle, sortNewestFirst } from '../../src/api/trrb';

const categories = ['重要新闻', '热门头条', '美国时政', '美国警情', '中国官场', '庇护百科'];

export default function HomeScreen() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      const global = await fetchArticles({ limit: 120 });
      const supplements = await Promise.all(categories.map((category) => fetchArticles({ category, limit: 12 }).catch(() => [])));
      const seen = new Set<string>();
      const merged = sortNewestFirst([...global, ...supplements.flat()]).filter((item) => {
        const key = String(item.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setArticles(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新闻加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);
  const lead = useMemo(() => articles.find((item) => item.cover_image) || articles[0], [articles]);
  const list = lead ? articles.filter((item) => String(item.id) !== String(lead.id)) : articles;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>正在读取唐人日报最新内容…</Text></View>;

  return (
    <FlatList
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          <View style={styles.header}><Text style={styles.brand}>唐人日报</Text><Text style={styles.en}>Tang Ren Daily</Text></View>
          <Text style={styles.subtitle}>美国华人新闻 · ICE · 移民 · 判例与新规</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {lead ? (
            <Pressable style={styles.hero} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(lead.id) } })}>
              {lead.cover_image ? <Image source={{ uri: lead.cover_image }} style={styles.heroImage} /> : null}
              <View style={styles.heroBody}><Text style={styles.category}>{lead.category_name || '最新新闻'}</Text><Text style={styles.heroTitle}>{lead.title}</Text></View>
            </Pressable>
          ) : null}
          <Text style={styles.sectionTitle}>最新报道</Text>
        </View>
      }
      data={list}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } })}>
          {item.cover_image ? <Image source={{ uri: item.cover_image }} style={styles.thumb} /> : <View style={styles.thumbPlaceholder} />}
          <View style={styles.cardBody}><Text style={styles.category}>{item.category_name || '新闻'}</Text><Text style={styles.title} numberOfLines={3}>{item.title}</Text><Text style={styles.date}>{item.published_at ? new Date(item.published_at).toLocaleString('zh-CN') : ''}</Text></View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' }, content: { padding: 16, paddingTop: 58, paddingBottom: 30 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: '#667085' },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 10 }, brand: { color: '#c8211e', fontSize: 30, fontWeight: '900' }, en: { color: '#667085', fontSize: 15, fontWeight: '700' }, subtitle: { marginTop: 6, color: '#475467', marginBottom: 18 }, error: { color: '#b42318', marginBottom: 12 },
  hero: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', marginBottom: 24 }, heroImage: { width: '100%', height: 210, backgroundColor: '#e4e7ec' }, heroBody: { padding: 16 }, heroTitle: { fontSize: 23, lineHeight: 31, fontWeight: '900', color: '#101828', marginTop: 6 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: '#101828', marginBottom: 12 }, card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', minHeight: 118 }, thumb: { width: 126, minHeight: 118, backgroundColor: '#e4e7ec' }, thumbPlaceholder: { width: 126, backgroundColor: '#eaecf0' }, cardBody: { flex: 1, padding: 12 }, category: { color: '#c8211e', fontSize: 13, fontWeight: '800' }, title: { marginTop: 5, color: '#101828', fontSize: 17, lineHeight: 23, fontWeight: '800' }, date: { marginTop: 7, color: '#98a2b3', fontSize: 12 }
});

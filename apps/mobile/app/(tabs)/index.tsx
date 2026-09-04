import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchArticles, NewsArticle, sortNewestFirst } from '../../src/api/trrb';

const categories = ['重要新闻', '美国时政', '美国警情', '中国官场', '庇护百科'];
const rankCategories = new Set(['热门头条', '中国热门头条', '美国时政', '美国警情', 'ICE执法动态', '驱逐快报', 'ICE执法', 'ICE执法追踪', 'ICE新闻']);

const topicCards = [
  {
    key: 'trump',
    title: '特朗普实时动态',
    subtitle: '相关新闻与公开发言自动汇总',
    status: '实时追踪',
    image: 'https://trrb.net/assets/topic-focus/trump-portrait.jpg?v=30',
    url: 'https://trrb.net/trump',
  },
  {
    key: 'ice',
    title: 'ICE执法动态',
    subtitle: '执法行动、拘留、遣返与法律应对',
    status: '自动更新',
    image: 'https://trrb.net/assets/topic-focus/ice-badge.jpg?v=30',
    url: 'https://trrb.net/ice',
  },
  {
    key: 'election',
    title: '2026中期选举实时动态',
    subtitle: '选情变化与关键州追踪',
    status: '实时更新',
    image: 'https://trrb.net/assets/topic-focus/election-ballot.jpg?v=30',
    url: 'https://trrb.net/listing.html?q=%E4%B8%AD%E6%9C%9F%E9%80%89%E4%B8%BE',
  },
  {
    key: 'finance',
    title: '牛来｜唐人财经',
    subtitle: '财经新闻 · 自选行情 · ETF基金 · 投资服务',
    status: '与PC端同步',
    image: 'https://trrb.net/.netlify/images?url=%2Fassets%2Ftopic-focus%2Ffinance-market.svg&fm=png&w=420',
    url: 'https://trrb.net/niulai/',
  },
] as const;

type WeatherState = { temperature: number | null; code: number | null; isDay: boolean };

function weatherLabel(code: number | null, isDay: boolean) {
  if (code == null) return { icon: '☁️', text: '天气' };
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', text: '晴' };
  if ([1, 2].includes(code)) return { icon: isDay ? '🌤️' : '☁️', text: '少云' };
  if (code === 3) return { icon: '☁️', text: '多云' };
  if ([45, 48].includes(code)) return { icon: '🌫️', text: '雾' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', text: '毛毛雨' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', text: '雨' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', text: '雪' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', text: '雷雨' };
  return { icon: '☁️', text: '天气' };
}

function shortDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
}

function articleDate(item: NewsArticle) {
  return shortDate(item.published_at || item.created_at);
}

function displayCategory(category?: string) {
  return category === '热门头条' ? '中国热门头条' : (category || '最新');
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hotIndex, setHotIndex] = useState(0);
  const [showStickyBrand, setShowStickyBrand] = useState(false);
  const [weather, setWeather] = useState<WeatherState>({ temperature: null, code: null, isDay: true });

  async function load() {
    try {
      setError('');
      const global = await fetchArticles({ limit: 120 });
      const requested = ['热门头条', ...categories];
      const supplements = await Promise.all(requested.map((category) => fetchArticles({ category, limit: 12 }).catch(() => [])));
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

  async function loadWeather() {
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current=temperature_2m,weather_code,is_day&timezone=America%2FNew_York');
      if (!response.ok) return;
      const data = await response.json();
      setWeather({
        temperature: typeof data?.current?.temperature_2m === 'number' ? Math.round(data.current.temperature_2m) : null,
        code: typeof data?.current?.weather_code === 'number' ? data.current.weather_code : null,
        isDay: data?.current?.is_day !== 0,
      });
    } catch {
      // Weather is secondary to news and never blocks the homepage.
    }
  }

  useEffect(() => { void load(); void loadWeather(); }, []);

  const hotHeadlines = useMemo(() => articles.filter((item) => item.category_name === '热门头条').slice(0, 12), [articles]);
  const activeHot = hotHeadlines.length ? hotHeadlines[hotIndex % hotHeadlines.length] : null;

  useEffect(() => {
    if (hotHeadlines.length < 2) return;
    const timer = setInterval(() => setHotIndex((index) => (index + 1) % hotHeadlines.length), 4200);
    return () => clearInterval(timer);
  }, [hotHeadlines.length]);

  const homepageArticles = useMemo(() => articles.filter((item) => item.category_name !== '移民美国'), [articles]);
  const importantNews = useMemo(() => homepageArticles.filter((item) => item.category_name === '重要新闻'), [homepageArticles]);
  const lead = useMemo(() => importantNews.find((item) => item.cover_image) || importantNews[0] || homepageArticles.find((item) => item.cover_image) || homepageArticles[0] || null, [importantNews, homepageArticles]);
  const leadStack = useMemo(() => homepageArticles.filter((item) => String(item.id) !== String(lead?.id)).slice(0, 4), [homepageArticles, lead]);
  const rankItems = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return articles
      .filter((item) => rankCategories.has(String(item.category_name || '').trim()))
      .filter((item) => {
        const time = Date.parse(item.published_at || item.created_at || '');
        return Number.isFinite(time) && time >= cutoff && time <= Date.now();
      })
      .slice(0, 8);
  }, [articles]);
  const categoryGroups = useMemo(() => categories.map((category) => ({
    category,
    items: homepageArticles.filter((item) => item.category_name === category).slice(0, 6),
  })), [homepageArticles]);
  const topicLatest = useMemo(() => ({
    trump: articles.find((item) => item.title.includes('特朗普')),
    ice: articles.find((item) => item.category_name === 'ICE执法动态' || item.title.toUpperCase().includes('ICE')),
    election: articles.find((item) => item.title.includes('中期选举') || item.title.includes('选举')),
    finance: articles.find((item) => /财经|股市|美股|基金|ETF/i.test(item.title)),
  }), [articles]);
  const weatherInfo = weatherLabel(weather.code, weather.isDay);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' }).format(new Date()), []);

  const openArticle = (item: NewsArticle) => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } });
  const openCategory = (category: string) => router.push({ pathname: '/category/[name]', params: { name: category } });
  const openTopic = (url: string) => { void Linking.openURL(url); };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>正在读取唐人日报最新内容…</Text></View>;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 6 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); void loadWeather(); }} />}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const next = nativeEvent.contentOffset.y > 100;
          if (next !== showStickyBrand) setShowStickyBrand(next);
        }}
      >
        <View style={styles.utilityRow}>
          <View style={styles.utilityCell}><Text style={styles.utilityIcon}>📍</Text><Text style={styles.utilityText}>纽约</Text></View>
          <Text style={styles.utilityDate}>{dateLabel}</Text>
          <View style={styles.utilityWeather}><Text>{weatherInfo.icon}</Text><Text style={styles.utilityText}>{weather.temperature == null ? '--°C' : `${weather.temperature}°C`} {weatherInfo.text}</Text></View>
        </View>

        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brand}>唐人日报</Text>
            <Text style={styles.brandEn}>TANG REN DAILY</Text>
          </View>
          <Pressable testID="home-search-button" accessibilityLabel="搜索" style={styles.searchButton} onPress={() => router.push('/search')}>
            <Text style={styles.searchIcon}>⌕</Text>
          </Pressable>
        </View>
        <Text style={styles.slogan}>立足美国 · 服务华人</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          {['重要新闻', '热门头条', '美国时政', '美国警情', '中国官场', '招聘求职', 'ICE执法动态'].map((item) => (
            <Pressable
              key={item}
              style={styles.navItem}
              onPress={() => {
                if (item === '招聘求职') router.push('/jobs');
                else openCategory(item);
              }}
            >
              <Text style={styles.navText}>{displayCategory(item)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {activeHot ? (
          <Pressable style={styles.breakingRow} onPress={() => openArticle(activeHot)}>
            <View style={styles.liveDot} />
            <Text style={styles.breakingLabel}>热门</Text>
            <Text style={styles.breakingTitle} numberOfLines={1}>{activeHot.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {lead ? (
          <Pressable testID="home-important-news" style={styles.heroCard} onPress={() => openArticle(lead)}>
            {lead.cover_image ? <Image source={{ uri: lead.cover_image }} style={styles.heroImage} /> : <View style={styles.heroImagePlaceholder} />}
            <View style={styles.heroOverlay} />
            <View style={styles.heroCopy}>
              <Text style={styles.heroCategory}>重要新闻</Text>
              <Text style={styles.heroTitle} numberOfLines={3}>{lead.title}</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.leadStack}>
          {leadStack.map((item) => (
            <Pressable key={String(item.id)} style={styles.leadRow} onPress={() => openArticle(item)}>
              {item.cover_image ? <Image source={{ uri: item.cover_image }} style={styles.leadThumb} /> : <View style={styles.leadThumbPlaceholder} />}
              <View style={styles.leadBody}>
                <Text style={styles.leadCategory}>{displayCategory(item.category_name)}</Text>
                <Text style={styles.leadTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.leadDate}>{articleDate(item)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>24小时热榜</Text>
            <Pressable onPress={() => openCategory('热门头条')}><Text style={styles.more}>更多 ›</Text></Pressable>
          </View>
          {rankItems.map((item, index) => (
            <Pressable key={String(item.id)} style={styles.rankRow} onPress={() => openArticle(item)}>
              <Text style={[styles.rankNo, index < 3 && styles.rankNoHot]}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.rankTitle} numberOfLines={2}>{item.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>专题聚焦</Text>
            <Text style={styles.more}>与PC端同步</Text>
          </View>
          {topicCards.map((topic) => {
            const latest = topicLatest[topic.key];
            return (
              <Pressable key={topic.key} style={styles.focusCard} onPress={() => openTopic(topic.url)}>
                <Image source={{ uri: topic.image }} style={styles.focusImage} />
                <View style={styles.focusBody}>
                  <Text style={styles.focusTitle}>{topic.title}</Text>
                  <Text style={styles.focusSub}>{topic.subtitle}</Text>
                  <View style={styles.focusStatusRow}><View style={styles.focusStatusDot} /><Text style={styles.focusStatus}>{topic.status}</Text></View>
                  <Text style={styles.focusLatest} numberOfLines={1}>{latest?.title || '正在读取最新动态…'}</Text>
                </View>
                <Text style={styles.focusArrow}>›</Text>
              </Pressable>
            );
          })}
        </View>

        {categoryGroups.map(({ category, items }) => {
          if (!items.length) return null;
          const first = items[0];
          const rest = items.slice(1);
          return (
            <View key={category} style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{category}</Text>
                <Pressable onPress={() => openCategory(category)}><Text style={styles.more}>更多 ›</Text></Pressable>
              </View>
              <Pressable style={styles.categoryLead} onPress={() => openArticle(first)}>
                {first.cover_image ? <Image source={{ uri: first.cover_image }} style={styles.categoryLeadImage} /> : <View style={styles.categoryLeadPlaceholder} />}
                <Text style={styles.categoryLeadTitle} numberOfLines={3}>{first.title}</Text>
              </Pressable>
              {rest.map((item) => (
                <Pressable key={String(item.id)} style={styles.textNewsRow} onPress={() => openArticle(item)}>
                  <View style={styles.newsDot} />
                  <Text style={styles.textNewsTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.textNewsDate}>{articleDate(item)}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}

        <View style={styles.serviceCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>服务与数据库</Text>
          </View>
          <View style={styles.serviceGrid}>
            <Pressable style={styles.serviceItem} onPress={() => router.push('/legal')}><Text style={styles.serviceTitle}>判例新规</Text><Text style={styles.serviceSub}>判例 · BIA · 联邦新规</Text></Pressable>
            <Pressable style={styles.serviceItem} onPress={() => router.push('/jobs')}><Text style={styles.serviceTitle}>招聘求职</Text><Text style={styles.serviceSub}>岗位与求职信息</Text></Pressable>
          </View>
        </View>

        <View style={styles.footerBlock}>
          <Text style={styles.footerBrand}>唐人日报 Tang Ren Daily</Text>
          <Text style={styles.footerText}>立足美国 · 服务华人</Text>
          <Text style={styles.footerText}>新闻、移民知识、判例新规与华人生活服务</Text>
        </View>
      </ScrollView>

      {showStickyBrand ? (
        <View style={[styles.stickyHeader, { paddingTop: insets.top, height: insets.top + 46 }]}> 
          <Text style={styles.stickyBrand}>唐人日报</Text>
          <Pressable testID="home-search-sticky" accessibilityLabel="搜索" onPress={() => router.push('/search')} style={styles.stickySearch}><Text style={styles.stickySearchText}>搜索</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  page: { flex: 1, backgroundColor: '#f4f5f7' },
  content: { paddingHorizontal: 14, paddingBottom: 34 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#667085' },
  utilityRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  utilityCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  utilityIcon: { fontSize: 12, marginRight: 3 },
  utilityText: { fontSize: 11, color: '#667085', fontWeight: '600' },
  utilityDate: { flex: 1, textAlign: 'center', fontSize: 11, color: '#98a2b3' },
  utilityWeather: { flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end', alignItems: 'center' },
  brandRow: { marginTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#b51d1a', fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: 1 },
  brandEn: { color: '#344054', fontSize: 9, letterSpacing: 2.5, marginTop: 1, fontWeight: '700' },
  slogan: { color: '#667085', fontSize: 12, marginTop: 7, marginBottom: 12 },
  searchButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  searchIcon: { color: '#101828', fontSize: 24, lineHeight: 26, fontWeight: '700' },
  navRow: { gap: 7, paddingBottom: 12 },
  navItem: { backgroundColor: '#fff', borderRadius: 7, paddingHorizontal: 11, paddingVertical: 8 },
  navText: { color: '#101828', fontSize: 12, fontWeight: '800' },
  breakingRow: { minHeight: 42, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#c8211e', marginRight: 7 },
  breakingLabel: { color: '#c8211e', fontSize: 12, fontWeight: '900', marginRight: 8 },
  breakingTitle: { flex: 1, color: '#101828', fontSize: 13, fontWeight: '800' },
  chevron: { color: '#98a2b3', fontSize: 22, marginLeft: 5 },
  error: { color: '#b42318', marginBottom: 10 },
  heroCard: { height: 238, borderRadius: 10, overflow: 'hidden', backgroundColor: '#101828', marginBottom: 10, position: 'relative' },
  heroImage: { width: '100%', height: '100%', backgroundColor: '#e4e7ec' },
  heroImagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#344054' },
  heroOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  heroCopy: { position: 'absolute', left: 15, right: 15, bottom: 16 },
  heroCategory: { alignSelf: 'flex-start', color: '#fff', backgroundColor: '#c8211e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 11, fontWeight: '900', marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 22, lineHeight: 29, fontWeight: '900' },
  leadStack: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 11, marginBottom: 12 },
  leadRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eaecf0' },
  leadThumb: { width: 92, height: 62, borderRadius: 6, backgroundColor: '#e4e7ec' },
  leadThumbPlaceholder: { width: 92, height: 62, borderRadius: 6, backgroundColor: '#eaecf0' },
  leadBody: { flex: 1, paddingLeft: 10 },
  leadCategory: { color: '#c8211e', fontSize: 10, fontWeight: '900' },
  leadTitle: { color: '#101828', fontSize: 14, lineHeight: 19, fontWeight: '800', marginTop: 3 },
  leadDate: { color: '#98a2b3', fontSize: 10, marginTop: 4 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12 },
  sectionHead: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: '#c8211e', marginBottom: 9 },
  sectionTitle: { color: '#101828', fontSize: 17, fontWeight: '900' },
  more: { color: '#667085', fontSize: 11, fontWeight: '700' },
  rankRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eaecf0' },
  rankNo: { width: 31, color: '#98a2b3', fontSize: 13, fontWeight: '900' },
  rankNoHot: { color: '#c8211e' },
  rankTitle: { flex: 1, color: '#101828', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  focusCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eaecf0' },
  focusImage: { width: 68, height: 76, borderRadius: 7, backgroundColor: '#eaecf0' },
  focusBody: { flex: 1, paddingHorizontal: 10 },
  focusTitle: { color: '#101828', fontSize: 14, fontWeight: '900' },
  focusSub: { color: '#667085', fontSize: 10, lineHeight: 15, marginTop: 3 },
  focusStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  focusStatusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#16a34a', marginRight: 5 },
  focusStatus: { color: '#667085', fontSize: 9, fontWeight: '700' },
  focusLatest: { color: '#98a2b3', fontSize: 9, marginTop: 4 },
  focusArrow: { color: '#98a2b3', fontSize: 23 },
  categoryLead: { marginBottom: 7 },
  categoryLeadImage: { width: '100%', height: 154, borderRadius: 7, backgroundColor: '#e4e7ec' },
  categoryLeadPlaceholder: { width: '100%', height: 154, borderRadius: 7, backgroundColor: '#eaecf0' },
  categoryLeadTitle: { color: '#101828', fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 8 },
  textNewsRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eaecf0' },
  newsDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#c8211e', marginRight: 7 },
  textNewsTitle: { flex: 1, color: '#344054', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  textNewsDate: { color: '#98a2b3', fontSize: 9, marginLeft: 8 },
  serviceCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12 },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceItem: { width: '48.5%', minHeight: 82, borderRadius: 8, backgroundColor: '#f7f8fa', padding: 11, justifyContent: 'center' },
  serviceTitle: { color: '#c8211e', fontSize: 14, fontWeight: '900' },
  serviceSub: { color: '#667085', fontSize: 10, lineHeight: 15, marginTop: 5 },
  footerBlock: { backgroundColor: '#1f242b', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 20, marginTop: 1 },
  footerBrand: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footerText: { color: '#c9ced6', fontSize: 11, lineHeight: 18, marginTop: 4 },
  stickyHeader: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 30, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eaecf0', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 8, justifyContent: 'space-between' },
  stickyBrand: { color: '#c8211e', fontSize: 21, fontWeight: '900' },
  stickySearch: { paddingHorizontal: 10, paddingVertical: 4 },
  stickySearchText: { color: '#101828', fontWeight: '800' },
});

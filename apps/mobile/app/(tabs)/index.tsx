import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchArticles, fetchHomepageFocus, NewsArticle, sortNewestFirst } from '../../src/api/trrb';
import { NewsImage } from '../../src/components/NewsImage';
import { cacheHomeFeed, readCachedHomeFeed } from '../../src/storage/newsFeedCache';

const HOME_NAV_ITEMS = ['重要新闻', '热门头条', '美国时政', '美国警情', '招聘求职', 'ICE执法动态'] as const;
const SUPPLEMENT_CATEGORIES = ['重要新闻', '热门头条', '美国时政', '美国警情', 'ICE执法动态'] as const;
const rankCategories = new Set(['热门头条', '中国热门头条', '美国时政', '美国警情', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报']);

const newsSections = [
  { key: 'china-hot', title: '中国热门头条', category: '热门头条', aliases: ['热门头条', '中国热门头条'] },
  { key: 'us-politics', title: '美国时政', category: '美国时政', aliases: ['美国时政'] },
  { key: 'ice-news', title: 'ICE执法动态', category: 'ICE执法动态', aliases: ['ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报'] },
  { key: 'us-crime', title: '美国警情', category: '美国警情', aliases: ['美国警情'] },
] as const;

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

const portalSections = [
  {
    key: 'judges',
    title: '移民法官通过率',
    action: '进入查询',
    banner: '查法官 · 看法院 · 比较庇护裁决数据',
    items: ['查移民法官', '全部移民法院', '按州查看', '各国国籍批准率'],
    url: 'https://asylumjudge.com/',
  },
  {
    key: 'immigration',
    title: '移民美国',
    action: '进入知识库',
    banner: '找到适合您的美国身份途径',
    items: ['赴美留学', '赴美工作', '职业移民', '家庭移民', '人道主义庇护', '境内身份转换', '入籍美国公民'],
    route: '/immigration',
  },
  {
    key: 'legal',
    title: '美国判例与新规',
    action: '进入数据库',
    banner: '追踪美国最新判例、裁决与政府新规',
    items: ['最高法院', '巡回法院', 'BIA裁决', '行政命令', '联邦新规'],
    route: '/legal',
  },
  {
    key: 'jobs',
    title: '招聘求职',
    action: '更多职位',
    banner: '查看最新岗位与华人招聘信息',
    items: ['推荐岗位', '餐饮服务', '物流运输', '办公室职位', '兼职工作', '发布招聘'],
    route: '/jobs',
  },
  {
    key: 'community',
    title: '移民社区',
    action: '进入社区',
    banner: '分享真实经历 · 问问题 · 互相帮助',
    items: ['USCIS面谈', '上庭交流', '移民互助', 'ICE经历', '律师点评', '投稿爆料'],
    route: '/community',
  },
] as const;

const readerServices = [
  { key: 'subscribe', title: '订阅每日快报', subtitle: '每日精选新闻直达邮箱，不错过任何重要消息', action: '立即订阅', url: 'https://trrb.net/#daily' },
  { key: 'readers', title: '加入读者群', subtitle: '获取第一手资讯与深度解读', action: '查看方式', url: 'https://trrb.net/#community' },
  { key: 'tips', title: '投稿爆料', subtitle: '提交新闻线索、独家爆料、图片或视频', action: '提交线索', url: 'https://trrb.net/#submit' },
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

function isHiddenHomepageCategory(category?: string) {
  const value = String(category || '').trim();
  return value.startsWith('中国官') || value === '驱逐快报' || /ICE/i.test(value);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [focusArticles, setFocusArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hotIndex, setHotIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showStickyBrand, setShowStickyBrand] = useState(false);
  const [showDeferredServices, setShowDeferredServices] = useState(false);
  const [weather, setWeather] = useState<WeatherState>({ temperature: null, code: null, isDay: true });

  async function load(restoreCache = false) {
    let restored = false;
    let cachedFocus = focusArticles;
    if (restoreCache) {
      const cached = await readCachedHomeFeed().catch(() => null);
      if (cached) {
        restored = true;
        cachedFocus = cached.focusArticles || [];
        setArticles(cached.articles);
        setFocusArticles(cachedFocus);
        setLoading(false);
      }
    }
    try {
      setError('');
      const [global, focusResult] = await Promise.all([
        fetchArticles({ limit: 120 }),
        fetchHomepageFocus().catch(() => null),
      ]);
      const supplements = await Promise.all(SUPPLEMENT_CATEGORIES.map((category) => fetchArticles({ category, limit: 12 }).catch(() => [])));
      const seen = new Set<string>();
      const merged = sortNewestFirst([...global, ...supplements.flat()]).filter((item) => {
        const key = String(item.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const focus = focusResult ?? cachedFocus;
      setArticles(merged);
      setFocusArticles(focus);
      void cacheHomeFeed(merged, focus).catch(() => undefined);
    } catch (e) {
      setError(restored || articles.length > 0 ? '网络不可用，正在显示上次读取的新闻。下拉即可重试。' : (e instanceof Error ? e.message : '新闻加载失败'));
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

  useEffect(() => { void load(true); void loadWeather(); }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setShowDeferredServices(true));
    return () => task.cancel();
  }, []);

  const hotHeadlines = useMemo(() => articles.filter((item) => ['热门头条', '中国热门头条'].includes(String(item.category_name || ''))).slice(0, 12), [articles]);
  const activeHot = hotHeadlines.length ? hotHeadlines[hotIndex % hotHeadlines.length] : null;

  useEffect(() => {
    if (hotHeadlines.length < 2) return;
    const timer = setInterval(() => setHotIndex((index) => (index + 1) % hotHeadlines.length), 4200);
    return () => clearInterval(timer);
  }, [hotHeadlines.length]);

  const homepageArticles = useMemo(() => articles.filter((item) => !isHiddenHomepageCategory(item.category_name)), [articles]);
  const importantCarousel = useMemo(() => {
    const seen = new Set<string>();
    return focusArticles.filter((item) => {
      const key = String(item.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }, [focusArticles]);
  const carouselWidth = Math.max(280, width - 28);

  useEffect(() => {
    if (importantCarousel.length < 2) return;
    const timer = setInterval(() => {
      setCarouselIndex((current) => {
        const next = (current + 1) % importantCarousel.length;
        carouselRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
        return next;
      });
    }, 4800);
    return () => clearInterval(timer);
  }, [carouselWidth, importantCarousel.length]);

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
  const categoryGroups = useMemo(() => newsSections.map((section) => ({
    ...section,
    items: (section.key === 'ice-news' ? articles : homepageArticles)
      .filter((item) => section.aliases.some((alias) => alias === String(item.category_name || '')))
      .slice(0, 6),
  })), [articles, homepageArticles]);
  const topicLatest = useMemo(() => ({
    trump: articles.find((item) => item.title.includes('特朗普')),
    ice: articles.find((item) => /ICE|移民执法|驱逐/i.test(`${item.category_name || ''} ${item.title}`)),
    election: articles.find((item) => item.title.includes('中期选举') || item.title.includes('选举')),
    finance: articles.find((item) => /财经|股市|美股|基金|ETF/i.test(item.title)),
  }), [articles]);
  const weatherInfo = weatherLabel(weather.code, weather.isDay);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' }).format(new Date()), []);

  const openArticle = (item: NewsArticle) => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } });
  const openCategory = (category: string) => router.push({ pathname: '/category/[name]', params: { name: category } });
  const openTopic = (url: string) => { void Linking.openURL(url); };
  const openPortal = (section: (typeof portalSections)[number]) => {
    if ('url' in section) void Linking.openURL(section.url);
    else router.push(section.route as '/immigration' | '/legal' | '/jobs' | '/community');
  };

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
          {HOME_NAV_ITEMS.map((item) => (
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

        {importantCarousel.length ? (
          <View testID="home-important-carousel" style={styles.carouselWrap}>
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={({ nativeEvent }) => setCarouselIndex(Math.round(nativeEvent.contentOffset.x / carouselWidth))}
            >
              {importantCarousel.map((item, index) => (
                <Pressable
                  key={String(item.id)}
                  testID={`home-important-slide-${index}`}
                  style={[styles.heroCard, { width: carouselWidth }]}
                  onPress={() => openArticle(item)}
                >
                  <NewsImage uri={item.cover_image} style={styles.heroImage} testID={`home-important-image-${index}`} />
                  <View style={styles.heroOverlay} />
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroCategory}>重要新闻</Text>
                    <Text style={styles.heroTitle} numberOfLines={3}>{item.title}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.carouselDots}>
              {importantCarousel.map((item, index) => <View key={String(item.id)} style={[styles.carouselDot, index === carouselIndex && styles.carouselDotActive]} />)}
            </View>
          </View>
        ) : null}

        <View testID="home-rankings" style={styles.sectionCard}>
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

        <View testID="home-topics" style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>专题聚焦</Text>
            <Text style={styles.more}>与PC端同步</Text>
          </View>
          {topicCards.map((topic) => {
            const latest = topicLatest[topic.key];
            return (
              <Pressable key={topic.key} style={styles.focusCard} onPress={() => openTopic(topic.url)}>
                <NewsImage uri={topic.image} style={styles.focusImage} testID={`home-topic-image-${topic.key}`} />
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

        {categoryGroups.map(({ key, title, category, items }) => {
          if (!items.length) return null;
          const first = items[0];
          const rest = items.slice(1);
          return (
            <View key={key} testID={`home-news-${key}`} style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Pressable onPress={() => openCategory(category)}><Text style={styles.more}>更多 ›</Text></Pressable>
              </View>
              <Pressable style={styles.categoryLead} onPress={() => openArticle(first)}>
                <NewsImage uri={first.cover_image} style={styles.categoryLeadImage} testID={`home-category-image-${key}`} />
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

        {showDeferredServices ? (
          <>
            {portalSections.map((section) => (
              <View key={section.key} testID={`home-portal-${section.key}`} style={styles.portalCard}>
                <View style={styles.portalHead}>
                  <View style={styles.portalTitleWrap}><View style={styles.portalAccent} /><Text style={styles.portalTitle}>{section.title}</Text></View>
                  <Pressable onPress={() => openPortal(section)}><Text style={styles.portalAction}>{section.action}</Text></Pressable>
                </View>
                <Pressable style={styles.portalBanner} onPress={() => openPortal(section)}><Text style={styles.portalBannerText}>{section.banner}</Text></Pressable>
                <View style={styles.portalGrid}>
                  {section.items.map((item, index) => (
                    <Pressable key={item} style={[styles.portalItem, section.items.length % 2 === 1 && index === section.items.length - 1 && styles.portalItemWide]} onPress={() => openPortal(section)}>
                      <Text style={styles.portalItemText}>{item}</Text><Text style={styles.portalArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.portalMore} onPress={() => openPortal(section)}><Text style={styles.portalMoreText}>{section.action}</Text></Pressable>
              </View>
            ))}

            <View testID="home-reader-services" style={styles.readerServicesCard}>
              {readerServices.map((service) => (
                <Pressable key={service.key} style={styles.readerService} onPress={() => void Linking.openURL(service.url)}>
                  <View style={styles.readerServiceCopy}><Text style={styles.readerServiceTitle}>{service.title}</Text><Text style={styles.readerServiceSub}>{service.subtitle}</Text></View>
                  <Text style={styles.readerServiceAction}>{service.action}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.footerBlock}>
              <Text style={styles.footerBrand}>唐人日报 Tang Ren Daily</Text>
              <Text style={styles.footerText}>立足美国 · 服务华人</Text>
              <Text style={styles.footerText}>新闻、移民知识、判例新规与华人生活服务</Text>
            </View>
          </>
        ) : null}
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
  carouselWrap: { marginBottom: 12 },
  heroCard: { height: 238, borderRadius: 10, overflow: 'hidden', backgroundColor: '#101828', position: 'relative' },
  heroImage: { width: '100%', height: '100%', backgroundColor: '#e4e7ec' },
  heroOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  heroCopy: { position: 'absolute', left: 15, right: 15, bottom: 16 },
  heroCategory: { alignSelf: 'flex-start', color: '#fff', backgroundColor: '#c8211e', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, fontSize: 11, fontWeight: '900', marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 22, lineHeight: 29, fontWeight: '900' },
  carouselDots: { position: 'absolute', right: 14, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  carouselDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.72)' },
  carouselDotActive: { width: 24, backgroundColor: '#e00000' },
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
  categoryLeadTitle: { color: '#101828', fontSize: 16, lineHeight: 22, fontWeight: '900', marginTop: 8 },
  textNewsRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eaecf0' },
  newsDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#c8211e', marginRight: 7 },
  textNewsTitle: { flex: 1, color: '#344054', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  textNewsDate: { color: '#98a2b3', fontSize: 9, marginLeft: 8 },
  portalCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e4e7ec' },
  portalHead: { minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  portalTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  portalAccent: { width: 4, height: 27, backgroundColor: '#d71920', marginRight: 10 },
  portalTitle: { color: '#101828', fontSize: 20, fontWeight: '900' },
  portalAction: { color: '#667085', fontSize: 12, fontWeight: '800' },
  portalBanner: { minHeight: 66, borderRadius: 9, backgroundColor: '#ca0000', paddingHorizontal: 13, justifyContent: 'center', marginBottom: 10 },
  portalBannerText: { color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '900' },
  portalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  portalItem: { width: '48.5%', minHeight: 58, borderRadius: 8, borderWidth: 1, borderColor: '#e4e7ec', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portalItemWide: { width: '100%' },
  portalItemText: { flex: 1, color: '#101828', fontSize: 13, fontWeight: '800' },
  portalArrow: { color: '#d71920', fontSize: 22, marginLeft: 5 },
  portalMore: { minHeight: 48, borderRadius: 8, backgroundColor: '#f7f7f8', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  portalMoreText: { color: '#b51d1a', fontSize: 14, fontWeight: '900' },
  readerServicesCard: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e4e7ec' },
  readerService: { minHeight: 96, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eaecf0', paddingVertical: 13 },
  readerServiceCopy: { flex: 1, paddingRight: 12 },
  readerServiceTitle: { color: '#101828', fontSize: 18, fontWeight: '900' },
  readerServiceSub: { color: '#667085', fontSize: 11, lineHeight: 17, marginTop: 6 },
  readerServiceAction: { color: '#c8211e', fontSize: 12, fontWeight: '900' },
  footerBlock: { backgroundColor: '#1f242b', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 20, marginTop: 1 },
  footerBrand: { color: '#fff', fontSize: 15, fontWeight: '900' },
  footerText: { color: '#c9ced6', fontSize: 11, lineHeight: 18, marginTop: 4 },
  stickyHeader: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 30, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eaecf0', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 8, justifyContent: 'space-between' },
  stickyBrand: { color: '#c8211e', fontSize: 21, fontWeight: '900' },
  stickySearch: { paddingHorizontal: 10, paddingVertical: 4 },
  stickySearchText: { color: '#101828', fontWeight: '800' },
});

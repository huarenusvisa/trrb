import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchArticles, fetchHomepageFocus, homepageSupplementGaps, NewsArticle, sortNewestFirst } from '../../src/api/trrb';
import { NewsImage, prefetchNewsImages } from '../../src/components/NewsImage';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, MessageKey } from '../../src/i18n/i18n-core';
import { cacheHomeFeed, readCachedHomeFeed } from '../../src/storage/newsFeedCache';

const HOME_NAV_ITEMS = [
  { category: '重要新闻', labelKey: 'home.navImportant' },
  { category: '热门头条', labelKey: 'home.navHot' },
  { category: '美国时政', labelKey: 'home.navUsPolitics' },
  { category: '美国警情', labelKey: 'home.navUsSafety' },
  { category: '招聘求职', labelKey: 'home.navJobs', route: '/jobs' },
  { category: 'ICE执法动态', labelKey: 'home.navIce' },
] as const satisfies ReadonlyArray<{ category: string; labelKey: MessageKey; route?: '/jobs' }>;
const rankCategories = new Set(['热门头条', '中国热门头条', '美国时政', '美国警情', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报']);

const newsSections = [
  { key: 'china-hot', titleKey: 'home.sectionChinaHot', category: '热门头条', aliases: ['热门头条', '中国热门头条'] },
  { key: 'us-politics', titleKey: 'home.sectionUsPolitics', category: '美国时政', aliases: ['美国时政'] },
  { key: 'ice-news', titleKey: 'home.sectionIce', category: 'ICE执法动态', aliases: ['ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报'] },
  { key: 'us-crime', titleKey: 'home.sectionUsSafety', category: '美国警情', aliases: ['美国警情'] },
] as const satisfies ReadonlyArray<{ key: string; titleKey: MessageKey; category: string; aliases: readonly string[] }>;

const topicCards = [
  {
    key: 'trump',
    titleKey: 'home.topicTrumpTitle',
    subtitleKey: 'home.topicTrumpSubtitle',
    statusKey: 'home.topicLiveTracking',
    image: 'https://trrb.net/assets/topic-focus/trump-portrait.jpg?v=30',
    url: 'https://trrb.net/trump',
  },
  {
    key: 'ice',
    titleKey: 'home.topicIceTitle',
    subtitleKey: 'home.topicIceSubtitle',
    statusKey: 'home.topicAutoUpdate',
    image: 'https://trrb.net/assets/topic-focus/ice-badge.jpg?v=30',
    url: 'https://trrb.net/ice',
  },
  {
    key: 'election',
    titleKey: 'home.topicElectionTitle',
    subtitleKey: 'home.topicElectionSubtitle',
    statusKey: 'home.topicLiveUpdate',
    image: 'https://trrb.net/assets/topic-focus/election-ballot.jpg?v=30',
    url: 'https://trrb.net/listing.html?q=%E4%B8%AD%E6%9C%9F%E9%80%89%E4%B8%BE',
  },
  {
    key: 'finance',
    titleKey: 'home.topicFinanceTitle',
    subtitleKey: 'home.topicFinanceSubtitle',
    statusKey: 'home.syncedWithWeb',
    image: 'https://trrb.net/.netlify/images?url=%2Fassets%2Ftopic-focus%2Ffinance-market.svg&fm=png&w=420',
    url: 'https://trrb.net/niulai/',
  },
] as const satisfies ReadonlyArray<{ key: 'trump' | 'ice' | 'election' | 'finance'; titleKey: MessageKey; subtitleKey: MessageKey; statusKey: MessageKey; image: string; url: string }>;

const portalSections = [
  {
    key: 'judges',
    titleKey: 'home.portalJudgesTitle',
    actionKey: 'home.portalJudgesAction',
    bannerKey: 'home.portalJudgesBanner',
    itemKeys: ['home.portalJudgesSearch', 'home.portalJudgesCourts', 'home.portalJudgesStates', 'home.portalJudgesNationalities'],
    url: 'https://asylumjudge.com/',
  },
  {
    key: 'immigration',
    titleKey: 'home.portalImmigrationTitle',
    actionKey: 'home.portalImmigrationAction',
    bannerKey: 'home.portalImmigrationBanner',
    itemKeys: ['home.portalImmigrationStudy', 'home.portalImmigrationWork', 'home.portalImmigrationEmployment', 'home.portalImmigrationFamily', 'home.portalImmigrationHumanitarian', 'home.portalImmigrationStatus', 'home.portalImmigrationCitizenship'],
    route: '/immigration',
  },
  {
    key: 'legal',
    titleKey: 'home.portalLegalTitle',
    actionKey: 'home.portalLegalAction',
    bannerKey: 'home.portalLegalBanner',
    itemKeys: ['home.portalLegalSupremeCourt', 'home.portalLegalCircuitCourts', 'home.portalLegalBia', 'home.portalLegalExecutiveOrders', 'home.portalLegalFederalRules'],
    route: '/legal',
  },
  {
    key: 'jobs',
    titleKey: 'home.portalJobsTitle',
    actionKey: 'home.portalJobsAction',
    bannerKey: 'home.portalJobsBanner',
    itemKeys: ['home.portalJobsFeatured', 'home.portalJobsFood', 'home.portalJobsLogistics', 'home.portalJobsOffice', 'home.portalJobsPartTime', 'home.portalJobsPost'],
    route: '/jobs',
  },
  {
    key: 'community',
    titleKey: 'home.portalCommunityTitle',
    actionKey: 'home.portalCommunityAction',
    bannerKey: 'home.portalCommunityBanner',
    itemKeys: ['home.portalCommunityUscis', 'home.portalCommunityCourt', 'home.portalCommunityHelp', 'home.portalCommunityIce', 'home.portalCommunityLawyers', 'home.portalCommunityTips'],
    route: '/community',
  },
] as const;

const readerServices = [
  { key: 'subscribe', titleKey: 'home.readerSubscribeTitle', subtitleKey: 'home.readerSubscribeSubtitle', actionKey: 'home.readerSubscribeAction', url: 'https://trrb.net/#daily' },
  { key: 'readers', titleKey: 'home.readerGroupTitle', subtitleKey: 'home.readerGroupSubtitle', actionKey: 'home.readerGroupAction', url: 'https://trrb.net/#community' },
  { key: 'tips', titleKey: 'home.readerTipsTitle', subtitleKey: 'home.readerTipsSubtitle', actionKey: 'home.readerTipsAction', url: 'https://trrb.net/#submit' },
] as const;

type WeatherState = { temperature: number | null; code: number | null; isDay: boolean };

function weatherLabel(code: number | null, isDay: boolean) {
  if (code == null) return { icon: '☁️', textKey: 'home.weatherUnknown' as MessageKey };
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', textKey: 'home.weatherClear' as MessageKey };
  if ([1, 2].includes(code)) return { icon: isDay ? '🌤️' : '☁️', textKey: 'home.weatherPartlyCloudy' as MessageKey };
  if (code === 3) return { icon: '☁️', textKey: 'home.weatherCloudy' as MessageKey };
  if ([45, 48].includes(code)) return { icon: '🌫️', textKey: 'home.weatherFog' as MessageKey };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', textKey: 'home.weatherDrizzle' as MessageKey };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', textKey: 'home.weatherRain' as MessageKey };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', textKey: 'home.weatherSnow' as MessageKey };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', textKey: 'home.weatherThunderstorm' as MessageKey };
  return { icon: '☁️', textKey: 'home.weatherUnknown' as MessageKey };
}

function shortDate(value: string | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
}

function articleDate(item: NewsArticle, locale: string) {
  return shortDate(item.published_at || item.created_at, locale);
}

function isHiddenHomepageCategory(category?: string) {
  const value = String(category || '').trim();
  return value.startsWith('中国官') || value === '驱逐快报' || /ICE/i.test(value);
}

export default function HomeScreen() {
  const { locale, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const loadSequence = useRef(0);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [focusArticles, setFocusArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState<'offline' | 'loadFailed' | ''>('');
  const [hotIndex, setHotIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showStickyBrand, setShowStickyBrand] = useState(false);
  const [showDeferredServices, setShowDeferredServices] = useState(false);
  const [weather, setWeather] = useState<WeatherState>({ temperature: null, code: null, isDay: true });

  async function load(restoreCache = false) {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    let restored = false;
    let cachedFocus = focusArticles;
    setSlowLoading(false);
    const slowTimer = setTimeout(() => {
      if (sequence === loadSequence.current) setSlowLoading(true);
    }, 4000);
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
      if (sequence !== loadSequence.current) return;
      clearTimeout(slowTimer);
      setSlowLoading(false);

      const focus = focusResult ?? cachedFocus;
      setArticles(global);
      setFocusArticles(focus);
      setLoading(false);
      setRefreshing(false);
      void cacheHomeFeed(global, focus).catch(() => undefined);

      // The canonical PC feed paints first. Category supplements fill gaps only
      // after the first usable homepage is already visible.
      const supplementCategories = homepageSupplementGaps(global);
      const supplements = await Promise.all(supplementCategories.map((category) => fetchArticles({ category, limit: 12 }).catch(() => [])));
      if (sequence !== loadSequence.current) return;
      const seen = new Set<string>();
      const merged = sortNewestFirst([...global, ...supplements.flat()]).filter((item) => {
        const key = String(item.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setArticles(merged);
      void cacheHomeFeed(merged, focus).catch(() => undefined);
    } catch {
      if (sequence !== loadSequence.current) return;
      setError(restored || articles.length > 0 ? 'offline' : 'loadFailed');
    } finally {
      clearTimeout(slowTimer);
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
        setSlowLoading(false);
      }
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
  const imagePrefetchQueue = useMemo(() => [
    ...importantCarousel.slice(1, 3).map((item) => item.cover_image),
    ...categoryGroups.map((section) => section.items[0]?.cover_image),
  ], [categoryGroups, importantCarousel]);

  useEffect(() => {
    if (!imagePrefetchQueue.some(Boolean)) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void prefetchNewsImages(imagePrefetchQueue, 6);
    });
    return () => task.cancel();
  }, [imagePrefetchQueue]);

  const topicLatest = useMemo(() => ({
    trump: articles.find((item) => item.title.includes('特朗普')),
    ice: articles.find((item) => /ICE|移民执法|驱逐/i.test(`${item.category_name || ''} ${item.title}`)),
    election: articles.find((item) => item.title.includes('中期选举') || item.title.includes('选举')),
    finance: articles.find((item) => /财经|股市|美股|基金|ETF/i.test(item.title)),
  }), [articles]);
  const weatherInfo = weatherLabel(weather.code, weather.isDay);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(localeDateTag(locale), { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' }).format(new Date()), [locale]);

  const openArticle = (item: NewsArticle) => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } });
  const openCategory = (category: string) => router.push({ pathname: '/category/[name]', params: { name: category } });
  const openTopic = (url: string) => { void Linking.openURL(url); };
  const openPortal = (section: (typeof portalSections)[number]) => {
    if ('url' in section) void Linking.openURL(section.url);
    else router.push(section.route as '/immigration' | '/legal' | '/jobs' | '/community');
  };

  const retryHome = () => {
    if (articles.length > 0) setRefreshing(true);
    void load();
    void loadWeather();
  };

  useForegroundRetry(Boolean(error), retryHome);

  if (loading) return (
    <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={slowLoading ? t('home.slowLoading') : t('home.loading')}>
      <ActivityIndicator size="large" color="#c8211e" />
      <Text style={styles.muted}>{slowLoading ? t('home.slowLoading') : t('home.loading')}</Text>
      {slowLoading ? (
        <Pressable testID="home-initial-retry" accessibilityRole="button" accessibilityLabel={t('home.reloadA11y')} style={styles.retryButton} onPress={retryHome}>
          <Text style={styles.retryButtonText}>{t('home.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

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
          <View style={styles.utilityCell}><Text style={styles.utilityIcon}>📍</Text><Text style={styles.utilityText}>{t('home.locationNewYork')}</Text></View>
          <Text style={styles.utilityDate}>{dateLabel}</Text>
          <View style={styles.utilityWeather}><Text>{weatherInfo.icon}</Text><Text style={styles.utilityText}>{weather.temperature == null ? '--°C' : `${weather.temperature}°C`} {t(weatherInfo.textKey)}</Text></View>
        </View>

        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brand}>{t('home.brand')}</Text>
            <Text style={styles.brandEn}>TANG REN DAILY</Text>
          </View>
          <Pressable testID="home-search-button" accessibilityLabel={t('home.search')} style={styles.searchButton} onPress={() => router.push('/search')}>
            <Text style={styles.searchIcon}>⌕</Text>
          </Pressable>
        </View>
        <Text style={styles.slogan}>{t('home.slogan')}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navRow}>
          {HOME_NAV_ITEMS.map((item) => (
            <Pressable
              key={item.category}
              style={styles.navItem}
              onPress={() => {
                if ('route' in item) router.push(item.route);
                else openCategory(item.category);
              }}
            >
              <Text style={styles.navText}>{t(item.labelKey)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {activeHot ? (
          <Pressable style={styles.breakingRow} onPress={() => openArticle(activeHot)}>
            <View style={styles.liveDot} />
            <Text style={styles.breakingLabel}>{t('home.hot')}</Text>
            <Text style={styles.breakingTitle} numberOfLines={1}>{activeHot.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}

        {slowLoading || error ? (
          <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.networkStatus}>
            <Text style={error ? styles.error : styles.networkHint}>{error ? t(error === 'offline' ? 'home.offline' : 'home.loadFailed') : t('home.slowRefresh')}</Text>
            <Pressable
              testID="home-network-retry"
              accessibilityRole="button"
              accessibilityLabel={t('home.reloadA11y')}
              accessibilityState={{ disabled: refreshing }}
              disabled={refreshing}
              style={[styles.retryButton, refreshing && styles.retryButtonDisabled]}
              onPress={retryHome}
            >
              <Text style={styles.retryButtonText}>{refreshing ? t('home.retrying') : t('home.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

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
                    <Text style={styles.heroCategory}>{t('home.importantNews')}</Text>
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
            <Text style={styles.sectionTitle}>{t('home.ranking24h')}</Text>
            <Pressable onPress={() => openCategory('热门头条')}><Text style={styles.more}>{t('home.more')} ›</Text></Pressable>
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
            <Text style={styles.sectionTitle}>{t('home.topicsHeading')}</Text>
            <Text style={styles.more}>{t('home.syncedWithWeb')}</Text>
          </View>
          {topicCards.map((topic) => {
            const latest = topicLatest[topic.key];
            return (
              <Pressable key={topic.key} accessibilityRole="link" accessibilityLabel={t('home.openTopicA11y', { title: t(topic.titleKey) })} style={styles.focusCard} onPress={() => openTopic(topic.url)}>
                <NewsImage uri={topic.image} style={styles.focusImage} testID={`home-topic-image-${topic.key}`} />
                <View style={styles.focusBody}>
                  <Text style={styles.focusTitle}>{t(topic.titleKey)}</Text>
                  <Text style={styles.focusSub}>{t(topic.subtitleKey)}</Text>
                  <View style={styles.focusStatusRow}><View style={styles.focusStatusDot} /><Text style={styles.focusStatus}>{t(topic.statusKey)}</Text></View>
                  <Text style={styles.focusLatest} numberOfLines={1}>{latest?.title || t('home.topicLoading')}</Text>
                </View>
                <Text style={styles.focusArrow}>›</Text>
              </Pressable>
            );
          })}
        </View>

        {categoryGroups.map(({ key, titleKey, category, items }) => {
          if (!items.length) return null;
          const first = items[0];
          const rest = items.slice(1);
          return (
            <View key={key} testID={`home-news-${key}`} style={styles.sectionCard}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t(titleKey)}</Text>
                <Pressable onPress={() => openCategory(category)}><Text style={styles.more}>{t('home.more')} ›</Text></Pressable>
              </View>
              <Pressable style={styles.categoryLead} onPress={() => openArticle(first)}>
                <NewsImage uri={first.cover_image} style={styles.categoryLeadImage} testID={`home-category-image-${key}`} />
                <Text style={styles.categoryLeadTitle} numberOfLines={3}>{first.title}</Text>
              </Pressable>
              {rest.map((item) => (
                <Pressable key={String(item.id)} style={styles.textNewsRow} onPress={() => openArticle(item)}>
                  <View style={styles.newsDot} />
                  <Text style={styles.textNewsTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.textNewsDate}>{articleDate(item, localeDateTag(locale))}</Text>
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
                  <View style={styles.portalTitleWrap}><View style={styles.portalAccent} /><Text style={styles.portalTitle}>{t(section.titleKey)}</Text></View>
                  <Pressable accessibilityRole="link" accessibilityLabel={t('home.openPortalA11y', { title: t(section.titleKey) })} onPress={() => openPortal(section)}><Text style={styles.portalAction}>{t(section.actionKey)}</Text></Pressable>
                </View>
                <Pressable accessibilityRole="link" accessibilityLabel={t('home.openPortalA11y', { title: t(section.titleKey) })} style={styles.portalBanner} onPress={() => openPortal(section)}><Text style={styles.portalBannerText}>{t(section.bannerKey)}</Text></Pressable>
                <View style={styles.portalGrid}>
                  {section.itemKeys.map((itemKey, index) => (
                    <Pressable key={itemKey} accessibilityRole="link" accessibilityLabel={t('home.openPortalItemA11y', { item: t(itemKey) })} style={[styles.portalItem, section.itemKeys.length % 2 === 1 && index === section.itemKeys.length - 1 && styles.portalItemWide]} onPress={() => openPortal(section)}>
                      <Text style={styles.portalItemText}>{t(itemKey)}</Text><Text style={styles.portalArrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable accessibilityRole="link" accessibilityLabel={t('home.openPortalA11y', { title: t(section.titleKey) })} style={styles.portalMore} onPress={() => openPortal(section)}><Text style={styles.portalMoreText}>{t(section.actionKey)}</Text></Pressable>
              </View>
            ))}

            <View testID="home-reader-services" style={styles.readerServicesCard}>
              {readerServices.map((service) => (
                <Pressable key={service.key} accessibilityRole="link" accessibilityLabel={t('home.openReaderServiceA11y', { title: t(service.titleKey) })} style={styles.readerService} onPress={() => void Linking.openURL(service.url)}>
                  <View style={styles.readerServiceCopy}><Text style={styles.readerServiceTitle}>{t(service.titleKey)}</Text><Text style={styles.readerServiceSub}>{t(service.subtitleKey)}</Text></View>
                  <Text style={styles.readerServiceAction}>{t(service.actionKey)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.footerBlock}>
              <Text style={styles.footerBrand}>{t('home.footerBrand')}</Text>
              <Text style={styles.footerText}>{t('home.footerSlogan')}</Text>
              <Text style={styles.footerText}>{t('home.footerServices')}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      {showStickyBrand ? (
        <View style={[styles.stickyHeader, { paddingTop: insets.top, height: insets.top + 46 }]}> 
          <Text style={styles.stickyBrand}>{t('home.brand')}</Text>
          <Pressable testID="home-search-sticky" accessibilityLabel={t('home.search')} onPress={() => router.push('/search')} style={styles.stickySearch}><Text style={styles.stickySearchText}>{t('home.search')}</Text></Pressable>
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
  networkStatus: { backgroundColor: '#fff6d8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10, alignItems: 'flex-start' },
  error: { color: '#b42318' },
  networkHint: { color: '#875b00' },
  retryButton: { minHeight: 40, borderRadius: 8, backgroundColor: '#c8211e', paddingHorizontal: 16, marginTop: 10, alignItems: 'center', justifyContent: 'center' },
  retryButtonDisabled: { opacity: 0.58 },
  retryButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
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

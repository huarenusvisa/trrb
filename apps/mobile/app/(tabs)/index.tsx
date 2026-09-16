import { ReaderServices } from '../../src/components/ReaderServices';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, InteractionManager, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchHomepageBundle, fetchHomepageFocus, NewsArticle } from '../../src/api/trrb';
import { globalHomepageEligible, importantHomepageEligible, homepageSectionMatches } from '../../src/news/home-editorial-policy';
import { NewsImage, prefetchNewsImages } from '../../src/components/NewsImage';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, MessageKey, SupportedLocale } from '../../src/i18n/i18n-core';
import { cacheHomeFeed, readCachedHomeFeedEnvelope } from '../../src/storage/newsFeedCache';
import { isNewsFeedCacheStale } from '../../src/storage/news-feed-cache-core';

const HOME_NAV_ITEMS = [
  { category: '重要新闻', labelKey: 'home.navImportant' },
  { category: '热门头条', labelKey: 'home.navHot' },
  { category: '美国时政', labelKey: 'home.navUsPolitics' },
  { category: '中国政治', labelKey: 'home.navChinaPolitics' },
  { category: '移民法官通过率', labelKey: 'home.portalJudgesTitle', route: '/(tabs)/legal' },
  { category: '移民美国', labelKey: 'home.portalImmigrationTitle', route: '/immigration' },
  { category: '移民社区', labelKey: 'home.portalCommunityTitle', route: '/community' },
  { category: '招聘求职', labelKey: 'home.navJobs', route: '/(tabs)/immigration' },
  { category: '美国执法与警情', labelKey: 'home.navEnforcement' },
] as const satisfies ReadonlyArray<{ category: string; labelKey: MessageKey; route?: '/(tabs)/legal' | '/(tabs)/immigration' | '/immigration' | '/community'; url?: string }>;
const ONBOARDING_LANGUAGES: { locale: SupportedLocale; label: string }[] = [
  { locale: 'zh-CN', label: '简体' },
  { locale: 'zh-TW', label: '繁體' },
  { locale: 'en', label: 'EN' },
];
const rankCategories = new Set(['热门头条', '中国热门头条', '美国时政', '美国警情', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报']);

const newsSections = [
  { key: 'china-hot', titleKey: 'home.sectionChinaHot', category: '热门头条', aliases: ['热门头条', '中国热门头条'] },
  { key: 'us-politics', titleKey: 'home.sectionUsPolitics', category: '美国时政', aliases: ['美国时政'] },
  { key: 'us-enforcement', titleKey: 'home.navEnforcement', category: '美国执法与警情', aliases: ['美国警情', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报'] },
  { key: 'china-politics', titleKey: 'home.navChinaPolitics', category: '中国政治', aliases: ['中国政治'] },
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
    key: 'xi',
    titleKey: 'home.topicXiTitle',
    subtitleKey: 'home.topicXiSubtitle',
    statusKey: 'home.topicAutoUpdate',
    image: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Xi_Jinping_March_2017.jpg',
    url: 'https://trrb.net/topic/xi-jinping',
  },
  {
    key: 'election',
    titleKey: 'home.topicElectionTitle',
    subtitleKey: 'home.topicElectionSubtitle',
    statusKey: 'home.topicLiveUpdate',
    image: 'https://trrb.net/assets/topic-focus/election-ballot.jpg?v=30',
    url: 'https://trrb.net/topic/midterm-elections',
  },

] as const satisfies ReadonlyArray<{ key: 'trump' | 'xi' | 'election'; titleKey: MessageKey; subtitleKey: MessageKey; statusKey: MessageKey; image: string; url: string }>;

const portalSections = [
  {
    key: 'judges',
    titleKey: 'home.portalJudgesTitle',
    actionKey: 'home.portalJudgesAction',
    bannerKey: 'home.portalJudgesBanner',
    itemKeys: ['home.portalJudgesSearch', 'home.portalJudgesCourts', 'home.portalJudgesStates', 'home.portalJudgesNationalities'],
    route: '/(tabs)/legal',
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
    route: '/(tabs)/immigration',
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


type WeatherState = { temperature: number | null; code: number | null; isDay: boolean };
type ExternalLinkFailure = { url: string; label: string };

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

export default function HomeScreen() {
  const { languageChoicePending, locale, setPreference, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const carouselRef = useRef<ScrollView>(null);
  const loadSequence = useRef(0);
  const externalActionRef = useRef(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [focusArticles, setFocusArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState<'offline' | 'loadFailed' | ''>('');
  const [cacheSavedAt, setCacheSavedAt] = useState<number | null>(null);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalFailure, setExternalFailure] = useState<ExternalLinkFailure | null>(null);
  const [hotIndex, setHotIndex] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showStickyBrand, setShowStickyBrand] = useState(false);
  const [showDeferredImages, setShowDeferredImages] = useState(false);
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
      const cachedEntry = await readCachedHomeFeedEnvelope().catch(() => null);
      const cached = cachedEntry?.snapshot ?? null;
      if (cached) {
        restored = true;
        cachedFocus = cached.focusArticles || [];
        setArticles(cached.articles);
        setFocusArticles(cachedFocus);
        setCacheSavedAt(cachedEntry?.savedAt ?? null);
        setLoading(false);
      }
    }
    try {
      setError('');
      const [global, focusResult] = await Promise.all([
        fetchHomepageBundle(),
        fetchHomepageFocus().catch(() => null),
      ]);
      if (sequence !== loadSequence.current) return;
      clearTimeout(slowTimer);
      setSlowLoading(false);

      const focus = focusResult ?? cachedFocus;
      setArticles(global);
      setFocusArticles(focus);
      setCacheSavedAt(null);
      setLoading(false);
      setRefreshing(false);
      if (!restoreCache) AccessibilityInfo.announceForAccessibility(t('home.refreshSucceeded'));
      void cacheHomeFeed(global, focus).catch(() => undefined);

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
    const task = InteractionManager.runAfterInteractions(() => {
      setShowDeferredImages(true);
      setShowDeferredServices(true);
    });
    return () => task.cancel();
  }, []);

  const hotHeadlines = useMemo(() => articles.filter((item) => globalHomepageEligible(item)).filter((item) => ['热门头条', '中国热门头条'].includes(String(item.category_name || ''))).slice(0, 12), [articles]);
  const activeHot = hotHeadlines.length ? hotHeadlines[hotIndex % hotHeadlines.length] : null;

  useEffect(() => {
    if (hotHeadlines.length < 2) return;
    const timer = setInterval(() => setHotIndex((index) => (index + 1) % hotHeadlines.length), 4200);
    return () => clearInterval(timer);
  }, [hotHeadlines.length]);

  const importantCarousel = useMemo(() => {
    const seen = new Set<string>();
    return focusArticles.filter((item) => importantHomepageEligible(item)).filter((item) => {
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
      .filter((item) => globalHomepageEligible(item))
      .filter((item) => rankCategories.has(String(item.category_name || '').trim()))
      .filter((item) => {
        const time = Date.parse(item.published_at || item.created_at || '');
        return Number.isFinite(time) && time >= cutoff && time <= Date.now();
      })
      .slice(0, 8);
  }, [articles]);
  const categoryGroups = useMemo(() => newsSections.map((section) => ({
    ...section,
    items: articles
      .filter((item) => homepageSectionMatches(item, section.key, section.aliases))
      .slice(0, 6),
  })), [articles]);
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
    xi: articles.find((item) => item.editorial_topics?.includes('xi')), 
    election: articles.find((item) => item.title.includes('中期选举') || item.title.includes('选举')),
  }), [articles]);
  const titleFor = (article: NewsArticle) => article.title;
  const weatherInfo = weatherLabel(weather.code, weather.isDay);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat(localeDateTag(locale), { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' }).format(new Date()), [locale]);

  const openArticle = (item: NewsArticle) => router.push({ pathname: '/article/[id]', params: { id: String(item.id) } });
  const openCategory = (category: string) => router.push({ pathname: '/category/[name]', params: { name: category } });
  const openExternal = async (url: string, label: string) => {
    if (externalActionRef.current) return;
    externalActionRef.current = true;
    setExternalBusy(true);
    setExternalFailure(null);
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      setExternalFailure({ url, label });
      AccessibilityInfo.announceForAccessibility(t('home.externalLinkFailed', { title: label }));
    } finally {
      externalActionRef.current = false;
      setExternalBusy(false);
    }
  };
  const openTopic = (url: string, label: string) => { void openExternal(url, label); };
  const openPortal = (section: (typeof portalSections)[number]) => {
    if (section.key === 'jobs') router.navigate('/(tabs)/immigration');
    else if (section.key === 'judges') router.navigate('/(tabs)/legal');
    else router.push(section.route as '/immigration' | '/legal' | '/jobs' | '/community');
  };

  const retryHome = () => {
    if (articles.length > 0) setRefreshing(true);
    void load();
    void loadWeather();
  };

  // Refresh on every foreground return, even when the previous request succeeded.
  useForegroundRetry(true, retryHome, 750, 60_000);

  const homeCacheIsStale = cacheSavedAt !== null && isNewsFeedCacheStale(cacheSavedAt);
  const homeCacheStatus = cacheSavedAt === null ? '' : t(homeCacheIsStale ? 'home.cachedStale' : 'home.cachedAt', {
    time: new Date(cacheSavedAt).toLocaleString(localeDateTag(locale)),
  });

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
        {languageChoicePending ? <View testID="home-language-picker" accessibilityRole="radiogroup" style={styles.languagePicker}>
          {ONBOARDING_LANGUAGES.map((option) => {
            const selected = option.locale === locale;
            return <Pressable key={option.locale} testID={`home-language-${option.locale}`} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => void setPreference(option.locale)} style={[styles.languageOption, selected && styles.languageOptionActive]}><Text style={[styles.languageOptionText, selected && styles.languageOptionTextActive]}>{option.label}</Text></Pressable>;
          })}
        </View> : null}
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
              testID={item.category === '重要新闻' ? 'home-nav-important' : undefined}
              style={styles.navItem}
              onPress={() => {
                if ('route' in item) router.navigate(item.route);
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
            <Text style={styles.breakingTitle} numberOfLines={1}>{titleFor(activeHot)}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ) : null}

        {homeCacheStatus ? (
          <View
            testID="home-cache-status"
            accessibilityLiveRegion="polite"
            style={[styles.cacheStatus, homeCacheIsStale && styles.cacheStatusStale]}
          >
            <Text style={styles.cacheStatusText}>{homeCacheStatus}</Text>
          </View>
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

        {externalFailure ? (
          <View testID="home-external-link-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.externalStatus}>
            <Text style={styles.error}>{t('home.externalLinkFailed', { title: externalFailure.label })}</Text>
            <Pressable
              testID="home-external-link-retry"
              accessibilityRole="button"
              accessibilityLabel={t('home.retryExternal')}
              accessibilityState={{ disabled: externalBusy }}
              disabled={externalBusy}
              style={[styles.retryButton, externalBusy && styles.retryButtonDisabled]}
              onPress={() => void openExternal(externalFailure.url, externalFailure.label)}
            >
              <Text style={styles.retryButtonText}>{externalBusy ? t('home.retrying') : t('home.retryExternal')}</Text>
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
                  <NewsImage uri={item.cover_image} style={styles.heroImage} testID={`home-important-image-${index}`} priority={index === 0 ? 'high' : 'normal'} />
                  <View style={styles.heroOverlay} />
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroCategory}>{t('home.importantNews')}</Text>
                    <Text style={styles.heroTitle} numberOfLines={3}>{titleFor(item)}</Text>
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
              <Text style={styles.rankTitle} numberOfLines={2}>{titleFor(item)}</Text>
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
              <Pressable key={topic.key} accessibilityRole="link" accessibilityLabel={t('home.openTopicA11y', { title: t(topic.titleKey) })} accessibilityState={{ disabled: externalBusy }} disabled={externalBusy} style={[styles.focusCard, topic.key === 'trump' ? styles.focusTrump : topic.key === 'xi' ? styles.focusXi : styles.focusElection]} onPress={() => openTopic(topic.url, t(topic.titleKey))}>
                <NewsImage uri={showDeferredImages ? topic.image : undefined} style={styles.focusImage} testID={`home-topic-image-${topic.key}`} priority="low" />
                <View style={styles.focusBody}>
                  <Text style={styles.focusTitle}>{t(topic.titleKey)}</Text>
                  <Text style={styles.focusSub}>{t(topic.subtitleKey)}</Text>
                  <View style={styles.focusStatusRow}><View style={styles.focusStatusDot} /><Text style={styles.focusStatus}>{t(topic.statusKey)}</Text></View>
                  <Text style={styles.focusLatest} numberOfLines={1}>{latest ? titleFor(latest) : t('home.topicLoading')}</Text>
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
                <NewsImage uri={showDeferredImages ? first.cover_image : undefined} style={styles.categoryLeadImage} testID={`home-category-image-${key}`} priority="low" />
                <Text style={styles.categoryLeadTitle} numberOfLines={3}>{titleFor(first)}</Text>
              </Pressable>
              {key === 'us-enforcement' ? <Pressable accessibilityRole="link" style={styles.iceMapLink} onPress={() => openTopic('https://trrb.net/ice', t('home.iceMap'))}><Text style={styles.iceMapText}>{t('home.iceMap')} →</Text></Pressable> : null}
              {rest.map((item) => (
                <Pressable key={String(item.id)} style={styles.textNewsRow} onPress={() => openArticle(item)}>
                  <View style={styles.newsDot} />
                  <Text style={styles.textNewsTitle} numberOfLines={2}>{titleFor(item)}</Text>
                  <Text style={styles.textNewsDate}>{articleDate(item, localeDateTag(locale))}</Text>
                </Pressable>
              ))}
            </View>
          );
        })}

        {showDeferredServices ? (
          <>
            {portalSections.map((section) => (
              <View key={section.key} testID={`home-portal-${section.key}`} style={[styles.portalCard, ['judges', 'jobs'].includes(section.key) && styles.judgeCard]}>
                <View style={styles.portalHead}>
                  <View style={styles.portalTitleWrap}><View style={[styles.portalAccent, ['judges', 'jobs'].includes(section.key) && styles.judgeAccent]} /><Text accessibilityRole={['jobs', 'judges'].includes(section.key) ? 'link' : undefined} onPress={['jobs', 'judges'].includes(section.key) ? () => openPortal(section) : undefined} style={styles.portalTitle}>{t(section.titleKey)}</Text></View>
                  <Pressable accessibilityRole="link" accessibilityLabel={t('home.openPortalA11y', { title: t(section.titleKey) })} accessibilityState={{ disabled: externalBusy }} disabled={externalBusy} onPress={() => openPortal(section)}><Text style={[styles.portalAction, ['judges', 'jobs'].includes(section.key) && styles.judgeLink]}>{t(section.actionKey)}</Text></Pressable>
                </View>
                <Pressable accessibilityRole="link" accessibilityLabel={t('home.openPortalA11y', { title: t(section.titleKey) })} accessibilityState={{ disabled: externalBusy }} disabled={externalBusy} style={[styles.portalBanner, ['judges', 'jobs'].includes(section.key) && styles.judgeBanner]} onPress={() => openPortal(section)}><Text style={[styles.portalBannerText, ['judges', 'jobs'].includes(section.key) && styles.judgeBannerText]}>{t(section.bannerKey)}</Text></Pressable>
                <View style={styles.portalGrid}>
                  {section.itemKeys.map((itemKey, index) => (
                    <Pressable key={itemKey} accessibilityRole="link" accessibilityLabel={t('home.openPortalItemA11y', { item: t(itemKey) })} accessibilityState={{ disabled: externalBusy }} disabled={externalBusy} style={[styles.portalItem, ['judges', 'jobs'].includes(section.key) && styles.judgeItem, section.itemKeys.length % 2 === 1 && index === section.itemKeys.length - 1 && styles.portalItemWide]} onPress={() => openPortal(section)}>
                      <Text style={styles.portalItemText}>{t(itemKey)}</Text><Text style={[styles.portalArrow, ['judges', 'jobs'].includes(section.key) && styles.judgeLink]}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            <ReaderServices />

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
  languagePicker: { alignSelf: 'flex-end', flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 999, backgroundColor: '#fff', marginBottom: 12 },
  languageOption: { minWidth: 52, minHeight: 40, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  languageOptionActive: { backgroundColor: '#c8211e' },
  languageOptionText: { color: '#667085', fontSize: 13, fontWeight: '900' },
  languageOptionTextActive: { color: '#fff' },
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
  cacheStatus: { backgroundColor: '#eef4ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10 },
  externalStatus: { backgroundColor: '#fff1f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 10, alignItems: 'flex-start' },
  cacheStatusStale: { backgroundColor: '#fffaeb' },
  cacheStatusText: { color: '#344054', lineHeight: 20 },
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
  focusCard: { minHeight: 92, borderRadius: 12, paddingHorizontal: 9, marginBottom: 8, flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eaecf0' },
  focusTrump: { backgroundColor: '#fff0f2', borderColor: '#ffd5dc' },
  focusXi: { backgroundColor: '#eef6ff', borderColor: '#c8deff' },
  focusElection: { backgroundColor: '#effcf7', borderColor: '#bde9d8' },
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
  iceMapLink: { minHeight: 44, justifyContent: 'center', backgroundColor: '#eef5ff', borderRadius: 7, paddingHorizontal: 10, marginBottom: 6 },
  iceMapText: { color: '#19538e', fontSize: 13, fontWeight: '700' },
  portalCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e4e7ec' },
  portalHead: { minHeight: 31, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  portalTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  portalAccent: { width: 3, height: 23, backgroundColor: '#d71920', marginRight: 10 },
  portalTitle: { color: '#101828', fontSize: 17, fontWeight: '900' },
  portalAction: { color: '#667085', fontSize: 12, fontWeight: '800' },
  portalBanner: { minHeight: 48, borderRadius: 9, backgroundColor: '#ca0000', paddingHorizontal: 13, justifyContent: 'center', marginBottom: 10 },
  portalBannerText: { color: '#fff', fontSize: 13, lineHeight: 19, fontWeight: '900' },
  judgeCard: { borderColor: '#d8e8de' },
  judgeAccent: { backgroundColor: '#14804a' },
  judgeLink: { color: '#14804a' },
  judgeItem: { borderColor: '#d8e8de', backgroundColor: '#fff' },
  judgeBanner: { backgroundColor: '#edf9f1', borderWidth: 1, borderColor: '#d8e8de' },
  judgeBannerText: { color: '#0b6639' },
  portalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  portalItem: { width: '48.5%', minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#e4e7ec', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

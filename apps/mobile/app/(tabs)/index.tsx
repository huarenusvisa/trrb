import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchArticles, NewsArticle, sortNewestFirst } from '../../src/api/trrb';

const categories = ['重要新闻', '热门头条', '美国时政', '美国警情', '中国官场', '庇护百科'];

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
      // Weather is secondary to news. Keep the compact fallback instead of blocking home.
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

  const lead = useMemo(() => articles.find((item) => item.category_name !== '热门头条' && item.cover_image) || articles.find((item) => item.cover_image) || articles[0], [articles]);
  const list = lead ? articles.filter((item) => String(item.id) !== String(lead.id)) : articles;
  const weatherInfo = weatherLabel(weather.code, weather.isDay);
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' }).format(new Date()), []);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#c8211e" /><Text style={styles.muted}>正在读取唐人日报最新内容…</Text></View>;

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); void loadWeather(); }} />}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const next = nativeEvent.contentOffset.y > 86;
          if (next !== showStickyBrand) setShowStickyBrand(next);
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.weatherRow}>
              <View style={styles.weatherCellLeft}><Text style={styles.pin}>📍</Text><Text style={styles.city}>New York City</Text></View>
              <Text style={styles.dateTop}>{dateLabel}</Text>
              <View style={styles.weatherCellRight}><Text style={styles.weatherIcon}>{weatherInfo.icon}</Text><Text style={styles.weatherText}>{weather.temperature == null ? '--°C' : `${weather.temperature}°C`} {weatherInfo.text}</Text></View>
              <Pressable accessibilityLabel="搜索" style={styles.iconSearch} onPress={() => router.push('/search')}><Text style={styles.iconSearchText}>⌕</Text></Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((category) => <Pressable key={category} style={styles.chip} onPress={() => router.push({ pathname: '/category/[name]', params: { name: category } })}><Text style={styles.chipText}>{category}</Text></Pressable>)}
            </ScrollView>

            {activeHot ? <Pressable style={styles.hotTicker} onPress={() => router.push({ pathname: '/article/[id]', params: { id: String(activeHot.id) } })}>
              <Text style={styles.hotLabel}>热门头条</Text>
              <Text style={styles.hotTitle} numberOfLines={1}>{activeHot.title}</Text>
              <Text style={styles.hotArrow}>›</Text>
            </Pressable> : null}

            <Pressable style={styles.topicBanner} onPress={() => router.push('/people')}>
              <Text style={styles.topicLabel}>专题</Text>
              <Text style={styles.topicTitle}>美国华人人物志</Text>
              <Text style={styles.topicSub}>人物 · 生平 · 在美经历</Text>
              <Text style={styles.topicArrow}>›</Text>
            </Pressable>

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

      {showStickyBrand ? <View style={[styles.stickyHeader, { paddingTop: insets.top, height: insets.top + 46 }]}>
        <Text style={styles.stickyBrand}>唐人日报</Text>
        <Pressable accessibilityLabel="搜索" onPress={() => router.push('/search')} style={styles.stickySearch}><Text style={styles.stickySearchText}>搜索</Text></Pressable>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#f5f6f8'},page:{flex:1,backgroundColor:'#f5f6f8'},content:{paddingHorizontal:16,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center',gap:12},muted:{color:'#667085'},
  weatherRow:{height:48,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#e4e7ec',marginBottom:10,gap:8},weatherCellLeft:{flexDirection:'row',alignItems:'center',minWidth:118,flex:1.2},pin:{fontSize:15,marginRight:5},city:{fontSize:15,fontWeight:'700',color:'#101828'},dateTop:{fontSize:14,color:'#667085',fontWeight:'600',flex:0.95,textAlign:'center'},weatherCellRight:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',minWidth:90,flex:1},weatherIcon:{fontSize:18,marginRight:4},weatherText:{fontSize:14,color:'#101828',fontWeight:'700'},iconSearch:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},iconSearchText:{fontSize:23,color:'#101828',fontWeight:'700'},
  categoryRow:{gap:8,paddingBottom:10},chip:{backgroundColor:'#fff',borderRadius:999,paddingHorizontal:14,paddingVertical:9},chipText:{color:'#344054',fontWeight:'800'},
  hotTicker:{backgroundColor:'#fff',borderRadius:12,minHeight:46,paddingHorizontal:12,marginBottom:10,flexDirection:'row',alignItems:'center'},hotLabel:{color:'#c8211e',fontWeight:'900',fontSize:13,marginRight:10},hotTitle:{flex:1,color:'#101828',fontWeight:'800',fontSize:15},hotArrow:{fontSize:24,color:'#98a2b3',marginLeft:8},
  topicBanner:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:14,paddingVertical:12,marginBottom:14,flexDirection:'row',alignItems:'center'},topicLabel:{color:'#c8211e',fontWeight:'900',fontSize:13,marginRight:10},topicTitle:{color:'#101828',fontWeight:'900',fontSize:16,marginRight:8},topicSub:{flex:1,color:'#98a2b3',fontSize:12},topicArrow:{fontSize:26,color:'#98a2b3'},
  stickyHeader:{position:'absolute',left:0,right:0,top:0,zIndex:30,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#eaecf0',paddingHorizontal:16,flexDirection:'row',alignItems:'flex-end',paddingBottom:8,justifyContent:'space-between'},stickyBrand:{color:'#c8211e',fontSize:21,fontWeight:'900'},stickySearch:{paddingHorizontal:10,paddingVertical:4},stickySearchText:{color:'#101828',fontWeight:'800'},
  error:{color:'#b42318',marginBottom:12},hero:{backgroundColor:'#fff',borderRadius:18,overflow:'hidden',marginBottom:20},heroImage:{width:'100%',height:195,backgroundColor:'#e4e7ec'},heroBody:{padding:15},heroTitle:{fontSize:22,lineHeight:29,fontWeight:'900',color:'#101828',marginTop:6},sectionTitle:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:12},card:{flexDirection:'row',backgroundColor:'#fff',borderRadius:14,marginBottom:12,overflow:'hidden',minHeight:112},thumb:{width:120,minHeight:112,backgroundColor:'#e4e7ec'},thumbPlaceholder:{width:120,backgroundColor:'#eaecf0'},cardBody:{flex:1,padding:12},category:{color:'#c8211e',fontSize:13,fontWeight:'800'},title:{marginTop:5,color:'#101828',fontSize:17,lineHeight:23,fontWeight:'800'},date:{marginTop:7,color:'#98a2b3',fontSize:12}
});

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { PaginatedNewsList } from '../src/components/PaginatedNewsList';
import { fetchTrendingSearches, TrendingSearch } from '../src/api/trrb';
import { addSearchHistory, clearSearchHistory, getSearchHistory } from '../src/storage/searchHistory';
import { useI18n } from '../src/i18n/I18nProvider';
import { newsCategoryName } from '../src/i18n/i18n-core';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../src/utils/async-state-core';

export default function SearchScreen() {
  const { locale, t } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [trending, setTrending] = useState<TrendingSearch[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);

  const loadTrending = useCallback(async () => {
    setTrendingLoading(true);
    setTrendingError(false);
    try {
      const value = await withUiTimeout(fetchTrendingSearches(), t('news.loadFailed'));
      setTrending(value.items);
    } catch {
      setTrendingError(true);
    } finally {
      setTrendingLoading(false);
    }
  }, [t]);

  useEffect(() => {
    getSearchHistory().then(setHistory).catch(() => setHistory([]));
    void loadTrending();
  }, [loadTrending]);
  useForegroundRetry(trendingError, () => void loadTrending());

  async function submit(value = input, selectedCategory = category) {
    const next = value.trim();
    setQuery(next);
    setCategory(selectedCategory);
    if (next) {
      const updated = await addSearchHistory(next).catch(() => history);
      setHistory(updated);
    }
  }

  async function clearHistory() {
    await clearSearchHistory();
    setHistory([]);
  }

  const active = Boolean(query || category);

  return (
    <View style={styles.page} testID="search-screen">
      <View style={[styles.searchBar, compact && styles.compactSearchBar]}>
        <TextInput
          testID="search-input"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => submit()}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#98a2b3"
          returnKeyType="search"
          accessibilityLabel={t('search.placeholder')}
          style={styles.input}
        />
        <Pressable testID="search-submit" accessibilityRole="button" accessibilityLabel={t('search.submit')} style={[styles.button, compact && styles.compactButton]} onPress={() => submit()}><Text style={styles.buttonText}>{t('search.submit')}</Text></Pressable>
      </View>

      {active ? (
        <View style={styles.results} testID="search-results">
          <View style={styles.filterRow}>
            {category ? <Pressable accessibilityRole="button" style={styles.filterChip} onPress={() => setCategory('')}><Text style={styles.filterText}>{t('search.filter', { category: newsCategoryName(locale, category) })}</Text></Pressable> : null}
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => { setQuery(''); setCategory(''); setInput(''); }}><Text style={styles.cancel}>{t('search.backHome')}</Text></Pressable>
          </View>
          <PaginatedNewsList
            title={query ? t('search.queryTitle', { query }) : t('search.categoryTitle', { category: newsCategoryName(locale, category) })}
            q={query || undefined}
            category={category || undefined}
            emptyText={t('search.empty')}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.discovery, compact && styles.compactDiscovery]} testID="search-discovery">
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('search.trending')}</Text><Text style={styles.audit}>{t('search.trendingSource')}</Text></View>
          <View style={styles.chips}>
            {trending.map((item) => (
              <Pressable key={item.term} accessibilityRole="button" accessibilityLabel={item.term} style={styles.hotChip} onPress={() => { setInput(''); submit('', item.category || item.term); }}>
                <Text style={styles.hotText}>{item.term}</Text>
                <Text style={styles.score}>{item.score}</Text>
              </Pressable>
            ))}
            {trendingLoading ? <View accessibilityLiveRegion="polite" style={styles.inlineState}><ActivityIndicator color="#c8211e" /><Text style={styles.hint}>{t('news.loading')}</Text></View> : null}
            {trendingError ? <View accessibilityRole="alert" style={styles.inlineError}><Text style={styles.errorText}>{t('news.loadFailed')}</Text><Pressable testID="search-trending-retry" accessibilityRole="button" accessibilityLabel={t('news.retry')} style={styles.retryButton} onPress={() => void loadTrending()}><Text style={styles.retryText}>{t('news.retry')}</Text></Pressable></View> : null}
            {!trendingLoading && !trendingError && !trending.length ? <Text style={styles.hint}>{t('search.noTrending')}</Text> : null}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('search.history')}</Text>
            {history.length ? <Pressable accessibilityRole="button" style={styles.clearButton} onPress={clearHistory}><Text style={styles.clear}>{t('search.clear')}</Text></Pressable> : null}
          </View>
          <View style={styles.chips}>
            {history.map((term) => (
              <Pressable key={term} accessibilityRole="button" accessibilityLabel={term} style={styles.historyChip} onPress={() => { setInput(term); submit(term, ''); }}>
                <Text style={styles.historyText}>{term}</Text>
              </Pressable>
            ))}
            {!history.length ? <Text style={styles.hint}>{t('search.noHistory')}</Text> : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},searchBar:{paddingTop:54,paddingHorizontal:16,paddingBottom:10,flexDirection:'row',gap:10,backgroundColor:'#fff'},compactSearchBar:{flexWrap:'wrap',paddingHorizontal:10},input:{flex:1,minWidth:190,minHeight:46,borderRadius:12,backgroundColor:'#f2f4f7',paddingHorizontal:14,paddingVertical:10,fontSize:16,color:'#101828'},button:{minHeight:46,paddingHorizontal:18,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center'},compactButton:{flexGrow:1},buttonText:{color:'#fff',fontWeight:'800',textAlign:'center'},results:{flex:1},filterRow:{paddingHorizontal:16,paddingVertical:10,backgroundColor:'#fff',flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:8},filterChip:{maxWidth:'100%',minHeight:44,backgroundColor:'#fff1f0',paddingHorizontal:10,paddingVertical:9,borderRadius:14,justifyContent:'center'},filterText:{flexShrink:1,color:'#c8211e',fontWeight:'700'},backButton:{minHeight:44,paddingHorizontal:8,justifyContent:'center'},cancel:{color:'#667085',fontWeight:'700'},discovery:{padding:18,paddingBottom:40},compactDiscovery:{paddingHorizontal:10},sectionHeader:{marginTop:12,marginBottom:12,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8},sectionTitle:{fontSize:22,lineHeight:30,fontWeight:'900',color:'#101828'},audit:{flexShrink:1,fontSize:12,lineHeight:18,color:'#667085'},chips:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:20},hotChip:{maxWidth:'100%',minHeight:44,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderRadius:14,paddingHorizontal:14,paddingVertical:10},hotText:{flexShrink:1,fontSize:15,lineHeight:21,fontWeight:'800',color:'#101828'},score:{fontSize:12,color:'#c8211e',fontWeight:'800'},historyChip:{maxWidth:'100%',minHeight:44,backgroundColor:'#fff',borderRadius:14,paddingHorizontal:14,paddingVertical:10,justifyContent:'center'},historyText:{flexShrink:1,fontSize:15,lineHeight:21,color:'#344054'},clearButton:{minHeight:44,paddingHorizontal:8,justifyContent:'center'},clear:{color:'#c8211e',fontWeight:'800'},hint:{color:'#667085',fontSize:15,lineHeight:22},inlineState:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8},inlineError:{width:'100%',backgroundColor:'#fef3f2',borderRadius:12,padding:12},errorText:{color:'#b42318',lineHeight:21},retryButton:{alignSelf:'flex-start',minHeight:44,marginTop:8,borderRadius:9,backgroundColor:'#c8211e',paddingHorizontal:16,justifyContent:'center'},retryText:{color:'#fff',fontWeight:'800'}
});

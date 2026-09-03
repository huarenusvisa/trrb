import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PaginatedNewsList } from '../src/components/PaginatedNewsList';
import { fetchTrendingSearches, TrendingSearch } from '../src/api/trrb';
import { addSearchHistory, clearSearchHistory, getSearchHistory } from '../src/storage/searchHistory';
import { useI18n } from '../src/i18n/I18nProvider';
import { newsCategoryName } from '../src/i18n/i18n-core';

export default function SearchScreen() {
  const { locale, t } = useI18n();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [trending, setTrending] = useState<TrendingSearch[]>([]);

  useEffect(() => {
    getSearchHistory().then(setHistory).catch(() => setHistory([]));
    fetchTrendingSearches().then((value) => setTrending(value.items)).catch(() => setTrending([]));
  }, []);

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
      <View style={styles.searchBar}>
        <TextInput
          testID="search-input"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => submit()}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#98a2b3"
          returnKeyType="search"
          style={styles.input}
        />
        <Pressable testID="search-submit" style={styles.button} onPress={() => submit()}><Text style={styles.buttonText}>{t('search.submit')}</Text></Pressable>
      </View>

      {active ? (
        <View style={styles.results} testID="search-results">
          <View style={styles.filterRow}>
            {category ? <Pressable style={styles.filterChip} onPress={() => setCategory('')}><Text style={styles.filterText}>{t('search.filter', { category: newsCategoryName(locale, category) })}</Text></Pressable> : null}
            <Pressable onPress={() => { setQuery(''); setCategory(''); setInput(''); }}><Text style={styles.cancel}>{t('search.backHome')}</Text></Pressable>
          </View>
          <PaginatedNewsList
            title={query ? t('search.queryTitle', { query }) : t('search.categoryTitle', { category: newsCategoryName(locale, category) })}
            q={query || undefined}
            category={category || undefined}
            emptyText={t('search.empty')}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.discovery} testID="search-discovery">
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('search.trending')}</Text><Text style={styles.audit}>{t('search.trendingSource')}</Text></View>
          <View style={styles.chips}>
            {trending.map((item) => (
              <Pressable key={item.term} style={styles.hotChip} onPress={() => { setInput(''); submit('', item.category || item.term); }}>
                <Text style={styles.hotText}>{item.term}</Text>
                <Text style={styles.score}>{item.score}</Text>
              </Pressable>
            ))}
            {!trending.length ? <Text style={styles.hint}>{t('search.noTrending')}</Text> : null}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('search.history')}</Text>
            {history.length ? <Pressable onPress={clearHistory}><Text style={styles.clear}>{t('search.clear')}</Text></Pressable> : null}
          </View>
          <View style={styles.chips}>
            {history.map((term) => (
              <Pressable key={term} style={styles.historyChip} onPress={() => { setInput(term); submit(term, ''); }}>
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
  page:{flex:1,backgroundColor:'#f5f6f8'},searchBar:{paddingTop:54,paddingHorizontal:16,paddingBottom:10,flexDirection:'row',gap:10,backgroundColor:'#fff'},input:{flex:1,height:46,borderRadius:12,backgroundColor:'#f2f4f7',paddingHorizontal:14,fontSize:16,color:'#101828'},button:{height:46,paddingHorizontal:18,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontWeight:'800'},results:{flex:1},filterRow:{paddingHorizontal:16,paddingVertical:10,backgroundColor:'#fff',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},filterChip:{backgroundColor:'#fff1f0',paddingHorizontal:10,paddingVertical:7,borderRadius:999},filterText:{color:'#c8211e',fontWeight:'700'},cancel:{color:'#667085',fontWeight:'700'},discovery:{padding:18,paddingBottom:40},sectionHeader:{marginTop:12,marginBottom:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},sectionTitle:{fontSize:22,fontWeight:'900',color:'#101828'},audit:{fontSize:12,color:'#98a2b3'},chips:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:20},hotChip:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',borderRadius:999,paddingHorizontal:14,paddingVertical:10},hotText:{fontSize:15,fontWeight:'800',color:'#101828'},score:{fontSize:12,color:'#c8211e',fontWeight:'800'},historyChip:{backgroundColor:'#fff',borderRadius:999,paddingHorizontal:14,paddingVertical:10},historyText:{fontSize:15,color:'#344054'},clear:{color:'#c8211e',fontWeight:'800'},hint:{color:'#667085',fontSize:15}
});

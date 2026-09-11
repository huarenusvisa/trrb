import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Keyboard, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { localeDateTag } from '../src/i18n/i18n-core';
import { withUiTimeout } from '../src/utils/async-state-core';
import { contactLabel, employmentTypeLabel, formatJobSalary } from '../src/jobs/job-presentation';
import { cacheJobs, readCachedJobs } from '../src/storage/jobsCache';
import { createBoundedJobsSnapshot, type CachedJob as Job, type CachedJobContact as Contact } from '../src/storage/jobs-cache-core';

const ENDPOINT = 'https://trrb.net/.netlify/functions/public-jobs';
const PAGE_SIZE = 30;
const MAX_VISIBLE_ITEMS = 120;

function jobsEndpoint(query: string, offset: number) {
  const params = [`limit=${PAGE_SIZE}`, `offset=${Math.max(0, offset)}`];
  if (query) params.push(`q=${encodeURIComponent(query)}`);
  return `${ENDPOINT}?${params.join('&')}`;
}

function formatCacheTime(savedAt: number, locale: 'zh-CN' | 'zh-TW' | 'en') {
  return new Intl.DateTimeFormat(localeDateTag(locale), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt));
}

function contactUrl(contact: Contact): string {
  return contact.type === 'phone' ? `tel:${contact.value}` : contact.type === 'email' ? `mailto:${contact.value}` : contact.value;
}

export default function JobsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { locale, t } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [items, setItems] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const requestVersion = useRef(0);
  const contactInFlight = useRef(false);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [failedContact, setFailedContact] = useState<{ item: Job; action: string } | null>(null);

  const fetchPage = useCallback(async ({ queryText = '', offset = 0, append = false, refresh = false, announceSuccess = false } = {}) => {
    const version = ++requestVersion.current;
    if (append) setLoadingMore(true);
    else if (refresh) setRefreshing(true);
    else setLoading(true);
    append ? setPageError('') : setError('');
    try {
      const response = await withUiTimeout(fetch(jobsEndpoint(queryText, offset), { headers: { Accept: 'application/json' } }), t('jobs.timeout'));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || t('jobs.httpFailed', { status: response.status }));
      if (version !== requestVersion.current) return;
      const page = createBoundedJobsSnapshot(Array.isArray(payload?.items) ? payload.items : [], PAGE_SIZE);
      const combined = append ? createBoundedJobsSnapshot([...items, ...page], MAX_VISIBLE_ITEMS) : page;
      setItems(combined);
      setNextOffset(Number.isInteger(payload?.nextOffset) ? payload.nextOffset : null);
      setCachedAt(null);
      if (!queryText && !append) void cacheJobs(page).catch(() => {});
      if (announceSuccess) AccessibilityInfo.announceForAccessibility(t('jobs.refreshSucceeded'));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('jobs.loadFailed');
      if (version === requestVersion.current) append ? setPageError(message) : setError(message);
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [items, t]);

  useEffect(() => {
    let active = true;
    let restored = false;
    let announceRefresh = false;
    void readCachedJobs().then(({ payload: cached, discardReason }) => {
      if (!active) return;
      if (discardReason === 'expired') {
        announceRefresh = true;
        AccessibilityInfo.announceForAccessibility(t('jobs.cacheExpired'));
      }
      if (!cached?.items.length) return;
      restored = true;
      announceRefresh = true;
      setItems(cached.items);
      setCachedAt(cached.savedAt);
      setLoading(false);
    }).catch(() => null).finally(() => {
      if (active) void fetchPage({ refresh: restored, announceSuccess: announceRefresh });
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
    // The first fetch is intentionally independent from later list mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  useForegroundRetry(Boolean(error), () => void fetchPage({ queryText: activeQuery, refresh: Boolean(items.length), announceSuccess: true }));

  const submitSearch = () => {
    const nextQuery = query.replace(/\s+/g, ' ').trim().slice(0, 80);
    Keyboard.dismiss();
    setActiveQuery(nextQuery);
    setCachedAt(null);
    setItems([]);
    setNextOffset(null);
    void fetchPage({ queryText: nextQuery });
  };

  const clearSearch = () => {
    Keyboard.dismiss();
    setQuery('');
    setActiveQuery('');
    setCachedAt(null);
    setItems([]);
    setNextOffset(null);
    void fetchPage();
  };

  const openJobContact = useCallback(async (item: Job, action: string) => {
    const contact = item.contact;
    if (!contact?.value || contactInFlight.current) return;
    contactInFlight.current = true;
    setActiveContactId(item.id);
    setFailedContact(null);
    try {
      const url = contactUrl(contact);
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Unsupported job contact URL');
      await Linking.openURL(url);
    } catch {
      setFailedContact({ item, action });
      AccessibilityInfo.announceForAccessibility(t('jobs.contactFailed'));
    } finally {
      contactInFlight.current = false;
      setActiveContactId(null);
    }
  }, [t]);

  return <SafeAreaView style={styles.page}>
    {!embedded ? <Stack.Screen options={{ title: t('jobs.screenTitle') }} /> : null}
    <FlatList
      contentContainerStyle={[styles.list, compact && styles.compactList]}
      data={items}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      onRefresh={() => void fetchPage({ queryText: activeQuery, refresh: true, announceSuccess: true })}
      refreshing={refreshing}
      ListHeaderComponent={<>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('jobs.eyebrow')}</Text>
          <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{t('jobs.title')}</Text>
          <Text style={styles.subtitle}>{t('jobs.subtitle')}</Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="jobs-search-input"
              accessibilityLabel={t('jobs.searchA11y')}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
              maxLength={80}
              placeholder={t('jobs.searchPlaceholder')}
              style={styles.searchInput}
            />
            <Pressable testID="jobs-search-submit" accessibilityRole="button" accessibilityLabel={t('jobs.searchA11y')} disabled={loading || refreshing} style={[styles.searchButton, (loading || refreshing) && styles.contactDisabled]} onPress={submitSearch}><Text style={styles.searchButtonText}>{t('jobs.search')}</Text></Pressable>
          </View>
          {activeQuery ? <View style={styles.resultRow}><Text style={styles.resultText}>{t('jobs.searchResultCount', { query: activeQuery, count: items.length })}</Text><Pressable testID="jobs-search-clear" accessibilityRole="button" onPress={clearSearch}><Text style={styles.clearText}>{t('jobs.clearSearch')}</Text></Pressable></View> : items.length ? <Text style={styles.resultText}>{t('jobs.resultCount', { count: items.length })}</Text> : null}
        </View>
        {cachedAt && items.length ? <View testID="jobs-cache-notice" accessibilityLiveRegion="polite" style={styles.cacheNotice}><Text style={styles.cacheNoticeText}>{t('jobs.cachedAt', { time: formatCacheTime(cachedAt, locale) })}</Text></View> : null}
        {error && items.length ? <View testID="jobs-refresh-error" accessibilityRole="alert" style={styles.errorBanner}>
          <Text style={styles.errorTitle}>{t('jobs.refreshFailed')}</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('jobs.retryA11y')} style={styles.retry} onPress={() => void fetchPage({ queryText: activeQuery, refresh: true, announceSuccess: true })}><Text style={styles.retryText}>{t('jobs.retry')}</Text></Pressable>
        </View> : null}
      </>}
      renderItem={({ item }) => {
        const action = contactLabel(item.contact?.type, t);
        const location = [item.city, item.state_code].filter(Boolean).join(' · ');
        return <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.jobTitle}>{item.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.salary}>{formatJobSalary(item, locale, t)}</Text>
            {location ? <Text style={styles.pill}>{location}</Text> : null}
            <Text style={styles.pill}>{employmentTypeLabel(item.employment_type, t)}</Text>
          </View>
          {item.description ? <Text numberOfLines={4} style={styles.description}>{item.description}</Text> : null}
          {item.contact?.value ? <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('jobs.contactA11y', { action, title: item.title })}
            accessibilityState={{ disabled: activeContactId !== null, busy: activeContactId === item.id }}
            disabled={activeContactId !== null}
            style={[styles.contact, activeContactId !== null && styles.contactDisabled]}
            onPress={() => void openJobContact(item, action)}
          >
            <Text style={styles.contactText}>{activeContactId === item.id ? t('jobs.contactOpening', { action }) : action}</Text>
          </Pressable> : <Text style={styles.noContact}>{t('jobs.noPublicContact')}</Text>}
          {failedContact?.item.id === item.id ? <View testID={`job-contact-error-${item.id}`} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.contactError}>
            <Text style={styles.contactErrorText}>{t('jobs.contactFailed')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('jobs.retryContactA11y', { action: failedContact.action, title: item.title })} accessibilityState={{ disabled: activeContactId !== null, busy: activeContactId === item.id }} disabled={activeContactId !== null} style={styles.contactRetry} onPress={() => void openJobContact(failedContact.item, failedContact.action)}><Text style={styles.retryText}>{t('jobs.retryContact')}</Text></Pressable>
          </View> : null}
        </View>;
      }}
      ListFooterComponent={nextOffset !== null || loadingMore || pageError ? <View style={styles.footer}>
        {pageError ? <Text style={styles.pageError}>{t('jobs.pageFailed')}</Text> : null}
        <Pressable testID="jobs-load-more" accessibilityRole="button" disabled={loadingMore} style={[styles.loadMore, loadingMore && styles.contactDisabled]} onPress={() => void fetchPage({ queryText: activeQuery, offset: nextOffset ?? items.length, append: true })}>{loadingMore ? <ActivityIndicator color="#1769d2" /> : <Text style={styles.loadMoreText}>{pageError ? t('jobs.retryPage') : t('jobs.loadMore')}</Text>}</Pressable>
      </View> : null}
      ListEmptyComponent={loading
        ? <View testID="jobs-loading" accessibilityLiveRegion="polite" style={styles.state}><ActivityIndicator color="#1769d2" /><Text style={styles.stateText}>{t('jobs.loading')}</Text></View>
        : error
          ? <View testID="jobs-load-error" accessibilityRole="alert" style={styles.state}><Text style={styles.errorTitle}>{t('jobs.unavailable')}</Text><Text style={styles.errorDetail}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('jobs.retryA11y')} style={styles.retry} onPress={() => void fetchPage({ queryText: activeQuery, announceSuccess: true })}><Text style={styles.retryText}>{t('jobs.retry')}</Text></Pressable></View>
          : <Text testID="jobs-empty" style={styles.empty}>{activeQuery ? t('jobs.emptySearch', { query: activeQuery }) : t('jobs.empty')}</Text>}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f6f9fd'},list:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:12,paddingBottom:28,gap:10},compactList:{paddingHorizontal:8},header:{paddingHorizontal:4,paddingTop:12,paddingBottom:14},eyebrow:{fontSize:12,lineHeight:18,fontWeight:'800',color:'#1769d2',marginBottom:6},title:{fontSize:28,lineHeight:36,fontWeight:'800',color:'#0f172a'},compactTitle:{fontSize:25,lineHeight:33},subtitle:{marginTop:6,color:'#64748b',fontSize:14,lineHeight:21},searchRow:{flexDirection:'row',gap:8,marginTop:14},searchInput:{flex:1,minHeight:48,backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,paddingHorizontal:13,fontSize:16,color:'#0f172a'},searchButton:{minWidth:72,minHeight:48,borderRadius:12,backgroundColor:'#1769d2',alignItems:'center',justifyContent:'center',paddingHorizontal:14},searchButtonText:{color:'#fff',fontWeight:'800'},resultRow:{marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},resultText:{marginTop:10,color:'#64748b',fontSize:13},resultRowText:{color:'#64748b',fontSize:13},clearText:{color:'#1769d2',fontWeight:'800',paddingVertical:8},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe5f1',borderRadius:16,padding:15,shadowColor:'#0f172a',shadowOpacity:.04,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:1},jobTitle:{fontSize:18,fontWeight:'700',color:'#0f172a',marginBottom:9,lineHeight:25},metaRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',gap:6,marginBottom:8},salary:{flexShrink:1,backgroundColor:'#eff6ff',color:'#0f4fa7',fontWeight:'800',paddingHorizontal:8,paddingVertical:5,borderRadius:12,fontSize:12,lineHeight:18},pill:{flexShrink:1,backgroundColor:'#f1f5f9',color:'#475569',paddingHorizontal:8,paddingVertical:5,borderRadius:12,fontSize:12,lineHeight:18},description:{color:'#536174',lineHeight:21,marginBottom:12},contact:{alignSelf:'stretch',minHeight:48,backgroundColor:'#1769d2',borderRadius:10,paddingHorizontal:14,paddingVertical:11,alignItems:'center',justifyContent:'center'},contactText:{color:'#fff',fontWeight:'800',fontSize:15,lineHeight:21,textAlign:'center'},noContact:{color:'#98a2b3',fontSize:12,lineHeight:18},contactDisabled:{opacity:.6},contactError:{marginTop:10,borderRadius:10,backgroundColor:'#fff4f2',borderWidth:1,borderColor:'#fecdca',padding:12,alignItems:'flex-start'},contactErrorText:{color:'#7a271a',lineHeight:20},contactRetry:{minHeight:44,marginTop:4,paddingHorizontal:4,justifyContent:'center'},cacheNotice:{backgroundColor:'#eff6ff',borderWidth:1,borderColor:'#bfdbfe',borderRadius:12,padding:12,marginBottom:10},cacheNoticeText:{color:'#1e4f91',lineHeight:20},errorBanner:{backgroundColor:'#fff4f2',borderWidth:1,borderColor:'#fecdca',borderRadius:12,padding:14,marginBottom:10},state:{minHeight:180,alignItems:'center',justifyContent:'center',padding:24,gap:10},stateText:{color:'#475569',textAlign:'center',lineHeight:21},errorTitle:{color:'#b42318',fontWeight:'800',fontSize:16,lineHeight:23,textAlign:'center'},errorDetail:{color:'#7a271a',marginTop:4,lineHeight:20,textAlign:'center'},retry:{alignSelf:'center',minHeight:44,marginTop:10,backgroundColor:'#1769d2',paddingHorizontal:16,paddingVertical:10,borderRadius:9,justifyContent:'center'},retryText:{color:'#fff',fontWeight:'800',textAlign:'center'},footer:{paddingVertical:12,alignItems:'center'},pageError:{color:'#b42318',marginBottom:8,textAlign:'center'},loadMore:{minWidth:160,minHeight:46,borderRadius:12,borderWidth:1,borderColor:'#1769d2',alignItems:'center',justifyContent:'center',paddingHorizontal:18},loadMoreText:{color:'#1769d2',fontWeight:'800'},empty:{padding:28,textAlign:'center',color:'#64748b',lineHeight:22},
});

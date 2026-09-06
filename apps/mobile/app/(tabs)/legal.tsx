import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { cacheLegalRecords, readCachedLegalRecords } from '../../src/storage/legalCache';
import type { CachedLegalRecord as LegalRecord } from '../../src/storage/legal-cache-core';

const LEGAL_URL = 'https://trrb.net/data/legal/unified-legal-authorities-latest.json';
const REQUEST_TIMEOUT_MS = 12_000;

export default function LegalScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (manual = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (manual) setRefreshing(true);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(LEGAL_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(t('legal.databaseError', { status: response.status }));
      const payload = await response.json();
      const records = Array.isArray(payload?.records) ? payload.records as LegalRecord[] : [];
      if (!mounted.current) return;
      setItems(records);
      setError('');
      void cacheLegalRecords(records);
    } catch (cause) {
      if (!mounted.current || (controller.signal.aborted && activeRequest.current !== controller)) return;
      setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : t('legal.loadFailed'));
    } finally {
      clearTimeout(timer);
      if (mounted.current && activeRequest.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    mounted.current = true;
    void readCachedLegalRecords().then((cached) => {
      if (mounted.current && cached?.length) setItems(cached);
    }).finally(() => { if (mounted.current) void load(); });
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, [load]);

  useForegroundRetry(Boolean(error), () => void load());

  const filtered = useMemo(() => {
    const query = q.trim().toLocaleLowerCase();
    const rows = query ? items.filter((item) => [item.title, item.citation, item.docket, item.issuingBody, item.sourceSystem, item.authorityType].some((value) => String(value || '').toLocaleLowerCase().includes(query))) : items;
    return [...rows].sort((a,b) => String(b.publicationDate || '').localeCompare(String(a.publicationDate || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  }, [items, q]);

  if (loading && !items.length) return <View testID="screen-legal" style={styles.center}><ActivityIndicator color="#c8211e" accessibilityLabel={t('news.loading')} /></View>;
  return <FlatList
    testID="screen-legal"
    style={styles.page}
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#c8211e" />}
    ListHeaderComponent={<View><Text style={styles.h1}>{t('legal.heading')}</Text><Text style={styles.sub}>{t('legal.subtitle')}</Text>{error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.error}>{items.length ? t('news.offline') : error}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('news.retry')} onPress={() => void load(true)} style={styles.retry}><Text style={styles.retryText}>{t('news.retry')}</Text></Pressable></View> : null}<TextInput value={q} onChangeText={setQ} placeholder={t('legal.searchPlaceholder')} placeholderTextColor="#667085" style={styles.search} returnKeyType="search" accessibilityLabel={t('legal.searchPlaceholder')} /><Text accessibilityLiveRegion="polite" style={styles.count}>{t('legal.count', { count: filtered.length })}</Text></View>}
    ListEmptyComponent={<Text style={styles.empty}>{error || t('news.empty')}</Text>}
    data={filtered}
    keyExtractor={(item) => item.id}
    initialNumToRender={16}
    maxToRenderPerBatch={16}
    windowSize={7}
    renderItem={({ item }) => {
      const title = item.title || item.citation || t('legal.untitled');
      return <Pressable accessibilityRole="button" accessibilityLabel={title} style={styles.row} onPress={() => router.push({ pathname: '/legal/[id]', params: { id: item.id } })}><Text style={styles.cat}>{item.issuingBody || item.sourceSystem || t('legal.officialSource')}</Text><Text style={styles.title}>{title}</Text><Text style={styles.date}>{item.publicationDate || ''}{item.citation ? ` · ${item.citation}` : ''}</Text></Pressable>;
    }}
  />;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},
  h1:{fontSize:30,lineHeight:38,fontWeight:'900',color:'#101828',flexShrink:1},sub:{color:'#667085',lineHeight:22,marginTop:6,marginBottom:16},
  errorBox:{backgroundColor:'#fef3f2',borderRadius:14,padding:12,marginBottom:12,alignItems:'flex-start'},error:{color:'#b42318',lineHeight:21},retry:{minHeight:44,justifyContent:'center',paddingHorizontal:4},retryText:{color:'#b42318',fontWeight:'800'},
  search:{minHeight:48,backgroundColor:'#fff',borderRadius:14,paddingHorizontal:15,paddingVertical:12,fontSize:16,color:'#101828'},count:{color:'#667085',fontSize:13,lineHeight:19,marginTop:10,marginBottom:14},
  row:{minHeight:48,backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800',lineHeight:21,flexShrink:1},title:{fontSize:18,lineHeight:27,fontWeight:'800',color:'#101828',marginTop:6,flexShrink:1},date:{fontSize:12,lineHeight:18,color:'#667085',marginTop:8,flexShrink:1},empty:{color:'#667085',lineHeight:22,paddingVertical:28,textAlign:'center'},
});

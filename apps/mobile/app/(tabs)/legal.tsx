import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useI18n } from '../../src/i18n/I18nProvider';

type LegalRecord = { id: string; title?: string; citation?: string; docket?: string; issuingBody?: string; publicationDate?: string; sourceSystem?: string; authorityType?: string };

export default function LegalScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('https://trrb.net/data/legal/unified-legal-authorities-latest.json')
      .then((r) => { if (!r.ok) throw new Error(t('legal.databaseError', { status: r.status })); return r.json(); })
      .then((payload) => setItems(Array.isArray(payload?.records) ? payload.records : []))
      .catch((e) => setError(e instanceof Error ? e.message : t('legal.loadFailed')))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const rows = query ? items.filter((item) => [item.title, item.citation, item.docket, item.issuingBody, item.sourceSystem, item.authorityType].some((value) => String(value || '').toLowerCase().includes(query))) : items;
    return [...rows].sort((a,b) => String(b.publicationDate || '').localeCompare(String(a.publicationDate || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  }, [items, q]);

  if (loading) return <View testID="screen-legal" style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  return <FlatList
    testID="screen-legal"
    style={styles.page}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View><Text style={styles.h1}>{t('legal.heading')}</Text><Text style={styles.sub}>{t('legal.subtitle')}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<TextInput value={q} onChangeText={setQ} placeholder={t('legal.searchPlaceholder')} placeholderTextColor="#98a2b3" style={styles.search} /><Text style={styles.count}>{t('legal.count', { count: filtered.length })}</Text></View>}
    data={filtered}
    keyExtractor={(item) => item.id}
    initialNumToRender={20}
    maxToRenderPerBatch={20}
    windowSize={8}
    renderItem={({ item }) => <Pressable style={styles.row} onPress={() => router.push({ pathname: '/legal/[id]', params: { id: item.id } })}><Text style={styles.cat}>{item.issuingBody || item.sourceSystem || t('legal.officialSource')}</Text><Text style={styles.title}>{item.title || item.citation || t('legal.untitled')}</Text><Text style={styles.date}>{item.publicationDate || ''}{item.citation ? ` · ${item.citation}` : ''}</Text></Pressable>}
  />;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:16},error:{color:'#b42318',marginBottom:12},search:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:15,paddingVertical:13,fontSize:16,color:'#101828'},count:{color:'#98a2b3',fontSize:13,marginTop:10,marginBottom:14},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8}});

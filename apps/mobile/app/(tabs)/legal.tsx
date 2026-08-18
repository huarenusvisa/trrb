import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

type LegalRecord = { id: string; title?: string; citation?: string; docket?: string; issuingBody?: string; publicationDate?: string; sourceSystem?: string; authorityType?: string };

export default function LegalScreen() {
  const [items, setItems] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('https://trrb.net/data/legal/unified-legal-authorities-latest.json')
      .then((r) => { if (!r.ok) throw new Error(`法律数据库 ${r.status}`); return r.json(); })
      .then((payload) => setItems(Array.isArray(payload?.records) ? payload.records : []))
      .catch((e) => setError(e instanceof Error ? e.message : '法律数据库加载失败'))
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
    ListHeaderComponent={<View><Text style={styles.h1}>美国判例与新规</Text><Text style={styles.sub}>官方法律资料数据库 · App 原生详情</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<TextInput value={q} onChangeText={setQ} placeholder="搜索案名、案号、引证或机构" placeholderTextColor="#98a2b3" style={styles.search} /><Text style={styles.count}>共 {filtered.length} 条</Text></View>}
    data={filtered}
    keyExtractor={(item) => item.id}
    initialNumToRender={20}
    maxToRenderPerBatch={20}
    windowSize={8}
    renderItem={({ item }) => <Pressable style={styles.row} onPress={() => router.push({ pathname: '/legal/[id]', params: { id: item.id } })}><Text style={styles.cat}>{item.issuingBody || item.sourceSystem || '官方法律资料'}</Text><Text style={styles.title}>{item.title || item.citation || '未命名法律资料'}</Text><Text style={styles.date}>{item.publicationDate || ''}{item.citation ? ` · ${item.citation}` : ''}</Text></Pressable>}
  />;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:16},error:{color:'#b42318',marginBottom:12},search:{backgroundColor:'#fff',borderRadius:14,paddingHorizontal:15,paddingVertical:13,fontSize:16,color:'#101828'},count:{color:'#98a2b3',fontSize:13,marginTop:10,marginBottom:14},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8}});

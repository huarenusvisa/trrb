import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

type LegalRecord = { id: string; title?: string; citation?: string; issuingBody?: string; publicationDate?: string; sourceSystem?: string; officialUrl?: string };

export default function LegalScreen() {
  const [items, setItems] = useState<LegalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('https://trrb.net/data/legal/unified-legal-authorities-latest.json')
      .then((r) => { if (!r.ok) throw new Error(`法律数据库 ${r.status}`); return r.json(); })
      .then((payload) => setItems(Array.isArray(payload?.records) ? payload.records : []))
      .catch((e) => setError(e instanceof Error ? e.message : '法律数据库加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>美国判例与新规</Text><Text style={styles.sub}>官方法律资料数据库</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</>} data={items} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable style={styles.row} onPress={() => item.officialUrl && Linking.openURL(item.officialUrl)}><Text style={styles.cat}>{item.issuingBody || item.sourceSystem || '官方法律资料'}</Text><Text style={styles.title}>{item.title || item.citation || '未命名法律资料'}</Text><Text style={styles.date}>{item.publicationDate || ''}{item.citation ? ` · ${item.citation}` : ''}</Text></Pressable>} />;
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},center:{flex:1,alignItems:'center',justifyContent:'center'},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},error:{color:'#b42318',marginBottom:12},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8}});

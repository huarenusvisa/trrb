import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchArticle } from '../src/api/trrb';
import { clearHistory, getHistory, syncHistoryWithCloud } from '../src/storage/library';
import type { SavedArticle } from '../src/storage/library';

type SyncState = 'local' | 'syncing' | 'synced' | 'partial' | 'error';

function syncMessage(state: SyncState) {
  if (state === 'syncing') return '正在与账号云端历史合并…';
  if (state === 'synced') return '已与账号云端历史合并 · 最多100条';
  if (state === 'partial') return '部分云端新闻暂不可用，稍后会自动重试';
  if (state === 'error') return '云同步暂不可用，已保留本机历史';
  return '保存在当前设备；登录后自动合并 · 最多100条';
}

export default function HistoryScreen() {
  const [items,setItems]=useState<SavedArticle[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('local');

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadAndSync = async () => {
      const local = await getHistory();
      if (!active) return;
      setItems(local);
      setSyncState('syncing');
      try {
        const result = await syncHistoryWithCloud(fetchArticle);
        if (!active) return;
        setItems(result.items);
        setSyncState(!result.signedIn ? 'local' : result.unresolved ? 'partial' : 'synced');
      } catch {
        if (active) setSyncState('error');
      }
    };
    void loadAndSync();
    return () => { active = false; };
  }, []));

  const confirmClear = () => Alert.alert(
    '清空阅读历史？',
    '登录状态下会同时清空当前账号的云端阅读历史，此操作无法撤销。',
    [
      { text: '取消', style: 'cancel' },
      { text: '确认清空', style: 'destructive', onPress: () => void clearHistory().then((result) => {
        setItems([]);
        setSyncState(result.signedIn ? 'synced' : 'local');
      }).catch(() => Alert.alert('清空失败', '云端暂不可用，阅读历史已安全保留，请稍后重试。')) },
    ],
  );

  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>阅读历史</Text><Text testID="history-sync-status" style={styles.status}>{syncMessage(syncState)}</Text><Pressable testID="clear-history" onPress={confirmClear}><Text style={styles.clear}>清空历史</Text></Pressable></>} data={items} keyExtractor={(x)=>String(x.id)} ListEmptyComponent={<Text style={styles.empty}>暂无阅读历史</Text>} renderItem={({item})=><Pressable style={styles.row} onPress={()=>router.push({pathname:'/article/[id]',params:{id:String(item.id)}})}><Text style={styles.cat}>{item.category_name||'唐人日报'}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at?new Date(item.published_at).toLocaleString('zh-CN'):''}</Text></Pressable>} />;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},h1:{fontSize:30,fontWeight:'900',color:'#101828'},status:{color:'#667085',marginTop:6},clear:{color:'#c8211e',fontWeight:'800',marginTop:10,marginBottom:18},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8},empty:{color:'#667085',textAlign:'center',marginTop:50}});

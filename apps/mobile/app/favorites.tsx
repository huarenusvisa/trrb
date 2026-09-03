import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchArticle } from '../src/api/trrb';
import { getFavorites, syncFavoritesWithCloud } from '../src/storage/library';
import type { SavedArticle } from '../src/storage/library';

type SyncState = 'local' | 'syncing' | 'synced' | 'partial' | 'error';

function syncMessage(state: SyncState) {
  if (state === 'syncing') return '正在与账号云端收藏合并…';
  if (state === 'synced') return '已与账号云端收藏合并';
  if (state === 'partial') return '部分云端新闻暂不可用，稍后会自动重试';
  if (state === 'error') return '云同步暂不可用，已保留本机收藏';
  return '保存在当前设备；登录后自动合并到云端';
}

export default function FavoritesScreen() {
  const [items, setItems] = useState<SavedArticle[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('local');

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadAndSync = async () => {
      const local = await getFavorites();
      if (!active) return;
      setItems(local);
      setSyncState('syncing');
      try {
        const result = await syncFavoritesWithCloud(fetchArticle);
        if (!active) return;
        setItems(result.items);
        setSyncState(!result.signedIn ? 'local' : result.unresolved ? 'partial' : 'synced');
      } catch {
        if (active) setSyncState('error');
      }
    };
    loadAndSync();
    return () => { active = false; };
  }, []));

  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>我的收藏</Text><Text testID="favorites-sync-status" style={styles.sub}>{syncMessage(syncState)}</Text></>} data={items} keyExtractor={(x)=>String(x.id)} ListEmptyComponent={<Text style={styles.empty}>还没有收藏新闻</Text>} renderItem={({item})=><Pressable style={styles.row} onPress={()=>router.push({pathname:'/article/[id]',params:{id:String(item.id)}})}><Text style={styles.cat}>{item.category_name||'唐人日报'}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at?new Date(item.published_at).toLocaleString('zh-CN'):''}</Text></Pressable>} />;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8},empty:{color:'#667085',textAlign:'center',marginTop:50}});

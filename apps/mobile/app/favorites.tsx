import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { fetchArticle } from '../src/api/trrb';
import { getFavorites, syncFavoritesWithCloud } from '../src/storage/library';
import type { SavedArticle } from '../src/storage/library';
import { useI18n } from '../src/i18n/I18nProvider';
import { localeDateTag, type MessageKey } from '../src/i18n/i18n-core';

type SyncState = 'local' | 'syncing' | 'synced' | 'partial' | 'error';

const SYNC_KEYS: Record<SyncState, MessageKey> = { local: 'favorites.local', syncing: 'favorites.syncing', synced: 'favorites.synced', partial: 'favorites.partial', error: 'favorites.error' };

export default function FavoritesScreen() {
  const { locale, t } = useI18n();
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

  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>{t('favorites.heading')}</Text><Text testID="favorites-sync-status" style={styles.sub}>{t(SYNC_KEYS[syncState])}</Text></>} data={items} keyExtractor={(x)=>String(x.id)} ListEmptyComponent={<Text style={styles.empty}>{t('favorites.empty')}</Text>} renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={t('favorites.openArticleA11y', { title: item.title })} style={styles.row} onPress={()=>router.push({pathname:'/article/[id]',params:{id:String(item.id)}})}><Text style={styles.cat}>{item.category_name||t('article.authorFallback')}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at?new Date(item.published_at).toLocaleString(localeDateTag(locale)):''}</Text></Pressable>} />;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8},empty:{color:'#667085',textAlign:'center',marginTop:50}});

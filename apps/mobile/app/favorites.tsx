import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getFavorites, SavedArticle } from '../src/storage/library';

export default function FavoritesScreen() {
  const [items, setItems] = useState<SavedArticle[]>([]);
  useFocusEffect(useCallback(() => { getFavorites().then(setItems); }, []));
  return <FlatList style={styles.page} contentContainerStyle={styles.content} ListHeaderComponent={<><Text style={styles.h1}>我的收藏</Text><Text style={styles.sub}>保存在当前设备</Text></>} data={items} keyExtractor={(x)=>String(x.id)} ListEmptyComponent={<Text style={styles.empty}>还没有收藏新闻</Text>} renderItem={({item})=><Pressable style={styles.row} onPress={()=>router.push({pathname:'/article/[id]',params:{id:String(item.id)}})}><Text style={styles.cat}>{item.category_name||'唐人日报'}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.date}>{item.published_at?new Date(item.published_at).toLocaleString('zh-CN'):''}</Text></Pressable>} />;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:16,paddingTop:58,paddingBottom:30},h1:{fontSize:30,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:18},row:{backgroundColor:'#fff',padding:16,borderRadius:14,marginBottom:10},cat:{color:'#c8211e',fontWeight:'800'},title:{fontSize:18,lineHeight:25,fontWeight:'800',color:'#101828',marginTop:6},date:{fontSize:12,color:'#98a2b3',marginTop:8},empty:{color:'#667085',textAlign:'center',marginTop:50}});

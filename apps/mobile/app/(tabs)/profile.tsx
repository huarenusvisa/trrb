import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

export default function ProfileScreen() {
  return (
    <View style={styles.page}>
      <Text style={styles.h1}>我的</Text>
      <Text style={styles.sub}>唐人日报 App</Text>
      <Pressable style={styles.item} onPress={()=>router.push('/favorites')}><Text style={styles.title}>收藏</Text><Text style={styles.meta}>查看保存在当前设备的新闻</Text></Pressable>
      <Pressable style={styles.item} onPress={()=>router.push('/history')}><Text style={styles.title}>阅读历史</Text><Text style={styles.meta}>最近阅读的新闻，最多保存100条</Text></Pressable>
      <Pressable style={styles.item}><Text style={styles.title}>推送设置</Text><Text style={styles.meta}>重大新闻 · ICE · 移民 · 判例新规（下一阶段接入）</Text></Pressable>
      <Pressable style={styles.item} onPress={() => Linking.openURL('https://trrb.net')}><Text style={styles.title}>打开 trrb.net</Text><Text style={styles.meta}>访问唐人日报网站</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#f5f6f8',padding:16,paddingTop:58},h1:{fontSize:32,fontWeight:'900',color:'#101828'},sub:{color:'#667085',marginTop:6,marginBottom:24},item:{backgroundColor:'#fff',padding:18,borderRadius:14,marginBottom:12},title:{fontSize:18,fontWeight:'800',color:'#101828'},meta:{color:'#98a2b3',marginTop:6}});

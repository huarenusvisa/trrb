import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PaginatedNewsList } from '../src/components/PaginatedNewsList';

export default function SearchScreen() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  return (
    <View style={styles.page}>
      <View style={styles.searchBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => setQuery(input.trim())}
          placeholder="搜索新闻标题或摘要"
          placeholderTextColor="#98a2b3"
          returnKeyType="search"
          style={styles.input}
        />
        <Pressable style={styles.button} onPress={() => setQuery(input.trim())}><Text style={styles.buttonText}>搜索</Text></Pressable>
      </View>
      <View style={styles.results}>
        {query ? <PaginatedNewsList title={`搜索：${query}`} q={query} emptyText="没有找到相关已发布新闻。" /> : <View style={styles.empty}><Text style={styles.hint}>输入关键词搜索唐人日报已发布新闻</Text></View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},searchBar:{paddingTop:54,paddingHorizontal:16,paddingBottom:10,flexDirection:'row',gap:10,backgroundColor:'#fff'},input:{flex:1,height:46,borderRadius:12,backgroundColor:'#f2f4f7',paddingHorizontal:14,fontSize:16,color:'#101828'},button:{height:46,paddingHorizontal:18,borderRadius:12,backgroundColor:'#c8211e',alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontWeight:'800'},results:{flex:1},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:30},hint:{color:'#667085',fontSize:16,textAlign:'center'}
});

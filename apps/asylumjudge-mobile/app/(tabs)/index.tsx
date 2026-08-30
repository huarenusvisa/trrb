import { useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { JudgeSearchResponse, JudgeSummary, searchJudges, sourceLabel } from '../../src/api/asylumjudge';
import { JudgeCard } from '../../src/components/JudgeCard';
import { colors } from '../../src/theme';

export default function JudgeSearchScreen() {
  const [input, setInput] = useState('');
  const [data, setData] = useState<JudgeSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(value = input) {
    const query = value.trim();
    if (!query || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    try {
      setData(await searchJudges(query));
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : '暂时无法读取法官数据，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  function openJudge(judge: JudgeSummary) {
    router.push({ pathname: '/judge/[id]', params: { id: judge.id } });
  }

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>美国移民法庭公开数据</Text>
        <Text style={styles.title}>查询移民法官</Text>
        <Text style={styles.subtitle}>按法官姓名、法院、城市或州搜索。批准率仅在有效裁决达到最低样本门槛时显示。</Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="输入法官、法院、城市或州"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => submit()}
            returnKeyType="search"
            autoCapitalize="words"
            placeholder="例如：New York、Ling"
            placeholderTextColor="#8A98A8"
            style={styles.input}
          />
          <Pressable accessibilityRole="button" onPress={() => submit()} style={styles.searchButton}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchText}>搜索</Text>}
          </Pressable>
        </View>
      </View>

      {error ? <View style={styles.message}><Text style={styles.error}>{error}</Text><Pressable onPress={() => submit()}><Text style={styles.retry}>重新加载</Text></Pressable></View> : null}

      <FlatList
        data={data?.results || []}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => <JudgeCard judge={item} onPress={() => openJudge(item)} />}
        ItemSeparatorComponent={() => <View style={{height:12}} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={data ? <View style={styles.resultHeader}><Text style={styles.resultTitle}>“{data.query}” · {data.count} 位法官</Text><Text style={styles.source}>{sourceLabel(data)}</Text></View> : null}
        ListEmptyComponent={!loading && data ? <View style={styles.empty}><Text style={styles.emptyTitle}>没有找到匹配结果</Text><Text style={styles.emptyText}>请尝试英文姓名、法院城市或州名。</Text></View> : !data && !error ? <View style={styles.guide}><Text style={styles.guideTitle}>结果来自现有 AsylumJudge 数据接口</Text><Text style={styles.guideText}>不在 App 中复制、估算或补造裁决数据；详情页同时展示数据期间、口径和来源状态。</Text></View> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},hero:{paddingTop:62,paddingHorizontal:18,paddingBottom:22,backgroundColor:colors.navy},
  eyebrow:{fontSize:13,fontWeight:'700',color:'#BFD7FF',marginBottom:7},title:{fontSize:31,fontWeight:'900',color:'#fff'},subtitle:{fontSize:15,lineHeight:22,color:'#D9E6F2',marginTop:8},
  searchRow:{flexDirection:'row',gap:10,marginTop:20},input:{flex:1,height:50,borderRadius:13,backgroundColor:'#fff',paddingHorizontal:14,fontSize:16,color:colors.ink},
  searchButton:{width:72,height:50,borderRadius:13,backgroundColor:colors.blue,alignItems:'center',justifyContent:'center'},searchText:{color:'#fff',fontWeight:'800',fontSize:16},
  list:{padding:16,paddingBottom:36,flexGrow:1},resultHeader:{gap:3,marginBottom:14},resultTitle:{fontSize:18,fontWeight:'800',color:colors.ink},source:{fontSize:12,color:colors.muted},
  message:{margin:16,padding:14,borderRadius:12,backgroundColor:'#FEF3F2',gap:8},error:{color:colors.red},retry:{fontWeight:'800',color:colors.blue},
  empty:{paddingVertical:60,alignItems:'center',gap:8},emptyTitle:{fontSize:19,fontWeight:'800',color:colors.ink},emptyText:{color:colors.muted},
  guide:{marginTop:24,padding:18,borderRadius:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,gap:8},guideTitle:{fontSize:17,fontWeight:'800',color:colors.ink},guideText:{fontSize:14,lineHeight:21,color:colors.muted}
});

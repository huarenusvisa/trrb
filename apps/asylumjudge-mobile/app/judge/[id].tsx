import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchJudgeDetail, formatRate, JudgeDetailResponse, sourceLabel } from '../../src/api/asylumjudge';
import { colors } from '../../src/theme';

export default function JudgeDetailScreen() {
  const { id } = useLocalSearchParams<{id:string}>();
  const [data, setData] = useState<JudgeDetailResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setError('');
    fetchJudgeDetail(id).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : '暂时无法读取详情。'));
  }, [id]);

  if (!data && !error) return <View style={styles.center}><ActivityIndicator color={colors.blue} size="large" /><Text style={styles.loading}>正在读取真实裁决数据…</Text></View>;
  if (!data) return <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable onPress={() => router.back()}><Text style={styles.backLink}>返回搜索</Text></Pressable></View>;

  const judge = data.judge;
  const decisions = judge.adjudicated_decisions ?? Number(judge.grants || 0) + Number(judge.denials || 0);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ 返回搜索</Text></Pressable>
      <Text style={styles.eyebrow}>移民法官详情</Text>
      <Text style={styles.name}>{judge.judge_name}</Text>
      <Text style={styles.court}>{judge.court_name || [judge.court_city,judge.court_state].filter(Boolean).join(', ') || '法院信息待核对'}</Text>

      <View style={styles.primaryCard}>
        <Text style={styles.metricLabel}>裁决批准率</Text>
        <Text style={styles.primaryRate}>{formatRate(judge)}</Text>
        <Text style={styles.sample}>{decisions.toLocaleString()} 件有效裁决 · {judge.data_start_date || '—'} 至 {judge.data_end_date || '—'}</Text>
      </View>

      <View style={styles.grid}>
        <Metric label="批准" value={Number(judge.grants || 0).toLocaleString()} />
        <Metric label="拒绝" value={Number(judge.denials || 0).toLocaleString()} />
        <Metric label="其他裁决" value={Number(judge.other_decisions || 0).toLocaleString()} />
        <Metric label="全部记录" value={Number(judge.total_asylum_decisions || 0).toLocaleString()} />
      </View>

      {data.yearly?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>按财政年度</Text>{data.yearly.slice().reverse().map((row) => <View key={row.fiscal_year} style={styles.row}><Text style={styles.rowTitle}>FY {row.fiscal_year}</Text><Text style={styles.rowValue}>{formatRate(row)}</Text><Text style={styles.rowMeta}>{Number(row.grants || 0) + Number(row.denials || 0)} 件</Text></View>)}</View> : null}

      {data.background?.biography ? <View style={styles.section}><Text style={styles.sectionTitle}>公开履历</Text><Text style={styles.body}>{data.background.biography}</Text></View> : null}

      <View style={styles.sourceCard}>
        <Text style={styles.sourceTitle}>数据来源与口径</Text>
        <Text style={styles.body}>{sourceLabel(data)}。批准率不包含“其他裁决”；小于接口规定的最低有效样本时自动隐藏。</Text>
        <Text style={styles.quality}>数据质量状态：{data.data_quality || '接口未返回'}</Text>
      </View>
      <Text style={styles.disclaimer}>本页是历史汇总统计，不预测个案结果，不构成法律建议。</Text>
    </ScrollView>
  );
}

function Metric({label,value}:{label:string;value:string}) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},content:{paddingTop:54,paddingHorizontal:18,paddingBottom:44},center:{flex:1,backgroundColor:colors.background,alignItems:'center',justifyContent:'center',padding:24,gap:14},
  loading:{color:colors.muted},error:{color:colors.red,textAlign:'center'},backLink:{color:colors.blue,fontWeight:'800'},back:{marginBottom:20},backText:{fontSize:16,fontWeight:'700',color:colors.blue},
  eyebrow:{fontSize:13,fontWeight:'800',color:colors.blue},name:{fontSize:31,fontWeight:'900',color:colors.navy,marginTop:5},court:{fontSize:16,color:colors.muted,marginTop:5,marginBottom:20},
  primaryCard:{backgroundColor:colors.navy,borderRadius:18,padding:20,gap:5},metricLabel:{fontSize:12,color:colors.muted},primaryRate:{fontSize:34,fontWeight:'900',color:'#fff'},sample:{fontSize:13,color:'#D9E6F2'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:12},metric:{width:'48%',padding:15,borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,gap:4},metricValue:{fontSize:21,fontWeight:'900',color:colors.ink},
  section:{marginTop:22,padding:18,borderRadius:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line},sectionTitle:{fontSize:19,fontWeight:'900',color:colors.ink,marginBottom:12},
  row:{flexDirection:'row',alignItems:'center',paddingVertical:11,borderTopWidth:1,borderTopColor:'#EEF2F6'},rowTitle:{flex:1,fontWeight:'800',color:colors.ink},rowValue:{fontWeight:'800',color:colors.green},rowMeta:{width:70,textAlign:'right',color:colors.muted},body:{fontSize:15,lineHeight:23,color:colors.muted},
  sourceCard:{marginTop:22,padding:18,borderRadius:16,backgroundColor:colors.blueSoft,gap:8},sourceTitle:{fontSize:18,fontWeight:'900',color:colors.navy},quality:{fontSize:12,fontWeight:'700',color:colors.blue},disclaimer:{marginTop:16,fontSize:13,lineHeight:19,color:colors.muted,textAlign:'center'}
});

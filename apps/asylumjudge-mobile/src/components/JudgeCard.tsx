import { Pressable, StyleSheet, Text, View } from 'react-native';
import { JudgeSummary, formatRate } from '../api/asylumjudge';
import { colors } from '../theme';

export function JudgeCard({ judge, onPress }: { judge: JudgeSummary; onPress: () => void }) {
  const decisions = judge.adjudicated_decisions ?? Number(judge.grants || 0) + Number(judge.denials || 0);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`查看${judge.judge_name}法官详情`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.heading}>
        <View style={styles.titleWrap}>
          <Text style={styles.name}>{judge.judge_name}</Text>
          <Text style={styles.court}>{judge.court_name || [judge.court_city, judge.court_state].filter(Boolean).join(', ') || '法院信息待核对'}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </View>
      <View style={styles.metrics}>
        <View><Text style={styles.metricLabel}>裁决批准率</Text><Text style={styles.rate}>{formatRate(judge)}</Text></View>
        <View><Text style={styles.metricLabel}>有效裁决</Text><Text style={styles.value}>{decisions.toLocaleString()}</Text></View>
        <View><Text style={styles.metricLabel}>记录期间</Text><Text style={styles.period}>{judge.data_end_date || '—'}</Text></View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card:{backgroundColor:colors.surface,borderRadius:16,padding:16,borderWidth:1,borderColor:colors.line,gap:14},
  pressed:{opacity:0.72},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},titleWrap:{flex:1,gap:4},
  name:{fontSize:18,fontWeight:'800',color:colors.ink},court:{fontSize:14,color:colors.muted},arrow:{fontSize:30,color:colors.blue},
  metrics:{flexDirection:'row',justifyContent:'space-between',gap:10},metricLabel:{fontSize:11,color:colors.muted,marginBottom:3},
  rate:{fontSize:16,fontWeight:'800',color:colors.green},value:{fontSize:16,fontWeight:'800',color:colors.ink},period:{fontSize:13,fontWeight:'700',color:colors.ink}
});

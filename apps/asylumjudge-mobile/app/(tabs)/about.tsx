import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../src/theme';

export default function AboutScreen() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>DATA & METHODOLOGY</Text>
      <Text style={styles.title}>数据来源与免责声明</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>数据来源</Text>
        <Text style={styles.text}>App 读取 AsylumJudge 的公共接口。当前接口以 EOIR FOIA Case Data 为权威来源，但因经过规范化衍生层，质量状态仍标记为 provisional_derivative，而不是 direct_official。App 不内置或编造裁决数据。</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>批准率口径</Text>
        <Text style={styles.text}>批准率 = 批准 ÷（批准 + 拒绝）。其他裁决不进入该比率。有效裁决少于 50 件时，不显示批准率，以减少小样本误导。</Text>
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>不是法律建议</Text>
        <Text style={styles.text}>历史统计不能预测任何个人案件结果，也不能代替律师意见。案件事实、证据、法律标准和程序状态都会影响结果。</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://asylumjudge.com/methodology')} style={styles.linkButton}>
        <Text style={styles.linkText}>查看完整数据口径 ↗</Text>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.justice.gov/eoir')} style={styles.secondaryLink}>
        <Text style={styles.secondaryText}>访问美国司法部 EOIR 官网 ↗</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:colors.background},content:{paddingTop:62,paddingHorizontal:18,paddingBottom:40,gap:14},eyebrow:{fontSize:12,fontWeight:'800',color:colors.blue,letterSpacing:1},
  title:{fontSize:30,fontWeight:'900',color:colors.navy,marginBottom:8},card:{padding:18,borderRadius:16,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.line,gap:8},
  cardTitle:{fontSize:18,fontWeight:'800',color:colors.ink},text:{fontSize:15,lineHeight:23,color:colors.muted},notice:{padding:18,borderRadius:16,backgroundColor:'#FFF8E6',borderWidth:1,borderColor:'#F4D58D',gap:8},noticeTitle:{fontSize:18,fontWeight:'800',color:colors.amber},
  linkButton:{marginTop:6,height:50,borderRadius:13,backgroundColor:colors.blue,alignItems:'center',justifyContent:'center'},linkText:{fontSize:16,fontWeight:'800',color:'#fff'},secondaryLink:{height:46,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:15,fontWeight:'700',color:colors.blue}
});

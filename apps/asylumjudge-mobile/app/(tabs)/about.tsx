import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { API_URL } from '@/api/asylumJudge';
import { PageHeader, Section, sharedStyles } from '@/components/ui';

export default function AboutScreen() {
  return (
    <ScrollView style={sharedStyles.page} contentContainerStyle={sharedStyles.content}>
      <PageHeader title="数据与说明" subtitle="了解数据来源、统计方法及使用边界。" />
      <Section>
        <Text style={sharedStyles.title}>数据来源</Text>
        <Text style={[sharedStyles.body, styles.space]}>本应用展示美国司法部移民审查执行办公室（EOIR）公开历史裁决数据，并通过 AsylumJudge 数据接口整理。页面会标明数据期间或快照日期（如接口提供）。</Text>
        <Pressable style={sharedStyles.button} onPress={() => Linking.openURL('https://www.justice.gov/eoir')}><Text style={sharedStyles.buttonText}>访问 EOIR 官方网站</Text></Pressable>
      </Section>
      <Section>
        <Text style={sharedStyles.title}>批准率口径</Text>
        <Text style={[sharedStyles.body, styles.space]}>实体批准率 = 批准数 ÷（批准数＋拒绝数）。其他结案不进入分母。样本不足时不应单独比较批准率，年度、法院、国籍和案件事实都可能改变统计结果。</Text>
      </Section>
      <Section>
        <Text style={sharedStyles.title}>重要免责声明</Text>
        <Text style={[sharedStyles.body, styles.space]}>本应用仅提供公开历史数据与一般信息，不构成法律意见，也不预测任何庇护申请、上诉或其他移民案件的结果。处理具体案件前，应向合格的美国移民律师或获认可代表咨询。</Text>
      </Section>
      <Section>
        <Text style={sharedStyles.title}>接口状态</Text>
        <Text selectable style={[sharedStyles.small, styles.space]}>{API_URL}</Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ space: { marginTop: 8, marginBottom: 13 } });

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Judge } from '@/api/asylumJudge';
import { formatNumber, meritsApprovalRate } from '@/api/asylumJudge';

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>ASYLUMJUDGE</Text>
      <Text style={styles.h1}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

export function StateView({ loading, error, empty, onRetry }: { loading?: boolean; error?: string; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={styles.state}><ActivityIndicator color="#2457a7" /><Text style={styles.stateText}>正在读取 EOIR 数据…</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text>{onRetry ? <Pressable style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>重新加载</Text></Pressable> : null}</View>;
  if (empty) return <View style={styles.state}><Text style={styles.stateText}>{empty}</Text></View>;
  return null;
}

export function JudgeCard({ judge }: { judge: Judge }) {
  const rate = meritsApprovalRate(judge);
  return (
    <Pressable style={styles.judgeCard} onPress={() => router.push({ pathname: '/judge/[id]', params: { id: String(judge.id) } })}>
      <View style={styles.judgeTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.judgeName}>{judge.judge_name}</Text>
          <Text style={styles.court}>{[judge.court_name, judge.court_city, judge.court_state].filter(Boolean).join(' · ') || '法院信息待补充'}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.pill}>裁决 {formatNumber(judge.total_asylum_decisions)}</Text>
        <Text style={styles.pill}>实体批准率 {rate === null ? '—' : `${rate.toFixed(1)}%`}</Text>
      </View>
    </Pressable>
  );
}

export const sharedStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6fa' },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 92 },
  title: { color: '#101828', fontSize: 19, fontWeight: '800' },
  body: { color: '#475467', fontSize: 14, lineHeight: 22 },
  label: { color: '#344054', fontSize: 13, fontWeight: '800', marginBottom: 7 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0d5dd', borderRadius: 12, minHeight: 48, paddingHorizontal: 14, fontSize: 15, color: '#101828' },
  small: { color: '#667085', fontSize: 12, lineHeight: 18 },
  button: { minHeight: 46, borderRadius: 12, backgroundColor: '#2457a7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 9 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
});

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  eyebrow: { color: '#2457a7', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  h1: { color: '#101828', fontSize: 28, lineHeight: 35, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#667085', fontSize: 13, lineHeight: 20, marginTop: 6 },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 15, marginBottom: 12 },
  metric: { minWidth: '30%', flex: 1, backgroundColor: '#eef4ff', borderRadius: 13, padding: 12 },
  metricValue: { color: '#183b70', fontSize: 20, fontWeight: '900' },
  metricLabel: { color: '#667085', fontSize: 11, marginTop: 4 },
  state: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  stateText: { color: '#667085', fontSize: 13 },
  error: { color: '#b42318', fontSize: 13, lineHeight: 20 },
  retry: { backgroundColor: '#2457a7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  judgeCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
  judgeTop: { flexDirection: 'row', alignItems: 'center' },
  judgeName: { color: '#101828', fontSize: 17, fontWeight: '900' },
  court: { color: '#667085', fontSize: 12, lineHeight: 18, marginTop: 4 },
  chevron: { color: '#98a2b3', fontSize: 27 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  pill: { color: '#344054', backgroundColor: '#f2f4f7', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, fontSize: 11, fontWeight: '700' },
});

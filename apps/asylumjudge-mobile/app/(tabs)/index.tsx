import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { fetchStats, fetchTopJudges, formatNumber, type Judge, type Stats } from '@/api/asylumJudge';
import { JudgeCard, Metric, PageHeader, Section, StateView, sharedStyles } from '@/components/ui';

export default function OverviewScreen() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [statsResult, topResult] = await Promise.all([fetchStats(signal), fetchTopJudges(8, signal)]);
      setStats(statsResult);
      setJudges(topResult.results || []);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message || '暂时无法读取数据，请稍后重试。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <ScrollView
      style={sharedStyles.page}
      contentContainerStyle={sharedStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(undefined, true)} />}
    >
      <PageHeader title="移民法官数据" subtitle="查询美国移民法官、法院与国籍维度的历史庇护裁决数据。" />
      <StateView loading={loading} error={error} onRetry={() => load()} />
      {!loading && !error ? (
        <>
          <View style={styles.metrics}>
            <Metric label="法官" value={formatNumber(stats?.judges)} />
            <Metric label="法院" value={formatNumber(stats?.courts)} />
            <Metric label="历史裁决" value={formatNumber(stats?.decisions)} />
          </View>

          <Section>
            <Text style={sharedStyles.title}>快速查询</Text>
            <Text style={[sharedStyles.body, styles.intro]}>可按法官姓名、法院、城市或州搜索，也可查看法院和国籍统计。</Text>
            <View style={styles.actions}>
              <Action label="搜索法官" onPress={() => router.push('/judges')} />
              <Action label="查看法院" onPress={() => router.push('/courts')} />
              <Action label="国籍统计" onPress={() => router.push('/nationalities')} />
            </View>
          </Section>

          <View style={styles.headingRow}>
            <Text style={sharedStyles.title}>高裁决量法官</Text>
            <Pressable onPress={() => router.push('/judges')}><Text style={styles.link}>查看全部</Text></Pressable>
          </View>
          {judges.length ? judges.map((judge) => <JudgeCard key={String(judge.id)} judge={judge} />) : <StateView empty="暂时没有可显示的法官数据。" />}

          <Section>
            <Text style={sharedStyles.title}>统计口径</Text>
            <Text style={[sharedStyles.body, styles.intro]}>批准率按批准数 ÷（批准数＋拒绝数）计算。数据来自 EOIR 历史公开记录，只反映已统计案件，不能预测任何个案结果。</Text>
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable style={styles.action} onPress={onPress}><Text style={styles.actionText}>{label}</Text><Text style={styles.arrow}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  intro: { marginTop: 7 },
  actions: { marginTop: 12, gap: 8 },
  action: { minHeight: 46, borderRadius: 11, backgroundColor: '#f2f4f7', paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionText: { color: '#183b70', fontSize: 14, fontWeight: '800' },
  arrow: { color: '#667085', fontSize: 23 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  link: { color: '#2457a7', fontSize: 13, fontWeight: '800' },
});

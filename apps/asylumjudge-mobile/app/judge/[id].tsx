import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchJudgeDetail, formatNumber, meritsApprovalRate, type JudgeDetail, type OutcomeRow } from '@/api/asylumJudge';
import { Metric, Section, StateView, sharedStyles } from '@/components/ui';

export default function JudgeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [detail, setDetail] = useState<JudgeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    if (!id) {
      setLoading(false);
      setError('缺少法官编号，无法读取详情。');
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setDetail(await fetchJudgeDetail(id, signal));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message || '法官详情读取失败。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const judge = detail?.judge;
  const rate = judge ? meritsApprovalRate(judge) : null;
  const background = backgroundText(detail?.background ?? judge?.background);

  return (
    <ScrollView
      style={sharedStyles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(undefined, true)} />}
    >
      <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>‹ 返回</Text></Pressable>
      <StateView loading={loading} error={error} onRetry={() => load()} />
      {!loading && !error && judge ? (
        <>
          <Text style={styles.eyebrow}>IMMIGRATION JUDGE</Text>
          <Text style={styles.name}>{judge.judge_name}</Text>
          <Text style={styles.court}>{[judge.court_name, judge.court_city, judge.court_state].filter(Boolean).join(' · ') || '法院信息待补充'}</Text>

          <View style={styles.metrics}>
            <Metric label="历史裁决" value={formatNumber(judge.total_asylum_decisions)} />
            <Metric label="批准" value={formatNumber(judge.grants)} />
            <Metric label="拒绝" value={formatNumber(judge.denials)} />
          </View>

          <Section>
            <Text style={sharedStyles.title}>实体批准率</Text>
            <Text style={styles.rate}>{rate === null ? '—' : `${rate.toFixed(1)}%`}</Text>
            <Text style={sharedStyles.small}>按批准数 ÷（批准数＋拒绝数）计算；其他结案不进入分母。</Text>
          </Section>

          {background ? (
            <Section><Text style={sharedStyles.title}>法官背景</Text><Text style={[sharedStyles.body, styles.block]}>{background}</Text></Section>
          ) : null}

          <Section>
            <Text style={sharedStyles.title}>年度裁决</Text>
            {detail.yearly?.length ? detail.yearly.slice().reverse().map((row, index) => <Outcome key={`${row.fiscal_year || 'year'}-${index}`} row={row} label={row.fiscal_year ? `FY ${row.fiscal_year}` : '年度'} />) : <StateView empty="暂无年度数据。" />}
          </Section>

          <Section>
            <Text style={sharedStyles.title}>主要国籍数据</Text>
            {detail.nationality?.length ? detail.nationality.slice(0, 20).map((row, index) => <Outcome key={`${row.nationality_code || row.nationality || 'country'}-${index}`} row={row} label={row.nationality || row.nationality_code || '未知国籍'} />) : <StateView empty="暂无国籍维度数据。" />}
          </Section>

          <Section>
            <Text style={sharedStyles.title}>数据期间</Text>
            <Text style={[sharedStyles.body, styles.block]}>{[judge.data_start_date, judge.data_end_date].filter(Boolean).join(' 至 ') || '接口暂未提供期间'}</Text>
            {judge.source_updated_at ? <Text style={sharedStyles.small}>来源更新：{judge.source_updated_at}</Text> : null}
          </Section>

          <Text style={styles.disclaimer}>数据来自 EOIR 历史公开记录，仅供信息查询，不构成法律意见，也不能预测个案结果。</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function Outcome({ row, label }: { row: OutcomeRow; label: string | number }) {
  const rate = row.approval_rate ?? meritsApprovalRate(row);
  return (
    <View style={styles.outcome}>
      <View style={{ flex: 1 }}><Text style={styles.outcomeTitle}>{label}</Text><Text style={sharedStyles.small}>裁决 {formatNumber(row.total_asylum_decisions)} · 批准 {formatNumber(row.grants)} · 拒绝 {formatNumber(row.denials)}</Text></View>
      <Text style={styles.outcomeRate}>{rate === null || rate === undefined ? '—' : `${Number(rate).toFixed(1)}%`}</Text>
    </View>
  );
}

function backgroundText(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  const preferred = ['summary', 'background', 'bio', 'biography', 'description']
    .map((key) => record[key]).find((candidate) => typeof candidate === 'string' && candidate.trim());
  if (typeof preferred === 'string') return preferred;
  return Object.values(record).filter((candidate) => typeof candidate === 'string' && candidate.trim()).join('\n');
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 48, paddingBottom: 42 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 20, marginBottom: 12 },
  backText: { color: '#2457a7', fontSize: 15, fontWeight: '800' },
  eyebrow: { color: '#2457a7', fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  name: { color: '#101828', fontSize: 30, lineHeight: 37, fontWeight: '900', marginTop: 5 },
  court: { color: '#667085', fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 16 },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rate: { color: '#183b70', fontSize: 34, fontWeight: '900', marginVertical: 8 },
  block: { marginTop: 8 },
  outcome: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d0d5dd', gap: 10 },
  outcomeTitle: { color: '#101828', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  outcomeRate: { color: '#2457a7', fontSize: 15, fontWeight: '900' },
  disclaimer: { color: '#667085', fontSize: 12, lineHeight: 19, textAlign: 'center', marginHorizontal: 10, marginTop: 4 },
});

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchCourts, formatNumber, meritsApprovalRate, type Court, type CourtsResponse } from '@/api/asylumJudge';
import { PageHeader, StateView, sharedStyles } from '@/components/ui';

export default function CourtsScreen() {
  const [result, setResult] = useState<CourtsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setResult(await fetchCourts(signal));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message || '法院数据读取失败。');
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

  const courts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = result?.courts || [];
    if (!keyword) return rows;
    return rows.filter((court) => [court.court_name, court.court, court.city, court.court_state, court.state, court.court_code]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }, [query, result]);

  return (
    <FlatList
      style={sharedStyles.page}
      contentContainerStyle={styles.content}
      data={!loading && !error ? courts : []}
      keyExtractor={(item, index) => `${item.court_code || item.court_name || item.court || 'court'}-${index}`}
      renderItem={({ item }) => <CourtCard court={item} fiscalYear={result?.fiscal_year} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(undefined, true)} />}
      ListHeaderComponent={
        <>
          <PageHeader title="法院统计" subtitle="按法院和州查看 EOIR 历史庇护裁决工作量。" />
          <TextInput value={query} onChangeText={setQuery} placeholder="搜索法院、城市或州" placeholderTextColor="#98a2b3" style={sharedStyles.input} />
          <Text style={styles.count}>{result?.fiscal_year ? `FY ${result.fiscal_year} · ` : ''}显示 {courts.length} 个法院{result?.period_end ? ` · 截至 ${result.period_end}` : ''}</Text>
          <StateView loading={loading} error={error} onRetry={() => load()} />
        </>
      }
      ListEmptyComponent={!loading && !error ? <StateView empty={query ? '没有匹配的法院。' : '暂时没有法院数据。'} /> : null}
    />
  );
}

function CourtCard({ court, fiscalYear }: { court: Court; fiscalYear?: number }) {
  const name = String(court.court_name || court.court || '未命名法院');
  const state = String(court.court_state || court.state || '');
  const city = String(court.court_city || court.city || '');
  const rate = court.approval_rate ?? meritsApprovalRate(court);
  return (
    <View style={sharedStyles.card}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}><Text style={sharedStyles.title}>{name}</Text><Text style={styles.location}>{[city !== name ? city : '', state].filter(Boolean).join(' · ') || '地点信息待补充'}</Text></View>
        {fiscalYear ? <Text style={styles.year}>FY {fiscalYear}</Text> : null}
      </View>
      <View style={styles.stats}>
        <Text style={styles.pill}>裁决 {formatNumber(court.total_decisions ?? court.total_asylum_decisions)}</Text>
        <Text style={styles.pill}>实体批准率 {rate === null || rate === undefined ? '—' : `${Number(rate).toFixed(1)}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 92 },
  count: { color: '#667085', fontSize: 12, marginVertical: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  location: { color: '#667085', fontSize: 12, marginTop: 5 },
  year: { color: '#2457a7', fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  pill: { color: '#344054', backgroundColor: '#f2f4f7', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, fontSize: 11, fontWeight: '700' },
});

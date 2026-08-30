import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchNationalities, formatNumber, meritsApprovalRate, type Country, type NationalitiesResponse } from '@/api/asylumJudge';
import { PageHeader, StateView, sharedStyles } from '@/components/ui';

export default function NationalitiesScreen() {
  const [result, setResult] = useState<NationalitiesResponse | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setResult(await fetchNationalities(signal));
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message || '国籍数据读取失败。');
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

  const countries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = result?.countries || [];
    if (!keyword) return rows;
    return rows.filter((country) => [country.nationality, country.nationality_zh, country.nationality_code, country.country, country.country_name, country.name, country.code]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }, [query, result]);

  return (
    <FlatList
      style={sharedStyles.page}
      contentContainerStyle={styles.content}
      data={!loading && !error ? countries : []}
      keyExtractor={(item, index) => String(item.nationality_code || item.code || item.nationality || item.country || index)}
      renderItem={({ item }) => <CountryCard country={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(undefined, true)} />}
      ListHeaderComponent={
        <>
          <PageHeader title="国籍统计" subtitle="比较不同国籍申请人在历史数据中的裁决数量与实体批准率。" />
          <TextInput value={query} onChangeText={setQuery} placeholder="搜索中文、英文国名或代码" placeholderTextColor="#98a2b3" style={sharedStyles.input} />
          <Text style={styles.count}>显示 {countries.length} / {result?.total_countries || result?.count || 0} 个国籍{result?.source_snapshot_date ? ` · 数据快照 ${result.source_snapshot_date}` : ''}</Text>
          <StateView loading={loading} error={error} onRetry={() => load()} />
        </>
      }
      ListFooterComponent={!loading && !error && countries.length ? <Text style={styles.notice}>国籍数据是群体历史统计，不能用于推断个人案件结果；不同法官、法院、年份和案件事实会显著影响结果。</Text> : null}
      ListEmptyComponent={!loading && !error ? <StateView empty={query ? '没有匹配的国籍。' : '暂时没有国籍数据。'} /> : null}
    />
  );
}

function CountryCard({ country }: { country: Country }) {
  const name = String(country.nationality_zh || country.country_name || country.name || country.nationality || country.country || '未知国籍');
  const english = String(country.nationality || country.country || '');
  const code = String(country.nationality_code || country.code || '');
  const rate = country.approval_rate ?? meritsApprovalRate(country);
  return (
    <View style={sharedStyles.card}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}><Text style={sharedStyles.title}>{name}</Text>{english && english !== name ? <Text style={styles.english}>{english}</Text> : null}</View>
        {code ? <Text style={styles.code}>{code}</Text> : null}
      </View>
      <View style={styles.stats}>
        <Text style={styles.pill}>裁决 {formatNumber(country.total_decisions ?? country.total_asylum_decisions)}</Text>
        <Text style={styles.pill}>实体批准率 {rate === null || rate === undefined ? '—' : `${Number(rate).toFixed(1)}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 92 },
  count: { color: '#667085', fontSize: 12, lineHeight: 18, marginVertical: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  english: { color: '#667085', fontSize: 12, marginTop: 4 },
  code: { color: '#2457a7', backgroundColor: '#eef4ff', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, fontSize: 11, fontWeight: '900' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  pill: { color: '#344054', backgroundColor: '#f2f4f7', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, fontSize: 11, fontWeight: '700' },
  notice: { color: '#667085', fontSize: 12, lineHeight: 19, padding: 14, marginBottom: 20 },
});

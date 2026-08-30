import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetchJudges, type Judge } from '@/api/asylumJudge';
import { JudgeCard, PageHeader, StateView, sharedStyles } from '@/components/ui';

export default function JudgesScreen() {
  const [judges, setJudges] = useState<Judge[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const result = await fetchJudges(signal);
      setJudges(result.results || []);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message || '法官数据读取失败。');
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

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return judges;
    return judges.filter((judge) => [judge.judge_name, judge.court_name, judge.court_city, judge.court_state]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }, [judges, query]);

  return (
    <FlatList
      style={sharedStyles.page}
      contentContainerStyle={styles.content}
      data={!loading && !error ? filtered : []}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <JudgeCard judge={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(undefined, true)} />}
      ListHeaderComponent={
        <>
          <PageHeader title="法官查询" subtitle="输入法官姓名、法院、城市或州，查看历史庇护裁决。" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="例如：Chen、New York、TX"
            placeholderTextColor="#98a2b3"
            autoCapitalize="none"
            autoCorrect={false}
            style={sharedStyles.input}
          />
          <Text style={styles.count}>{loading ? '正在读取…' : `显示 ${filtered.length} / ${judges.length} 名法官`}</Text>
          <StateView loading={loading} error={error} onRetry={() => load()} />
        </>
      }
      ListEmptyComponent={!loading && !error ? <StateView empty={query ? '没有匹配的法官，请尝试姓名、法院或州缩写。' : '暂时没有法官数据。'} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 92 },
  count: { color: '#667085', fontSize: 12, marginVertical: 10 },
});

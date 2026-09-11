import { privacySections, privacyUpdated } from './privacy';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

const API_URL = 'https://asylumjudge.com/.netlify/functions/immigration-judges?mode=directory';
const SITE_URL = 'https://asylumjudge.com';

type Judge = {
  id: string | number;
  judge_name?: string;
  court_name?: string;
  court_city?: string;
  court_state?: string;
  grants?: number;
  denials?: number;
  total_asylum_decisions?: number;
  adjudicated_approval_rate?: number | null;
};

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[’'.,-]/g, '');
}

function percent(value: number | null | undefined) {
  return value == null ? '样本不足' : `${Number(value).toFixed(1)}%`;
}

export default function App() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function loadJudges() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.results)) throw new Error('Invalid response');
      setJudges(payload.results);
    } catch {
      setError('法官数据暂时无法读取，请检查网络后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadJudges();
  }, []);

  const results = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return judges;
    return judges.filter((judge) => {
      const searchable = normalize([
        judge.judge_name,
        judge.court_name,
        judge.court_city,
        judge.court_state
      ].filter(Boolean).join(' '));
      return terms.every((term) => searchable.includes(term));
    });
  }, [judges, query]);

  async function openSupport(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('联系支持', '邮箱：huarenfalv@gmail.com\n电话：+1 929-789-1391');
    }
  }

  function openJudge(judge: Judge) {
    void Linking.openURL(`${SITE_URL}/judge?id=${encodeURIComponent(String(judge.id))}`);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ASYLUMJUDGE.COM</Text>
        <Text style={styles.title}>移民法官</Text>
        <Text style={styles.subtitle}>查询美国移民法官、法院和庇护裁决数据</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="搜索移民法官"
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder="姓名、法院、城市或州代码"
          returnKeyType="search"
          style={styles.search}
          value={query}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="清除搜索" onPress={() => setQuery('')} style={styles.clear}>
            <Text style={styles.clearText}>清除</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color="#14804a" size="large" />
          <Text style={styles.stateText}>正在读取法官数据…</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadJudges()} style={styles.retry}>
            <Text style={styles.retryText}>重新尝试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={results}
          initialNumToRender={20}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={<Text style={styles.count}>找到 {results.length.toLocaleString('zh-CN')} 位法官</Text>}
          ListEmptyComponent={<Text style={styles.stateText}>没有找到匹配法官</Text>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`查看 ${item.judge_name || '未命名法官'} 的详情`}
              onPress={() => openJudge(item)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                <View style={styles.identity}>
                  <Text style={styles.name}>{item.judge_name || '未命名法官'}</Text>
                  <Text style={styles.court}>{item.court_name || [item.court_city, item.court_state].filter(Boolean).join(', ') || '法院待更新'}</Text>
                </View>
                <Text style={[styles.rate, item.adjudicated_approval_rate == null && styles.rateUnavailable]}>
                  {percent(item.adjudicated_approval_rate)}
                </Text>
              </View>
              <View style={styles.metrics}>
                <Text style={styles.metric}>裁决 {Number(item.total_asylum_decisions || 0).toLocaleString('zh-CN')}</Text>
                <Text style={styles.grant}>批准 {Number(item.grants || 0).toLocaleString('zh-CN')}</Text>
                <Text style={styles.denial}>拒绝 {Number(item.denials || 0).toLocaleString('zh-CN')}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <View style={styles.support}>
        <Pressable accessibilityRole="button" onPress={() => setShowPrivacy(true)}>
          <Text style={styles.supportLink}>隐私政策</Text>
        </Pressable>
        <Text style={styles.supportTitle}>客服与隐私联系</Text>
        <Pressable accessibilityRole="link" onPress={() => void openSupport('mailto:huarenfalv@gmail.com')}>
          <Text selectable style={styles.supportLink}>huarenfalv@gmail.com</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void openSupport('tel:+19297891391')}>
          <Text selectable style={styles.supportLink}>+1 929-789-1391</Text>
        </Pressable>
      </View>
      <Modal visible={showPrivacy} animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>隐私政策</Text>
            <Text style={styles.subtitle}>移民法官 AsylumJudge · {privacyUpdated}</Text>
            <Pressable accessibilityRole="button" onPress={() => setShowPrivacy(false)}>
              <Text style={styles.supportLink}>关闭，返回目录</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {privacySections.map(([heading, body]) => (
              <View key={heading} style={styles.card}>
                <Text accessibilityRole="header" style={styles.name}>{heading}</Text>
                <Text selectable style={styles.policyBody}>{body}</Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  policyBody: { color: '#526158', fontSize: 16, lineHeight: 26, marginTop: 8 },
  support: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#dce5df' },
  supportTitle: { color: '#526158', fontSize: 12 },
  supportLink: { color: '#14804a', fontSize: 14, paddingVertical: 12 },
  safeArea: { flex: 1, backgroundColor: '#f5f7f6' },
  header: { backgroundColor: '#ffffff', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 18, borderBottomColor: '#dce5df', borderBottomWidth: 1 },
  eyebrow: { color: '#14804a', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#122119', fontSize: 30, fontWeight: '800', marginTop: 3 },
  subtitle: { color: '#526158', fontSize: 14, marginTop: 4 },
  searchRow: { alignItems: 'center', backgroundColor: '#ffffff', flexDirection: 'row', gap: 8, padding: 14 },
  search: { backgroundColor: '#f1f5f2', borderColor: '#cbd8d0', borderRadius: 12, borderWidth: 1, flex: 1, fontSize: 16, minHeight: 48, paddingHorizontal: 14 },
  clear: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  clearText: { color: '#14804a', fontWeight: '700' },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  stateText: { color: '#526158', fontSize: 16, marginTop: 12, textAlign: 'center' },
  error: { color: '#9d2727', fontSize: 16, textAlign: 'center' },
  retry: { backgroundColor: '#14804a', borderRadius: 10, marginTop: 16, paddingHorizontal: 20, paddingVertical: 13 },
  retryText: { color: '#ffffff', fontWeight: '800' },
  list: { padding: 14, paddingBottom: 36 },
  count: { color: '#526158', fontSize: 13, marginBottom: 10 },
  card: { backgroundColor: '#ffffff', borderColor: '#dce5df', borderRadius: 14, borderWidth: 1, marginBottom: 10, padding: 15 },
  cardPressed: { opacity: 0.7 },
  cardTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  identity: { flex: 1 },
  name: { color: '#122119', fontSize: 17, fontWeight: '800' },
  court: { color: '#617068', fontSize: 13, marginTop: 4 },
  rate: { color: '#14804a', fontSize: 18, fontWeight: '900' },
  rateUnavailable: { color: '#7b8680', fontSize: 12 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metric: { color: '#526158', fontSize: 13 },
  grant: { color: '#14804a', fontSize: 13, fontWeight: '700' },
  denial: { color: '#a43a3a', fontSize: 13, fontWeight: '700' }
});

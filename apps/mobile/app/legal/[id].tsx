import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

type LegalRecord = {
  id: string;
  title?: string;
  docket?: string;
  citation?: string;
  issuingBody?: string;
  authorityType?: string;
  publicationDate?: string;
  sourceSystem?: string;
  officialUrl?: string;
  officialPdfUrl?: string;
};

type LegalAnalysis = {
  recordId: string;
  chineseTitle?: string;
  summary?: string;
  legalIssue?: string;
  holdingOrRule?: string;
  impact?: string;
  disclaimer?: string;
};

export default function LegalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<LegalRecord | null>(null);
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('https://trrb.net/data/legal/unified-legal-authorities-latest.json', { headers: { Accept: 'application/json' } }).then((r) => {
        if (!r.ok) throw new Error(`法律数据库 ${r.status}`);
        return r.json();
      }),
      fetch('https://trrb.net/data/legal/legal-ai-analysis-latest.json', { headers: { Accept: 'application/json' } }).then((r) => r.ok ? r.json() : ({ analyses: [] }))
    ])
      .then(([db, ai]) => {
        const rows = Array.isArray(db?.records) ? db.records : [];
        const analyses = Array.isArray(ai?.analyses) ? ai.analyses : [];
        setRecord(rows.find((item: LegalRecord) => String(item.id) === String(id)) || null);
        setAnalysis(analyses.find((item: LegalAnalysis) => String(item.recordId) === String(id)) || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '法律资料加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const shareUrl = useMemo(() => `https://trrb.net/legal/detail.html?id=${encodeURIComponent(String(id || ''))}`, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /></View>;
  if (error || !record) return <View style={styles.center}><Text style={styles.error}>{error || '未找到该法律资料'}</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{record.issuingBody || record.sourceSystem || '官方法律资料'}</Text>
      <Text style={styles.title}>{analysis?.chineseTitle || record.title || record.citation || '法律资料'}</Text>
      <Text style={styles.officialTitle}>{record.title || ''}</Text>
      <View style={styles.metaBox}>
        {record.docket ? <Text style={styles.meta}>案号：{record.docket}</Text> : null}
        {record.citation ? <Text style={styles.meta}>引证：{record.citation}</Text> : null}
        {record.publicationDate ? <Text style={styles.meta}>发布日期：{record.publicationDate}</Text> : null}
        {record.authorityType ? <Text style={styles.meta}>类型：{record.authorityType}</Text> : null}
      </View>

      {analysis ? (
        <View style={styles.analysis}>
          <Text style={styles.section}>中文解析</Text>
          {analysis.summary ? <><Text style={styles.label}>要旨</Text><Text style={styles.body}>{analysis.summary}</Text></> : null}
          {analysis.legalIssue ? <><Text style={styles.label}>法律问题</Text><Text style={styles.body}>{analysis.legalIssue}</Text></> : null}
          {analysis.holdingOrRule ? <><Text style={styles.label}>裁判 / 规则</Text><Text style={styles.body}>{analysis.holdingOrRule}</Text></> : null}
          {analysis.impact ? <><Text style={styles.label}>影响范围</Text><Text style={styles.body}>{analysis.impact}</Text></> : null}
          {analysis.disclaimer ? <Text style={styles.disclaimer}>{analysis.disclaimer}</Text> : null}
        </View>
      ) : (
        <View style={styles.analysis}><Text style={styles.section}>中文解析</Text><Text style={styles.muted}>该条目的中文内容尚未达到移动端展示标准，请以官方原文为准。</Text></View>
      )}

      <View style={styles.actions}>
        {record.officialUrl ? <Pressable style={styles.primary} onPress={() => Linking.openURL(record.officialUrl!)}><Text style={styles.primaryText}>查看官方原文</Text></Pressable> : null}
        <Pressable style={styles.secondary} onPress={() => Share.share({ title: record.title || '唐人日报法律资料', message: shareUrl, url: shareUrl })}><Text style={styles.secondaryText}>分享</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:20,paddingTop:58,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28},error:{color:'#b42318',textAlign:'center'},eyebrow:{color:'#c8211e',fontSize:14,fontWeight:'900'},title:{fontSize:28,lineHeight:38,fontWeight:'900',color:'#101828',marginTop:8},officialTitle:{fontSize:15,lineHeight:23,color:'#667085',marginTop:10},metaBox:{backgroundColor:'#fff',borderRadius:14,padding:16,marginTop:18,gap:6},meta:{fontSize:14,color:'#475467'},analysis:{backgroundColor:'#fff',borderRadius:16,padding:18,marginTop:16},section:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:12},label:{fontSize:15,fontWeight:'900',color:'#344054',marginTop:10,marginBottom:4},body:{fontSize:17,lineHeight:29,color:'#1d2939'},disclaimer:{fontSize:12,lineHeight:19,color:'#98a2b3',marginTop:16},muted:{color:'#667085',lineHeight:24},actions:{gap:10,marginTop:18},primary:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#fff',padding:15,borderRadius:12,alignItems:'center'},secondaryText:{color:'#344054',fontWeight:'900'}
});

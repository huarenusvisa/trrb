import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, SupportedLocale } from '../../src/i18n/i18n-core';

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

function formatLegalDate(value: string, locale: SupportedLocale): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeDateTag(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export default function LegalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locale, t } = useI18n();
  const [record, setRecord] = useState<LegalRecord | null>(null);
  const [analysis, setAnalysis] = useState<LegalAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('https://trrb.net/data/legal/unified-legal-authorities-latest.json', { headers: { Accept: 'application/json' } }).then((r) => {
        if (!r.ok) throw new Error(t('legal.databaseError', { status: r.status }));
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
      .catch((e) => setError(e instanceof Error ? e.message : t('legal.loadFailed')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const shareUrl = useMemo(() => `https://trrb.net/legal/detail.html?id=${encodeURIComponent(String(id || ''))}`, [id]);

  if (loading) return <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={t('legal.detailLoading')}><ActivityIndicator color="#c8211e" /><Text style={styles.muted}>{t('legal.detailLoading')}</Text></View>;
  if (error || !record) return <View style={styles.center} accessibilityRole="alert"><Text style={styles.error}>{error || t('legal.detailNotFound')}</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{record.issuingBody || record.sourceSystem || t('legal.officialSource')}</Text>
      <Text style={styles.title}>{analysis?.chineseTitle || record.title || record.citation || t('legal.detailFallbackTitle')}</Text>
      <Text style={styles.officialTitle}>{record.title || ''}</Text>
      <View style={styles.metaBox}>
        {record.docket ? <Text style={styles.meta}>{t('legal.detailDocket', { value: record.docket })}</Text> : null}
        {record.citation ? <Text style={styles.meta}>{t('legal.detailCitation', { value: record.citation })}</Text> : null}
        {record.publicationDate ? <Text style={styles.meta}>{t('legal.detailPublished', { value: formatLegalDate(record.publicationDate, locale) })}</Text> : null}
        {record.authorityType ? <Text style={styles.meta}>{t('legal.detailType', { value: record.authorityType })}</Text> : null}
      </View>

      {analysis ? (
        <View style={styles.analysis}>
          <Text style={styles.section}>{t('legal.detailChineseAnalysis')}</Text>
          {analysis.summary ? <><Text style={styles.label}>{t('legal.detailSummary')}</Text><Text style={styles.body}>{analysis.summary}</Text></> : null}
          {analysis.legalIssue ? <><Text style={styles.label}>{t('legal.detailIssue')}</Text><Text style={styles.body}>{analysis.legalIssue}</Text></> : null}
          {analysis.holdingOrRule ? <><Text style={styles.label}>{t('legal.detailRule')}</Text><Text style={styles.body}>{analysis.holdingOrRule}</Text></> : null}
          {analysis.impact ? <><Text style={styles.label}>{t('legal.detailImpact')}</Text><Text style={styles.body}>{analysis.impact}</Text></> : null}
          {analysis.disclaimer ? <Text style={styles.disclaimer}>{analysis.disclaimer}</Text> : null}
        </View>
      ) : (
        <View style={styles.analysis}><Text style={styles.section}>{t('legal.detailChineseAnalysis')}</Text><Text style={styles.muted}>{t('legal.detailAnalysisUnavailable')}</Text></View>
      )}

      <View style={styles.actions}>
        {record.officialUrl ? <Pressable accessibilityRole="link" accessibilityLabel={t('legal.detailOpenOfficialA11y')} style={styles.primary} onPress={() => Linking.openURL(record.officialUrl!)}><Text style={styles.primaryText}>{t('legal.detailOpenOfficial')}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('legal.detailShareA11y')} style={styles.secondary} onPress={() => Share.share({ title: record.title || t('legal.detailShareTitle'), message: shareUrl, url: shareUrl })}><Text style={styles.secondaryText}>{t('legal.detailShare')}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:20,paddingTop:58,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28},error:{color:'#b42318',textAlign:'center'},eyebrow:{color:'#c8211e',fontSize:14,fontWeight:'900'},title:{fontSize:28,lineHeight:38,fontWeight:'900',color:'#101828',marginTop:8},officialTitle:{fontSize:15,lineHeight:23,color:'#667085',marginTop:10},metaBox:{backgroundColor:'#fff',borderRadius:14,padding:16,marginTop:18,gap:6},meta:{fontSize:14,color:'#475467'},analysis:{backgroundColor:'#fff',borderRadius:16,padding:18,marginTop:16},section:{fontSize:22,fontWeight:'900',color:'#101828',marginBottom:12},label:{fontSize:15,fontWeight:'900',color:'#344054',marginTop:10,marginBottom:4},body:{fontSize:17,lineHeight:29,color:'#1d2939'},disclaimer:{fontSize:12,lineHeight:19,color:'#98a2b3',marginTop:16},muted:{color:'#667085',lineHeight:24},actions:{gap:10,marginTop:18},primary:{backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#fff',padding:15,borderRadius:12,alignItems:'center'},secondaryText:{color:'#344054',fontWeight:'900'}
});

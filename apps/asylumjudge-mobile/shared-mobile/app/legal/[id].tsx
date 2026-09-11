import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { useI18n } from '../../src/i18n/I18nProvider';
import { localeDateTag, SupportedLocale } from '../../src/i18n/i18n-core';
import { cacheLegalAnalyses, cacheLegalRecords, readCachedLegalAnalyses, readCachedLegalRecords } from '../../src/storage/legalCache';
import type { CachedLegalAnalysis as LegalAnalysis, CachedLegalRecord as LegalRecord } from '../../src/storage/legal-cache-core';

const LEGAL_URL = 'https://trrb.net/data/legal/unified-legal-authorities-latest.json';
const ANALYSIS_URL = 'https://trrb.net/data/legal/legal-ai-analysis-latest.json';
const REQUEST_TIMEOUT_MS = 12_000;

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);
  const actionInFlight = useRef(false);
  const [activeAction, setActiveAction] = useState<'official' | 'share' | null>(null);
  const [failedAction, setFailedAction] = useState<'official' | 'share' | null>(null);

  const selectRecord = useCallback((rows: LegalRecord[]) => rows.find((item) => String(item.id) === String(id)) || null, [id]);
  const selectAnalysis = useCallback((rows: LegalAnalysis[]) => rows.find((item) => String(item.recordId) === String(id)) || null, [id]);

  const load = useCallback(async (manual = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (manual) setRefreshing(true);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const requestJson = async (url: string) => {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(t('legal.databaseError', { status: response.status }));
      return response.json();
    };

    try {
      const [databaseResult, analysisResult] = await Promise.allSettled([requestJson(LEGAL_URL), requestJson(ANALYSIS_URL)]);
      if (!mounted.current || activeRequest.current !== controller) return;

      if (databaseResult.status === 'fulfilled') {
        const records = Array.isArray(databaseResult.value?.records) ? databaseResult.value.records as LegalRecord[] : [];
        setRecord(selectRecord(records));
        setError('');
        void cacheLegalRecords(records);
      } else {
        const cause = databaseResult.reason;
        setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : t('legal.loadFailed'));
      }

      if (analysisResult.status === 'fulfilled') {
        const analyses = Array.isArray(analysisResult.value?.analyses) ? analysisResult.value.analyses as LegalAnalysis[] : [];
        setAnalysis(selectAnalysis(analyses));
        void cacheLegalAnalyses(analyses);
      }
    } finally {
      clearTimeout(timer);
      if (mounted.current && activeRequest.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectAnalysis, selectRecord, t]);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([readCachedLegalRecords(), readCachedLegalAnalyses()]).then(([records, analyses]) => {
      if (!mounted.current) return;
      const cachedRecord = selectRecord(records || []);
      setRecord(cachedRecord);
      setAnalysis(selectAnalysis(analyses || []));
      if (cachedRecord) setLoading(false);
    }).finally(() => { if (mounted.current) void load(); });
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, [load, selectAnalysis, selectRecord]);

  useForegroundRetry(Boolean(error), () => void load());

  const shareUrl = useMemo(() => `https://trrb.net/legal/detail.html?id=${encodeURIComponent(String(id || ''))}`, [id]);

  const openOfficial = useCallback(async () => {
    const url = record?.officialUrl;
    if (!url || actionInFlight.current) return;
    actionInFlight.current = true;
    setActiveAction('official');
    setFailedAction(null);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Unsupported legal source URL');
      await Linking.openURL(url);
    } catch {
      if (mounted.current) {
        setFailedAction('official');
        AccessibilityInfo.announceForAccessibility(t('legal.detailOpenFailed'));
      }
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setActiveAction(null);
    }
  }, [record?.officialUrl, t]);

  const shareRecord = useCallback(async () => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActiveAction('share');
    setFailedAction(null);
    try {
      await Share.share({
        title: record?.title || t('legal.detailShareTitle'),
        message: shareUrl,
        url: shareUrl,
      });
    } catch {
      if (mounted.current) {
        setFailedAction('share');
        AccessibilityInfo.announceForAccessibility(t('legal.detailShareFailed'));
      }
    } finally {
      actionInFlight.current = false;
      if (mounted.current) setActiveAction(null);
    }
  }, [record?.title, shareUrl, t]);

  if (loading && !record) return <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={t('legal.detailLoading')}><ActivityIndicator color="#c8211e" /><Text style={styles.muted}>{t('legal.detailLoading')}</Text></View>;
  if (!record) return <View style={styles.center} accessibilityRole="alert"><Text style={styles.error}>{error || t('legal.detailNotFound')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('news.retry')} style={styles.retry} onPress={() => void load(true)}><Text style={styles.retryText}>{t('news.retry')}</Text></Pressable></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#c8211e" />}>
      {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.error}>{t('news.offline')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('news.retry')} style={styles.inlineRetry} onPress={() => void load(true)}><Text style={styles.retryText}>{t('news.retry')}</Text></Pressable></View> : null}
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
        {record.officialUrl ? <Pressable accessibilityRole="link" accessibilityLabel={t('legal.detailOpenOfficialA11y')} accessibilityState={{ disabled: activeAction !== null, busy: activeAction === 'official' }} disabled={activeAction !== null} style={[styles.primary, activeAction !== null && styles.actionDisabled]} onPress={() => void openOfficial()}><Text style={styles.primaryText}>{activeAction === 'official' ? t('legal.detailOpening') : t('legal.detailOpenOfficial')}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('legal.detailShareA11y')} accessibilityState={{ disabled: activeAction !== null, busy: activeAction === 'share' }} disabled={activeAction !== null} style={[styles.secondary, activeAction !== null && styles.actionDisabled]} onPress={() => void shareRecord()}><Text style={styles.secondaryText}>{activeAction === 'share' ? t('legal.detailSharing') : t('legal.detailShare')}</Text></Pressable>
      </View>
      {failedAction ? (
        <View testID="legal-action-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.actionError}>
          <Text style={styles.error}>{t(failedAction === 'official' ? 'legal.detailOpenFailed' : 'legal.detailShareFailed')}</Text>
          <Pressable
            testID="legal-action-retry"
            accessibilityRole="button"
            accessibilityLabel={t(failedAction === 'official' ? 'legal.detailRetryOpen' : 'legal.detailRetryShare')}
            accessibilityState={{ disabled: activeAction !== null, busy: activeAction !== null }}
            disabled={activeAction !== null}
            style={styles.actionRetry}
            onPress={() => void (failedAction === 'official' ? openOfficial() : shareRecord())}
          >
            <Text style={styles.retryText}>{t(failedAction === 'official' ? 'legal.detailRetryOpen' : 'legal.detailRetryShare')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:20,paddingTop:58,paddingBottom:50},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28},error:{color:'#b42318',lineHeight:22,textAlign:'center',flexShrink:1},
  errorBox:{backgroundColor:'#fef3f2',borderRadius:14,padding:12,marginBottom:16,alignItems:'flex-start'},retry:{minHeight:48,marginTop:12,justifyContent:'center',paddingHorizontal:18,backgroundColor:'#fff',borderRadius:12},inlineRetry:{minHeight:44,justifyContent:'center',paddingHorizontal:4},retryText:{color:'#b42318',fontWeight:'900'},
  eyebrow:{color:'#c8211e',fontSize:14,lineHeight:21,fontWeight:'900',flexShrink:1},title:{fontSize:28,lineHeight:38,fontWeight:'900',color:'#101828',marginTop:8,flexShrink:1},officialTitle:{fontSize:15,lineHeight:23,color:'#667085',marginTop:10,flexShrink:1},
  metaBox:{backgroundColor:'#fff',borderRadius:14,padding:16,marginTop:18,gap:6},meta:{fontSize:14,lineHeight:21,color:'#475467',flexShrink:1},analysis:{backgroundColor:'#fff',borderRadius:16,padding:18,marginTop:16},section:{fontSize:22,lineHeight:30,fontWeight:'900',color:'#101828',marginBottom:12,flexShrink:1},
  label:{fontSize:15,lineHeight:22,fontWeight:'900',color:'#344054',marginTop:10,marginBottom:4,flexShrink:1},body:{fontSize:17,lineHeight:29,color:'#1d2939',flexShrink:1},disclaimer:{fontSize:12,lineHeight:19,color:'#667085',marginTop:16,flexShrink:1},muted:{color:'#667085',lineHeight:24,textAlign:'center',flexShrink:1},
  actions:{gap:10,marginTop:18},primary:{minHeight:48,backgroundColor:'#c8211e',padding:15,borderRadius:12,alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900',textAlign:'center'},secondary:{minHeight:48,backgroundColor:'#fff',padding:15,borderRadius:12,alignItems:'center',justifyContent:'center'},secondaryText:{color:'#344054',fontWeight:'900',textAlign:'center'},actionDisabled:{opacity:0.6},actionError:{backgroundColor:'#fef3f2',borderRadius:14,padding:14,marginTop:12,alignItems:'flex-start'},actionRetry:{minHeight:44,justifyContent:'center',paddingHorizontal:4,marginTop:4}
});

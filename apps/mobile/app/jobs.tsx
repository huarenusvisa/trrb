import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Linking, Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { useForegroundRetry } from '../src/hooks/useForegroundRetry';
import { useI18n } from '../src/i18n/I18nProvider';
import { localeDateTag } from '../src/i18n/i18n-core';
import { withUiTimeout } from '../src/utils/async-state-core';
import { contactLabel, employmentTypeLabel, formatJobSalary } from '../src/jobs/job-presentation';
import { cacheJobs, readCachedJobs } from '../src/storage/jobsCache';
import { createBoundedJobsSnapshot, type CachedJob as Job, type CachedJobContact as Contact } from '../src/storage/jobs-cache-core';

const ENDPOINT = 'https://trrb.net/.netlify/functions/public-jobs?limit=40';

function formatCacheTime(savedAt: number, locale: 'zh-CN' | 'zh-TW' | 'en') {
  return new Intl.DateTimeFormat(localeDateTag(locale), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt));
}

function contactUrl(contact: Contact): string {
  return contact.type === 'phone' ? `tel:${contact.value}` : contact.type === 'email' ? `mailto:${contact.value}` : contact.value;
}

export default function JobsScreen() {
  const { locale, t } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const requestVersion = useRef(0);
  const contactInFlight = useRef(false);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [failedContact, setFailedContact] = useState<{ item: Job; action: string } | null>(null);

  const load = useCallback(async (refresh = false, announceSuccess = false) => {
    const version = ++requestVersion.current;
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await withUiTimeout(fetch(ENDPOINT, { headers: { Accept: 'application/json' } }), t('jobs.timeout'));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || t('jobs.httpFailed', { status: response.status }));
      if (version === requestVersion.current) {
        const nextItems = createBoundedJobsSnapshot(Array.isArray(payload?.items) ? payload.items : []);
        setItems(nextItems);
        setCachedAt(null);
        void cacheJobs(nextItems).catch(() => {});
        if (announceSuccess) AccessibilityInfo.announceForAccessibility(t('jobs.refreshSucceeded'));
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : t('jobs.loadFailed'));
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    let restored = false;
    let announceRefresh = false;
    void readCachedJobs().then(({ payload: cached, discardReason }) => {
      if (!active) return;
      if (discardReason === 'expired') {
        announceRefresh = true;
        AccessibilityInfo.announceForAccessibility(t('jobs.cacheExpired'));
      }
      if (!cached?.items.length) return;
      restored = true;
      announceRefresh = true;
      setItems(cached.items);
      setCachedAt(cached.savedAt);
      setLoading(false);
    }).catch(() => null).finally(() => {
      if (active) void load(restored, announceRefresh);
    });
    return () => {
      active = false;
      requestVersion.current += 1;
    };
  }, [load, t]);
  useForegroundRetry(Boolean(error), () => void load(Boolean(items.length), true));

  const openJobContact = useCallback(async (item: Job, action: string) => {
    const contact = item.contact;
    if (!contact?.value || contactInFlight.current) return;
    contactInFlight.current = true;
    setActiveContactId(item.id);
    setFailedContact(null);
    try {
      const url = contactUrl(contact);
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Unsupported job contact URL');
      await Linking.openURL(url);
    } catch {
      setFailedContact({ item, action });
      AccessibilityInfo.announceForAccessibility(t('jobs.contactFailed'));
    } finally {
      contactInFlight.current = false;
      setActiveContactId(null);
    }
  }, [t]);

  return <SafeAreaView style={styles.page}>
    <Stack.Screen options={{ title: t('jobs.screenTitle') }} />
    <FlatList
      contentContainerStyle={[styles.list, compact && styles.compactList]}
      data={items}
      keyExtractor={(item) => item.id}
      onRefresh={() => void load(true, true)}
      refreshing={refreshing}
      ListHeaderComponent={<>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('jobs.eyebrow')}</Text>
          <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{t('jobs.title')}</Text>
          <Text style={styles.subtitle}>{t('jobs.subtitle')}</Text>
        </View>
        {cachedAt && items.length ? <View testID="jobs-cache-notice" accessibilityLiveRegion="polite" style={styles.cacheNotice}><Text style={styles.cacheNoticeText}>{t('jobs.cachedAt', { time: formatCacheTime(cachedAt, locale) })}</Text></View> : null}
        {error && items.length ? <View testID="jobs-refresh-error" accessibilityRole="alert" style={styles.errorBanner}>
          <Text style={styles.errorTitle}>{t('jobs.refreshFailed')}</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('jobs.retryA11y')} style={styles.retry} onPress={() => void load(true, true)}><Text style={styles.retryText}>{t('jobs.retry')}</Text></Pressable>
        </View> : null}
      </>}
      renderItem={({ item }) => {
        const action = contactLabel(item.contact?.type, t);
        return <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.jobTitle}>{item.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.salary}>{formatJobSalary(item, locale, t)}</Text>
            <Text style={styles.pill}>{[item.city, item.state_code].filter(Boolean).join(' · ')}</Text>
            <Text style={styles.pill}>{employmentTypeLabel(item.employment_type, t)}</Text>
          </View>
          {item.description ? <Text numberOfLines={4} style={styles.description}>{item.description}</Text> : null}
          {item.contact?.value ? <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('jobs.contactA11y', { action, title: item.title })}
            accessibilityState={{ disabled: activeContactId !== null, busy: activeContactId === item.id }}
            disabled={activeContactId !== null}
            style={[styles.contact, activeContactId !== null && styles.contactDisabled]}
            onPress={() => void openJobContact(item, action)}
          >
            <Text style={styles.contactText}>{activeContactId === item.id ? t('jobs.contactOpening', { action }) : action}</Text>
          </Pressable> : null}
          {failedContact?.item.id === item.id ? <View testID={`job-contact-error-${item.id}`} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.contactError}>
            <Text style={styles.contactErrorText}>{t('jobs.contactFailed')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('jobs.retryContactA11y', { action: failedContact.action, title: item.title })}
              accessibilityState={{ disabled: activeContactId !== null, busy: activeContactId === item.id }}
              disabled={activeContactId !== null}
              style={styles.contactRetry}
              onPress={() => void openJobContact(failedContact.item, failedContact.action)}
            >
              <Text style={styles.retryText}>{t('jobs.retryContact')}</Text>
            </Pressable>
          </View> : null}
        </View>;
      }}
      ListEmptyComponent={loading
        ? <View testID="jobs-loading" accessibilityLiveRegion="polite" style={styles.state}><ActivityIndicator color="#1769d2" /><Text style={styles.stateText}>{t('jobs.loading')}</Text></View>
        : error
          ? <View testID="jobs-load-error" accessibilityRole="alert" style={styles.state}><Text style={styles.errorTitle}>{t('jobs.unavailable')}</Text><Text style={styles.errorDetail}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('jobs.retryA11y')} style={styles.retry} onPress={() => void load(false, true)}><Text style={styles.retryText}>{t('jobs.retry')}</Text></Pressable></View>
          : <Text testID="jobs-empty" style={styles.empty}>{t('jobs.empty')}</Text>}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f9fd' },
  list: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 12, paddingBottom: 28, gap: 10 },
  compactList: { paddingHorizontal: 8 },
  header: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 14 },
  eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '800', color: '#1769d2', marginBottom: 6 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '800', color: '#0f172a' },
  compactTitle: { fontSize: 25, lineHeight: 33 },
  subtitle: { marginTop: 6, color: '#64748b', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe5f1', borderRadius: 16, padding: 15, shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  jobTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 9, lineHeight: 25 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6, marginBottom: 8 },
  salary: { flexShrink: 1, backgroundColor: '#eff6ff', color: '#0f4fa7', fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, fontSize: 12, lineHeight: 18 },
  pill: { flexShrink: 1, backgroundColor: '#f1f5f9', color: '#475569', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, fontSize: 12, lineHeight: 18 },
  description: { color: '#536174', lineHeight: 21, marginBottom: 12 },
  contact: { alignSelf: 'stretch', minHeight: 48, backgroundColor: '#1769d2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  contactText: { color: '#fff', fontWeight: '800', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  contactDisabled: { opacity: 0.6 },
  contactError: { marginTop: 10, borderRadius: 10, backgroundColor: '#fff4f2', borderWidth: 1, borderColor: '#fecdca', padding: 12, alignItems: 'flex-start' },
  contactErrorText: { color: '#7a271a', lineHeight: 20 },
  contactRetry: { minHeight: 44, marginTop: 4, paddingHorizontal: 4, justifyContent: 'center' },
  cacheNotice: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 12, marginBottom: 10 },
  cacheNoticeText: { color: '#1e4f91', lineHeight: 20 },
  errorBanner: { backgroundColor: '#fff4f2', borderWidth: 1, borderColor: '#fecdca', borderRadius: 12, padding: 14, marginBottom: 10 },
  state: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  stateText: { color: '#475569', textAlign: 'center', lineHeight: 21 },
  errorTitle: { color: '#b42318', fontWeight: '800', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  errorDetail: { color: '#7a271a', marginTop: 4, lineHeight: 20, textAlign: 'center' },
  retry: { alignSelf: 'center', minHeight: 44, marginTop: 10, backgroundColor: '#1769d2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, justifyContent: 'center' },
  retryText: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  empty: { padding: 28, textAlign: 'center', color: '#64748b', lineHeight: 22 },
});

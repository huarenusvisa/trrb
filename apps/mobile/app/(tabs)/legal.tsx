import { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useI18n } from '../../src/i18n/I18nProvider';
import type { MessageKey } from '../../src/i18n/i18n-core';

const destinations: ReadonlyArray<{ labelKey: MessageKey; url: string }> = [
  { labelKey: 'home.portalJudgesSearch', url: 'https://asylumjudge.com/judge' },
  { labelKey: 'home.portalJudgesCourts', url: 'https://asylumjudge.com/courts' },
  { labelKey: 'home.portalJudgesStates', url: 'https://asylumjudge.com/states' },
  { labelKey: 'home.portalJudgesNationalities', url: 'https://asylumjudge.com/nationality' },
];

type FailedLink = { label: string; url: string };

export default function JudgePortalTabScreen() {
  const { t } = useI18n();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360;
  const largeText = fontScale >= 1.3;
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [failedLink, setFailedLink] = useState<FailedLink | null>(null);

  const openExternal = async (url: string, label: string) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setFailedLink(null);
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      setFailedLink({ label, url });
      AccessibilityInfo.announceForAccessibility(t('home.externalLinkFailed', { title: label }));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <ScrollView
      testID="screen-legal"
      style={styles.page}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
    >
      <Text accessibilityRole="header" style={[styles.heading, compact && styles.compactHeading]}>{t('home.portalJudgesTitle')}</Text>
      <Text style={styles.subtitle}>{t('home.portalJudgesBanner')}</Text>

      <Pressable
        testID="judge-portal-home"
        accessibilityRole="link"
        accessibilityLabel={t('home.openPortalA11y', { title: t('home.portalJudgesTitle') })}
        accessibilityState={{ disabled: opening, busy: opening }}
        disabled={opening}
        style={[styles.hero, opening && styles.disabled]}
        onPress={() => void openExternal('https://asylumjudge.com/', t('home.portalJudgesTitle'))}
      >
        <Text style={styles.heroTitle}>AsylumJudge.com</Text>
        <Text style={styles.heroAction}>{opening ? t('immigration.opening') : t('home.portalJudgesAction')} →</Text>
      </Pressable>

      {failedLink ? (
        <View testID="judge-portal-link-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorPanel}>
          <Text style={styles.errorText}>{t('home.externalLinkFailed', { title: failedLink.label })}</Text>
          <Pressable
            testID="judge-portal-link-retry"
            accessibilityRole="button"
            accessibilityLabel={t('home.retryExternal')}
            accessibilityState={{ disabled: opening, busy: opening }}
            disabled={opening}
            style={[styles.retryButton, opening && styles.disabled]}
            onPress={() => void openExternal(failedLink.url, failedLink.label)}
          >
            <Text style={styles.retryText}>{opening ? t('immigration.opening') : t('home.retryExternal')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.grid, (compact || largeText) && styles.stackedGrid]}>
        {destinations.map((destination) => {
          const label = t(destination.labelKey);
          return (
            <Pressable
              key={destination.url}
              accessibilityRole="link"
              accessibilityLabel={t('home.openPortalItemA11y', { item: label })}
              accessibilityState={{ disabled: opening, busy: opening }}
              disabled={opening}
              style={[styles.card, (compact || largeText) && styles.stackedCard, opening && styles.disabled]}
              onPress={() => void openExternal(destination.url, label)}
            >
              <Text style={styles.cardText}>{label}</Text>
              <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.arrow}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 96 },
  compactContent: { paddingHorizontal: 10 },
  heading: { color: '#101828', fontSize: 30, lineHeight: 38, fontWeight: '900' },
  compactHeading: { fontSize: 26, lineHeight: 34 },
  subtitle: { color: '#667085', fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 18 },
  hero: { minHeight: 112, borderRadius: 16, backgroundColor: '#c8211e', padding: 18, justifyContent: 'space-between', marginBottom: 14 },
  heroTitle: { color: '#fff', fontSize: 24, lineHeight: 32, fontWeight: '900' },
  heroAction: { color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '800' },
  errorPanel: { borderRadius: 12, borderWidth: 1, borderColor: '#fecdca', backgroundColor: '#fff4f2', padding: 13, marginBottom: 14, alignItems: 'flex-start' },
  errorText: { color: '#7a271a', lineHeight: 21 },
  retryButton: { minHeight: 44, borderRadius: 9, backgroundColor: '#c8211e', paddingHorizontal: 15, paddingVertical: 10, marginTop: 9, justifyContent: 'center' },
  retryText: { color: '#fff', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stackedGrid: { flexDirection: 'column' },
  card: { width: '48.5%', minHeight: 76, borderRadius: 13, backgroundColor: '#fff', paddingHorizontal: 15, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stackedCard: { width: '100%' },
  cardText: { flex: 1, color: '#101828', fontSize: 15, lineHeight: 22, fontWeight: '800' },
  arrow: { color: '#c8211e', fontSize: 26, lineHeight: 30, marginLeft: 8 },
  disabled: { opacity: 0.58 },
});

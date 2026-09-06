import { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useI18n } from '../../src/i18n/I18nProvider';
import type { MessageKey } from '../../src/i18n/i18n-core';

const BASE_URL = 'https://trrb.net/immigrate';

type Pathway = { key: string; titleKey: MessageKey; descriptionKey: MessageKey; topics: readonly [MessageKey, string][] };
type LinkFailure = { url: string; label: string };

const pathways: readonly Pathway[] = [
  { key: 'study', titleKey: 'home.portalImmigrationStudy', descriptionKey: 'immigration.studyDescription', topics: [['immigration.topicF1', 'f1'], ['immigration.topicJ1', 'j1'], ['immigration.topicCpt', 'cpt'], ['immigration.topicOpt', 'opt'], ['immigration.topicStemOpt', 'stem-opt']] },
  { key: 'work', titleKey: 'home.portalImmigrationWork', descriptionKey: 'immigration.workDescription', topics: [['immigration.topicH1b', 'h1b'], ['immigration.topicL1', 'l1'], ['immigration.topicO1', 'o1'], ['immigration.topicH2b', 'h2b'], ['immigration.topicR1', 'r1']] },
  { key: 'employment', titleKey: 'home.portalImmigrationEmployment', descriptionKey: 'immigration.employmentDescription', topics: [['immigration.topicEb1a', 'eb1a'], ['immigration.topicEb1c', 'eb1c'], ['immigration.topicNiw', 'niw'], ['immigration.topicEb3', 'eb3'], ['immigration.topicEb5', 'eb5']] },
  { key: 'family', titleKey: 'home.portalImmigrationFamily', descriptionKey: 'immigration.familyDescription', topics: [['immigration.topicCitizenSpouse', 'citizen-spouse'], ['immigration.topicF2a', 'f2a'], ['immigration.topicK1', 'k1'], ['immigration.topicParents', 'parents'], ['immigration.topicCr1', 'cr1-ir1']] },
  { key: 'humanitarian', titleKey: 'home.portalImmigrationHumanitarian', descriptionKey: 'immigration.humanitarianDescription', topics: [['immigration.topicAsylum', 'asylum'], ['immigration.topicWithholding', 'withholding'], ['immigration.topicCat', 'cat'], ['immigration.topicVawa', 'vawa'], ['immigration.topicSijs', 'sijs']] },
  { key: 'change-status', titleKey: 'home.portalImmigrationStatus', descriptionKey: 'immigration.statusDescription', topics: [['immigration.topicB2F1', 'b2-to-f1'], ['immigration.topicF1H1b', 'f1-to-h1b'], ['immigration.topicJ1Waiver', 'j1-waiver'], ['immigration.topicI485', 'i485'], ['immigration.topicEad', 'ead']] },
  { key: 'citizenship', titleKey: 'home.portalImmigrationCitizenship', descriptionKey: 'immigration.citizenshipDescription', topics: [['immigration.topicN400', 'n400'], ['immigration.topicContinuousResidence', 'continuous-residence'], ['immigration.topicPhysicalPresence', 'physical-presence'], ['immigration.topicTests', 'tests'], ['immigration.topicN600', 'n600']] },
];

function centerUrl(path: string, topic?: string) {
  const topicPart = topic ? `&topic=${encodeURIComponent(topic)}` : '';
  return `${BASE_URL}/center.html?path=${encodeURIComponent(path)}${topicPart}`;
}

export default function ImmigrationScreen() {
  const { t } = useI18n();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360;
  const largeText = fontScale >= 1.3;
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [linkFailure, setLinkFailure] = useState<LinkFailure | null>(null);

  const openExternal = async (url: string, label: string) => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setLinkFailure(null);
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      setLinkFailure({ url, label });
      AccessibilityInfo.announceForAccessibility(t('immigration.linkFailed', { title: label }));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <ScrollView testID="screen-immigration" style={styles.page} contentContainerStyle={[styles.content, compact && styles.compactContent]}>
      <View style={[styles.headingRow, (compact || largeText) && styles.headingStack]}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.h1}>{t('immigration.heading')}</Text>
          <Text style={styles.sub}>{t('immigration.subtitle')}</Text>
        </View>
        <Pressable accessibilityRole="link" accessibilityLabel={t('immigration.openAllA11y')} accessibilityState={{ disabled: opening }} disabled={opening} style={styles.allButton} onPress={() => void openExternal(`${BASE_URL}/`, t('immigration.openAll'))}>
          <Text style={styles.allButtonText}>{t('immigration.openAll')}</Text>
        </Pressable>
      </View>

      {linkFailure ? (
        <View testID="immigration-link-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.linkError}>
          <Text style={styles.linkErrorText}>{t('immigration.linkFailed', { title: linkFailure.label })}</Text>
          <Pressable
            testID="immigration-link-retry"
            accessibilityRole="button"
            accessibilityLabel={t('immigration.retryLink')}
            accessibilityState={{ disabled: opening }}
            disabled={opening}
            style={[styles.retryButton, opening && styles.buttonDisabled]}
            onPress={() => void openExternal(linkFailure.url, linkFailure.label)}
          >
            <Text style={styles.retryButtonText}>{opening ? t('immigration.opening') : t('immigration.retryLink')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.statsRow, (compact || largeText) && styles.statsWrap]}>
        <Text style={styles.statsStrong}>{t('immigration.centerCount')}</Text>
        <Text style={styles.statsText}>{t('immigration.synced')}</Text>
      </View>

      {pathways.map((pathway, index) => {
        const title = t(pathway.titleKey);
        return (
          <Pressable key={pathway.key} accessibilityRole="link" accessibilityLabel={t('immigration.openPathA11y', { title })} accessibilityState={{ disabled: opening }} disabled={opening} style={styles.card} onPress={() => void openExternal(centerUrl(pathway.key), title)}>
            <View style={styles.cardTop}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.arrow}>›</Text>
            </View>
            <Text style={styles.description}>{t(pathway.descriptionKey)}</Text>
            <View style={styles.topicRow}>
              {pathway.topics.map(([labelKey, slug]) => {
                const label = t(labelKey);
                return (
                  <Pressable key={slug} accessibilityRole="link" accessibilityLabel={t('immigration.openTopicA11y', { topic: label })} accessibilityState={{ disabled: opening }} disabled={opening} style={styles.topicChip} onPress={(event) => { event.stopPropagation(); void openExternal(centerUrl(pathway.key, slug), label); }}>
                    <Text style={styles.topicText}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.enter}>{t('immigration.enter')}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 96 },
  compactContent: { paddingHorizontal: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  headingStack: { flexDirection: 'column' },
  headingCopy: { flex: 1, minWidth: 0 },
  h1: { fontSize: 26, lineHeight: 34, fontWeight: '800', color: '#101828' },
  sub: { color: '#667085', fontSize: 13, lineHeight: 20, marginTop: 5 },
  allButton: { minHeight: 44, backgroundColor: '#101828', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  allButtonText: { color: '#fff', fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  linkError: { backgroundColor: '#fff1f0', borderRadius: 10, padding: 12, marginBottom: 12, alignItems: 'flex-start' },
  linkErrorText: { color: '#b42318', fontSize: 13, lineHeight: 20 },
  retryButton: { minHeight: 44, marginTop: 8, borderRadius: 8, backgroundColor: '#c8211e', paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  retryButtonText: { color: '#fff', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statsWrap: { flexWrap: 'wrap', alignItems: 'flex-start' },
  statsStrong: { color: '#c8211e', fontSize: 13, lineHeight: 20, fontWeight: '800' },
  statsText: { flexShrink: 1, color: '#667085', fontSize: 12, lineHeight: 19 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  number: { width: 30, color: '#c8211e', fontSize: 12, lineHeight: 24, fontWeight: '800' },
  title: { flex: 1, minWidth: 0, color: '#101828', fontSize: 17, lineHeight: 24, fontWeight: '800' },
  arrow: { color: '#98a2b3', fontSize: 26, lineHeight: 28, marginLeft: 6 },
  description: { color: '#667085', fontSize: 13, lineHeight: 20, marginTop: 9 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  topicChip: { minHeight: 44, maxWidth: '100%', backgroundColor: '#f5f6f8', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9, justifyContent: 'center' },
  topicText: { color: '#344054', fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  enter: { color: '#c8211e', fontSize: 13, lineHeight: 20, fontWeight: '800', marginTop: 11 },
});

import { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import JobsScreen from '../jobs';
import { useI18n } from '../../src/i18n/I18nProvider';

const JOBS_PORTAL_URL = 'https://huarengongzuo.com/';

export default function JobsTabScreen() {
  const { t } = useI18n();
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const openPortal = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setFailed(false);
    try {
      if (!await Linking.canOpenURL(JOBS_PORTAL_URL)) throw new Error('unsupported-url');
      await Linking.openURL(JOBS_PORTAL_URL);
    } catch {
      setFailed(true);
      AccessibilityInfo.announceForAccessibility(t('home.externalLinkFailed', { title: 'Huarengongzuo.com' }));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <View testID="screen-immigration" accessibilityLabel={t('tab.immigration')} style={styles.page}>
      <Pressable
        testID="jobs-portal-home"
        accessibilityRole="link"
        accessibilityLabel={t('home.openPortalA11y', { title: 'Huarengongzuo.com' })}
        accessibilityState={{ disabled: opening, busy: opening }}
        disabled={opening}
        style={[styles.portal, opening && styles.disabled]}
        onPress={() => void openPortal()}
      >
        <Text style={styles.portalBrand}>华人工作网 · Huarengongzuo.com</Text>
        <Text style={styles.portalAction}>{opening ? t('immigration.opening') : `${t('home.portalJobsAction')} →`}</Text>
      </Pressable>
      {failed ? <View testID="jobs-portal-link-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorRow}>
        <Text style={styles.errorText}>{t('home.externalLinkFailed', { title: 'Huarengongzuo.com' })}</Text>
        <Pressable testID="jobs-portal-link-retry" accessibilityRole="button" accessibilityLabel={t('home.retryExternal')} onPress={() => void openPortal()}><Text style={styles.retryText}>{t('home.retryExternal')}</Text></Pressable>
      </View> : null}
      <JobsScreen embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f9fd' },
  portal: { minHeight: 52, marginHorizontal: 12, marginTop: 8, borderRadius: 12, backgroundColor: '#1769d2', paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  portalBrand: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '800' },
  portalAction: { color: '#fff', fontSize: 12, lineHeight: 18, fontWeight: '800' },
  disabled: { opacity: 0.58 },
  errorRow: { marginHorizontal: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#fecdca', backgroundColor: '#fff4f2', padding: 10 },
  errorText: { color: '#7a271a', lineHeight: 20 },
  retryText: { color: '#b42318', minHeight: 44, paddingTop: 11, fontWeight: '800' },
});

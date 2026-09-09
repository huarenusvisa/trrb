import { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useI18n } from '../../src/i18n/I18nProvider';

const ASYLUM_JUDGE_URL = 'https://asylumjudge.com/';

function isAsylumJudgeUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'asylumjudge.com' || host === 'www.asylumjudge.com';
  } catch {
    return false;
  }
}

export default function JudgePortalTabScreen() {
  const { t } = useI18n();
  const webView = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);

  const openBrowser = async (url = ASYLUM_JUDGE_URL) => {
    try {
      if (!await Linking.canOpenURL(url)) throw new Error('unsupported-url');
      await Linking.openURL(url);
    } catch {
      AccessibilityInfo.announceForAccessibility(t('judgePortal.errorTitle'));
      setFailed(true);
    }
  };

  const allowNavigation = (request: WebViewNavigation) => {
    if (isAsylumJudgeUrl(request.url) || request.url === 'about:blank') return true;
    void openBrowser(request.url);
    return false;
  };

  if (Platform.OS === 'web') {
    return <SafeAreaView testID="screen-legal" style={styles.fallback}><Text style={styles.fallbackTitle}>AsylumJudge.com</Text><Text style={styles.fallbackBody}>{t('judgePortal.errorBody')}</Text><Pressable accessibilityRole="link" style={styles.primary} onPress={() => void openBrowser()}><Text style={styles.primaryText}>{t('judgePortal.openExternal')}</Text></Pressable></SafeAreaView>;
  }

  return (
    <SafeAreaView testID="screen-legal" edges={['top']} style={styles.page}>
      <View style={styles.toolbar}>
        <Text style={styles.brand}>AsylumJudge.com</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('judgePortal.reload')} style={styles.toolButton} onPress={() => { setFailed(false); webView.current?.reload(); }}><Text style={styles.toolText}>↻</Text></Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={t('judgePortal.openExternal')} style={styles.toolButton} onPress={() => void openBrowser()}><Text style={styles.toolText}>↗</Text></Pressable>
      </View>
      {failed ? <View testID="judge-portal-link-error" accessibilityRole="alert" style={styles.errorPanel}><Text style={styles.errorTitle}>{t('judgePortal.errorTitle')}</Text><Text style={styles.errorBody}>{t('judgePortal.errorBody')}</Text><View style={styles.errorActions}><Pressable testID="judge-portal-link-retry" accessibilityRole="button" style={styles.primary} onPress={() => { setFailed(false); webView.current?.reload(); }}><Text style={styles.primaryText}>{t('judgePortal.reload')}</Text></Pressable><Pressable accessibilityRole="link" style={styles.secondary} onPress={() => void openBrowser()}><Text style={styles.secondaryText}>{t('judgePortal.openExternal')}</Text></Pressable></View></View> : null}
      <WebView
        ref={webView}
        testID="judge-portal-webview"
        source={{ uri: ASYLUM_JUDGE_URL }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={allowNavigation}
        onLoadStart={() => setFailed(false)}
        onError={() => setFailed(true)}
        onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 400) setFailed(true); }}
        startInLoadingState
        renderLoading={() => <View style={styles.loading}><Text style={styles.loadingText}>{t('judgePortal.loading')}</Text></View>}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        style={styles.webView}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  toolbar: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#eaecf0', backgroundColor: '#fff' },
  brand: { flex: 1, color: '#101828', fontWeight: '900' },
  toolButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#f2f4f7' },
  toolText: { color: '#344054', fontSize: 20, fontWeight: '900' },
  webView: { flex: 1, backgroundColor: '#f4fbf7' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4fbf7' },
  loadingText: { color: '#35654a', fontWeight: '800' },
  errorPanel: { margin: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#fecdca', backgroundColor: '#fff4f2' },
  errorTitle: { color: '#b42318', fontSize: 18, fontWeight: '900' },
  errorBody: { color: '#7a271a', lineHeight: 21, marginTop: 6 },
  errorActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#c8211e' },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondary: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#d0d5dd', backgroundColor: '#fff' },
  secondaryText: { color: '#344054', fontWeight: '900' },
  fallback: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4fbf7' },
  fallbackTitle: { color: '#101828', fontSize: 28, fontWeight: '900' },
  fallbackBody: { color: '#667085', lineHeight: 22, textAlign: 'center', marginVertical: 12 },
});

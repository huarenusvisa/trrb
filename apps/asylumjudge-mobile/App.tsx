import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const HOME_URL = 'https://asylumjudge.com/';
const TRUSTED_HOSTS = new Set([
  'asylumjudge.com',
  'www.asylumjudge.com',
  'trrb.net',
  'www.trrb.net'
]);

function isTrustedWebUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && TRUSTED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function AsylumJudgeApp() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const goBack = useCallback(() => {
    if (!canGoBack) return false;
    webViewRef.current?.goBack();
    return true;
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const openUrl = useCallback((url: string) => {
    if (isTrustedWebUrl(url)) return true;

    if (/^(mailto:|tel:|sms:)/i.test(url) || /^https?:/i.test(url)) {
      void Linking.openURL(url);
    }
    return false;
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoadProgress(0);
    setReloadKey((value) => value + 1);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" backgroundColor="#ffffff" />

      {loadProgress > 0 && loadProgress < 1 ? (
        <View style={styles.progressTrack} accessibilityLabel="页面加载中">
          <View style={[styles.progressBar, { width: `${Math.max(8, loadProgress * 100)}%` }]} />
        </View>
      ) : null}

      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: HOME_URL }}
        style={styles.webView}
        originWhitelist={['https://*', 'mailto:*', 'tel:*', 'sms:*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        startInLoadingState
        applicationNameForUserAgent="AsylumJudgeMobile/1.0.1"
        onLoadStart={() => setFailed(false)}
        onLoadProgress={({ nativeEvent }) => setLoadProgress(nativeEvent.progress)}
        onLoadEnd={() => setLoadProgress(1)}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onShouldStartLoadWithRequest={(request) => openUrl(request.url)}
        onError={() => setFailed(true)}
        renderLoading={() => <View style={styles.loading} />}
      />

      {failed ? (
        <View style={styles.errorPanel} accessibilityRole="alert">
          <Text style={styles.errorTitle}>页面暂时无法打开</Text>
          <Text style={styles.errorText}>请检查网络连接，然后重新加载。</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="重新加载 AsylumJudge"
            onPress={retry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryPressed]}
          >
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AsylumJudgeApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  progressTrack: {
    height: 2,
    backgroundColor: '#e7ece9'
  },
  progressBar: {
    height: 2,
    backgroundColor: '#14804a'
  },
  loading: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  errorPanel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7f6',
    padding: 28
  },
  errorTitle: {
    color: '#102019',
    fontSize: 21,
    fontWeight: '800'
  },
  errorText: {
    color: '#5f6f67',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center'
  },
  retryButton: {
    minHeight: 48,
    minWidth: 144,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#14804a',
    marginTop: 22,
    paddingHorizontal: 24
  },
  retryPressed: {
    opacity: 0.82
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  }
});

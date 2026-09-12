import { useRef, useState } from 'react';
import { AccessibilityInfo, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useI18n } from '../i18n/I18nProvider';

type Props = { screenTestID: string; webViewTestID: string; brand: string; url: string; allowedHosts: string[]; loadingText: string; errorTitle: string; errorBody: string; accessibilityLabel?: string; injectedJavaScriptBeforeContentLoaded?: string };

export function WebPortalScreen({ screenTestID, webViewTestID, brand, url, allowedHosts, loadingText, errorTitle, errorBody, accessibilityLabel, injectedJavaScriptBeforeContentLoaded }: Props) {
  const { t } = useI18n();
  const webView = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const isAllowed = (value: string) => {
    if (value === 'about:blank') return true;
    try { const host = new URL(value).hostname.toLowerCase(); return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)); } catch { return false; }
  };
  const openBrowser = async (target = url) => {
    try { if (!await Linking.canOpenURL(target)) throw new Error('unsupported-url'); await Linking.openURL(target); }
    catch { AccessibilityInfo.announceForAccessibility(errorTitle); setFailed(true); }
  };
  const allowNavigation = (request: WebViewNavigation) => { if (isAllowed(request.url)) return true; void openBrowser(request.url); return false; };
  if (Platform.OS === 'web') return <SafeAreaView testID={screenTestID} style={styles.fallback}><Text style={styles.fallbackTitle}>{brand}</Text><Text style={styles.fallbackBody}>{errorBody}</Text><Pressable accessibilityRole="link" style={styles.primary} onPress={() => void openBrowser()}><Text style={styles.primaryText}>{t('judgePortal.openExternal')}</Text></Pressable></SafeAreaView>;
  return <SafeAreaView accessibilityLabel={accessibilityLabel} testID={screenTestID} edges={['top']} style={styles.page}>
    <View style={styles.toolbar}><Text numberOfLines={1} style={styles.brand}>{brand}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('judgePortal.reload')} style={styles.toolButton} onPress={() => { setFailed(false); webView.current?.reload(); }}><Text style={styles.toolText}>↻</Text></Pressable><Pressable accessibilityRole="link" accessibilityLabel={t('judgePortal.openExternal')} style={styles.toolButton} onPress={() => void openBrowser()}><Text style={styles.toolText}>↗</Text></Pressable></View>
    {failed ? <View testID={`${webViewTestID}-error`} accessibilityRole="alert" style={styles.errorPanel}><Text style={styles.errorTitle}>{errorTitle}</Text><Text style={styles.errorBody}>{errorBody}</Text><View style={styles.errorActions}><Pressable testID={`${webViewTestID}-retry`} accessibilityRole="button" style={styles.primary} onPress={() => { setFailed(false); webView.current?.reload(); }}><Text style={styles.primaryText}>{t('judgePortal.reload')}</Text></Pressable><Pressable accessibilityRole="link" style={styles.secondary} onPress={() => void openBrowser()}><Text style={styles.secondaryText}>{t('judgePortal.openExternal')}</Text></Pressable></View></View> : null}
    <WebView ref={webView} testID={webViewTestID} source={{ uri: url }} originWhitelist={['https://*']} onShouldStartLoadWithRequest={allowNavigation} onLoadStart={() => setFailed(false)} onError={() => setFailed(true)} onHttpError={({ nativeEvent }) => { if (nativeEvent.statusCode >= 400) setFailed(true); }} startInLoadingState renderLoading={() => <View style={styles.loading}><Text style={styles.loadingText}>{loadingText}</Text></View>} injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded} allowsBackForwardNavigationGestures setSupportMultipleWindows={false} style={styles.webView} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({ page:{flex:1,backgroundColor:'#fff'},toolbar:{minHeight:44,paddingHorizontal:10,flexDirection:'row',alignItems:'center',gap:7,borderBottomWidth:1,borderBottomColor:'#e4e7ec',backgroundColor:'#fff'},brand:{flex:1,color:'#101828',fontWeight:'900'},toolButton:{width:38,height:38,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#f2f4f7'},toolText:{color:'#344054',fontSize:19,fontWeight:'900'},webView:{flex:1,backgroundColor:'#f6f8fa'},loading:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center',backgroundColor:'#f6f8fa'},loadingText:{color:'#475467',fontWeight:'800'},errorPanel:{margin:12,padding:14,borderRadius:14,borderWidth:1,borderColor:'#fecdca',backgroundColor:'#fff4f2'},errorTitle:{color:'#b42318',fontSize:17,fontWeight:'900'},errorBody:{color:'#7a271a',lineHeight:21,marginTop:5},errorActions:{flexDirection:'row',flexWrap:'wrap',gap:9,marginTop:12},primary:{minHeight:44,paddingHorizontal:16,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#b4232d'},primaryText:{color:'#fff',fontWeight:'900',textAlign:'center'},secondary:{minHeight:44,paddingHorizontal:16,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff'},secondaryText:{color:'#344054',fontWeight:'900',textAlign:'center'},fallback:{flex:1,padding:24,alignItems:'center',justifyContent:'center',backgroundColor:'#f6f8fa'},fallbackTitle:{color:'#101828',fontSize:28,fontWeight:'900'},fallbackBody:{color:'#667085',lineHeight:22,textAlign:'center',marginVertical:12} });
